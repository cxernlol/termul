use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::sync::mpsc;

use super::decide::{
    self, Candidate, ChatHolder, LimitContext, LimitDecision, ResumePlan, SHORTEST_WINDOW,
};
use super::relaunch::Relaunch;
use super::schedule::{Schedule, ScheduledResume};
use super::{
    resume_notice, switch_notice, window_name, AccountRef, ClaudeLimitAction,
    ClaudeLimitActionEvent, Input, TurnClock, CLAUDE_CONFIG_ID,
};
use crate::acp::claude_accounts::usage::{ClaudeAccountUsage, ClaudeRateLimit, ClaudeUsageStatus};
use crate::acp::claude_accounts::ClaudeAccountsSnapshot;
use crate::acp::claude_agent::ClaudeLaunchAuth;
use crate::acp::config::{AgentId, SessionId};
use crate::acp::events::EVENT_CLAUDE_LIMIT_ACTION;
use crate::acp::{AcpManager, SignInCheck};
use crate::logging::redact_session_id;
use crate::web::WsRelaySink;

/// How long a due resume waits for the held turn it cancelled to end.
const CANCEL_WAIT: Duration = Duration::from_secs(10);

/// The agent repeats its usage update; each limit is handled once.
#[derive(PartialEq, Eq, Hash)]
struct Attempt {
    session_id: String,
    resets_at: Option<i64>,
    account_id: String,
}

pub(super) struct Supervisor {
    pub(super) acp: Arc<AcpManager>,
    pub(super) relay: Arc<WsRelaySink>,
    pub(super) schedule: Schedule,
    grace: Duration,
    pub(super) limited_until: HashMap<String, SystemTime>,
    attempts: HashSet<Attempt>,
    clock: Arc<TurnClock>,
}

impl Supervisor {
    pub(super) fn new(
        acp: Arc<AcpManager>,
        relay: Arc<WsRelaySink>,
        schedule: Schedule,
        grace: Duration,
        clock: Arc<TurnClock>,
    ) -> Self {
        Self {
            acp,
            relay,
            schedule,
            grace,
            limited_until: HashMap::new(),
            attempts: HashSet::new(),
            clock,
        }
    }

    pub(super) async fn run(mut self, mut inbox: mpsc::UnboundedReceiver<Input>) {
        loop {
            let wait = self.schedule.next_at().map(|at| {
                let due = epoch(at) + self.grace;
                due.duration_since(SystemTime::now()).unwrap_or_default()
            });
            // Inputs first: a turn, a close or a cancel that arrived with the
            // timer must reach the schedule before a resume acts on it.
            tokio::select! {
                biased;
                input = inbox.recv() => match input {
                    Some(input) => self.handle(input).await,
                    None => break,
                },
                () = sleep_or_forever(wait) => self.resume_due().await,
            }
        }
    }

    async fn handle(&mut self, input: Input) {
        match input {
            Input::Limit {
                agent_id,
                session_id,
                limit,
            } => self.on_limit(agent_id, session_id, limit).await,
            Input::SetResume {
                session_id,
                at,
                reply,
            } => {
                let _ = reply.send(self.set_resume(&session_id, at));
            }
            Input::TurnStarted { session_id, seq } => {
                self.drop_resume(&session_id, "a turn of the chat started", true);
                self.clock.settle(&session_id.0, seq);
            }
            Input::Closed {
                session_id,
                deleted,
            } => self.drop_resume(&session_id, "the chat was closed", !deleted),
            Input::AgentStopped { agent_id } => {
                log::debug!("[claude-limit] agent {agent_id} stopped");
                self.forget_unheld_recipes();
            }
        }
    }

    /// Forget the recipe of every chat whose agent stopped and that does not
    /// wait for a scheduled resume.
    fn forget_unheld_recipes(&self) {
        let schedule = &self.schedule;
        self.acp
            .forget_recipes_without_agent(|session_id| schedule.get(&session_id.0).is_some());
    }

    /// Drop the chat's scheduled resume; `announce` tells its clients.
    fn drop_resume(&mut self, session_id: &SessionId, why: &str, announce: bool) {
        let Some(entry) = self.schedule.remove(&session_id.0) else {
            return;
        };
        log::info!(
            "[claude-limit] scheduled resume of chat {} dropped: {why}",
            redact_session_id(&session_id.0)
        );
        self.forget_unheld_recipes();
        if announce {
            self.emit(
                session_id,
                &entry.project_id,
                ClaudeLimitAction::ResumeCancelled,
            );
        }
    }

    async fn on_limit(&mut self, agent_id: AgentId, session_id: SessionId, limit: ClaudeRateLimit) {
        let chat = redact_session_id(&session_id.0);
        let Some(launch) = self.acp.agent_launch(&agent_id) else {
            log::info!("[claude-limit] chat {chat} reached a limit on an agent the host did not launch for a client; skipped");
            return;
        };
        if launch.config.config_id.as_deref() != Some(CLAUDE_CONFIG_ID) {
            return;
        }
        let ClaudeLaunchAuth::Account(agent_account) = launch.claude else {
            log::info!("[claude-limit] chat {chat} reached a limit on credentials that no account switch changes; skipped");
            return;
        };
        let Some(project_id) = launch.project_id else {
            log::info!("[claude-limit] chat {chat} reached a limit outside a project; skipped");
            return;
        };
        let claude = self.acp.claude_agent();
        let snapshot = match claude.profile_list().await {
            Ok(snapshot) => snapshot,
            Err(error) => {
                log::warn!("[claude-limit] chat {chat}: could not read the accounts: {error}");
                return;
            }
        };
        let project_account = project_account(&snapshot, &project_id);
        let usage = if snapshot.auto_switch && agent_account == project_account {
            claude.accounts_usage(true).await.unwrap_or_else(|error| {
                log::warn!("[claude-limit] usage read failed: {error}");
                Vec::new()
            })
        } else {
            Vec::new()
        };
        let resets_at = limit
            .resets_at
            .or_else(|| primary_reset(usage.iter().find(|u| u.account_id == agent_account)));
        if !self.attempts.insert(Attempt {
            session_id: session_id.0.clone(),
            resets_at,
            account_id: agent_account.clone(),
        }) {
            return;
        }
        let now = SystemTime::now();
        self.limited_until.insert(
            agent_account.clone(),
            resets_at.map_or(now + SHORTEST_WINDOW, epoch),
        );
        let candidates = decide::rank_alternatives(&candidates(&snapshot, &usage, &agent_account));
        let decision = decide::decide(&LimitContext {
            agent_account: &agent_account,
            project_account: &project_account,
            auto_switch: snapshot.auto_switch,
            candidates: &candidates,
            limited_until: &self.limited_until,
            resets_at: resets_at.map(epoch),
            now,
        });
        log::info!("[claude-limit] chat {chat} reached its limit: {decision:?}");
        let window = window_name(limit.kind.as_deref());
        let name = |id: &str| account_ref(&snapshot, id);
        match decision {
            LimitDecision::Switch { to } => {
                let applied = claude
                    .set_project_account(
                        &project_id,
                        Some(&to),
                        Some(&agent_account),
                        SignInCheck::Required,
                    )
                    .await;
                match applied {
                    Ok(true) => {
                        let (from, to) = (name(&agent_account), name(&to));
                        let notice = switch_notice(&from.name, &to.name, window);
                        self.move_chat(&session_id, &project_id, &agent_id, from, to, notice)
                            .await;
                    }
                    Ok(false) => log::info!(
                        "[claude-limit] project of chat {chat} changed its account first; the chat continues there"
                    ),
                    Err(error) => {
                        log::warn!(
                            "[claude-limit] switching the project of chat {chat} failed: {}",
                            scrub(&error, &session_id)
                        );
                        self.emit(&session_id, &project_id, ClaudeLimitAction::Failed { reason: error });
                    }
                }
            }
            LimitDecision::Restart => {
                let (from, to) = (name(&agent_account), name(&project_account));
                let notice = switch_notice(&from.name, &to.name, window);
                self.move_chat(&session_id, &project_id, &agent_id, from, to, notice)
                    .await;
            }
            LimitDecision::ResumeAt { at } => {
                let at = epoch_secs(at);
                self.schedule.insert(ScheduledResume {
                    session_id: session_id.0.clone(),
                    project_id: project_id.clone(),
                    at,
                    account_id: Some(agent_account),
                    window: limit.kind,
                    turn_mark: self.clock.now(),
                });
                self.emit(
                    &session_id,
                    &project_id,
                    ClaudeLimitAction::ResumeScheduled { at: at * 1000 },
                );
            }
            LimitDecision::Ignore { .. } => {}
        }
    }

    fn set_resume(&mut self, session_id: &SessionId, at: Option<SystemTime>) -> Result<(), String> {
        let chat = redact_session_id(&session_id.0);
        match at {
            Some(at) => {
                let recipe = self
                    .acp
                    .launch_recipe(session_id)
                    .ok_or_else(|| "This chat is not open on the host.".to_string())?;
                let ClaudeLaunchAuth::Account(account_id) = recipe.launch.claude else {
                    return Err("This chat does not run on a Claude account Troupe manages.".to_string());
                };
                if recipe.launch.config.config_id.as_deref() != Some(CLAUDE_CONFIG_ID) {
                    return Err("This chat does not run on a Claude account Troupe manages.".to_string());
                }
                let project_id = recipe.launch.project_id.clone().unwrap_or_default();
                let at = epoch_secs(at);
                self.schedule.insert(ScheduledResume {
                    session_id: session_id.0.clone(),
                    project_id: project_id.clone(),
                    at,
                    account_id: Some(account_id),
                    window: None,
                    turn_mark: self.clock.now(),
                });
                log::info!("[claude-limit] chat {chat} continues at {at} (asked by a client)");
                self.emit(
                    session_id,
                    &project_id,
                    ClaudeLimitAction::ResumeScheduled { at: at * 1000 },
                );
            }
            None => self.drop_resume(session_id, "a client cancelled it", true),
        }
        Ok(())
    }

    async fn resume_due(&mut self) {
        let now = SystemTime::now()
            .checked_sub(self.grace)
            .unwrap_or(UNIX_EPOCH);
        while let Some(entry) = self.schedule.take_next_due(epoch_secs(now)) {
            self.resume(entry).await;
        }
    }

    /// A turn of the chat started after its resume was scheduled: the user or
    /// an automation continued it, so the resume must not touch that turn.
    fn turn_started_since(&self, entry: &ScheduledResume) -> bool {
        let started = self
            .clock
            .started_since(&entry.session_id, entry.turn_mark);
        if started {
            log::info!(
                "[claude-limit] chat {} started a turn after its resume was scheduled; left alone",
                redact_session_id(&entry.session_id)
            );
        }
        started
    }

    async fn resume(&mut self, entry: ScheduledResume) {
        let session_id = SessionId(entry.session_id.clone());
        let chat = redact_session_id(&entry.session_id);
        if self.acp.launch_recipe(&session_id).is_none() {
            log::warn!("[claude-limit] chat {chat} was due to continue, but the host restarted since; it continues when a client reopens it");
            self.emit(
                &session_id,
                &entry.project_id,
                ClaudeLimitAction::Failed {
                    reason: "The host restarted while this chat waited for its limit to reset. Send a message to continue."
                        .to_string(),
                },
            );
            return;
        }
        let cancelled = |this: &Self| {
            this.emit(
                &session_id,
                &entry.project_id,
                ClaudeLimitAction::ResumeCancelled,
            );
        };
        // Held before the owner is read, so a client reopen in flight lands
        // first and one that starts now waits for this resume.
        let mut moving = self.acp.begin_host_move(&session_id).await;
        let claude = self.acp.claude_agent();
        let snapshot = claude.profile_list().await.ok();
        let project_account = snapshot
            .as_ref()
            .map(|s| project_account(s, &entry.project_id));
        let owner = self.live_owner(&session_id, None).await;
        let from_agent_id = owner.as_ref().map(|agent| agent.0.clone()).or_else(|| {
            self.acp
                .persistence()?
                .metadata(&entry.session_id)
                .ok()?
                .runtime_agent_id
        });
        let launch = owner.as_ref().and_then(|agent| self.acp.agent_launch(agent));
        let holder = match (&owner, &launch) {
            (None, _) => ChatHolder::Nobody,
            (Some(_), Some(launch))
                if launch.config.config_id.as_deref() == Some(CLAUDE_CONFIG_ID) =>
            {
                match &launch.claude {
                    ClaudeLaunchAuth::Account(id) => ChatHolder::Account(id),
                    _ => ChatHolder::Other,
                }
            }
            (Some(_), _) => ChatHolder::Other,
        };
        let plan = decide::plan_resume(
            holder,
            entry.account_id.as_deref(),
            project_account.as_deref(),
        );
        log::info!("[claude-limit] chat {chat} is due to continue: {plan:?}");
        if plan == ResumePlan::Skip || self.turn_started_since(&entry) {
            cancelled(self);
            return;
        }
        let (agent_id, siblings) = match (plan, owner) {
            (ResumePlan::Continue, Some(agent)) => {
                if self
                    .acp
                    .is_turn_active(&agent, session_id.clone())
                    .await
                    .unwrap_or(false)
                {
                    // The turn the driver reports may be one that started
                    // since the check above.
                    if self.turn_started_since(&entry) {
                        cancelled(self);
                        return;
                    }
                    let _ = self.acp.cancel_prompt(&agent, session_id.clone()).await;
                    let _ = tokio::time::timeout(
                        CANCEL_WAIT,
                        self.acp.wait_turn_idle(&agent, session_id.clone()),
                    )
                    .await;
                }
                (agent, None)
            }
            (_, owner) => match self.relaunch(&mut moving, &session_id, owner.as_ref()).await {
                Ok(Relaunch::Done(relaunched)) => (relaunched.agent_id.clone(), Some(relaunched)),
                Ok(Relaunch::HeldElsewhere(holder)) => {
                    log::info!("[claude-limit] chat {chat} is open on agent {holder} now; left there");
                    cancelled(self);
                    return;
                }
                Err(reason) => {
                    log::warn!(
                        "[claude-limit] chat {chat} did not continue after the reset: {}",
                        scrub(&reason, &session_id)
                    );
                    self.emit(
                        &session_id,
                        &entry.project_id,
                        ClaudeLimitAction::Failed { reason },
                    );
                    self.forget_unheld_recipes();
                    return;
                }
            },
        };
        self.emit(
            &session_id,
            &entry.project_id,
            ClaudeLimitAction::Resumed {
                from_agent_id: from_agent_id.clone(),
                new_agent_id: agent_id.0.clone(),
            },
        );
        let account = match (&entry.account_id, &snapshot) {
            (Some(id), Some(snapshot)) => account_ref(snapshot, id).name,
            _ => "the account".to_string(),
        };
        let reset = chrono::DateTime::from_timestamp(entry.at, 0)
            .map_or_else(String::new, |at| at.format("%H:%M UTC").to_string());
        let notice = resume_notice(&account, window_name(entry.window.as_deref()), &reset);
        self.send_notice(&agent_id, &session_id, &notice).await;
        if let Some(relaunched) = siblings {
            let resumed = ClaudeLimitAction::Resumed {
                from_agent_id,
                new_agent_id: agent_id.0,
            };
            self.follow_siblings(&entry.project_id, relaunched, &resumed, &notice)
                .await;
        }
        drop(moving);
    }

    /// The live agent that holds the chat, other than `except`.
    pub(super) async fn live_owner(
        &self,
        session_id: &SessionId,
        except: Option<&AgentId>,
    ) -> Option<AgentId> {
        for agent in self.acp.list_agents() {
            if Some(&agent) == except {
                continue;
            }
            if self
                .acp
                .owns_session(&agent, session_id.clone())
                .await
                .unwrap_or(false)
            {
                return Some(agent);
            }
        }
        None
    }

    pub(super) fn emit(&self, session_id: &SessionId, project_id: &str, action: ClaudeLimitAction) {
        self.acp.record_session_event(
            &session_id.0,
            EVENT_CLAUDE_LIMIT_ACTION,
            &ClaudeLimitActionEvent {
                session_id: session_id.0.clone(),
                project_id: project_id.to_string(),
                action,
            },
        );
    }
}

/// `error` with the chat's id shortened, for the log.
pub(super) fn scrub(error: &str, session_id: &SessionId) -> String {
    if session_id.0.is_empty() {
        return error.to_string();
    }
    error.replace(&session_id.0, &redact_session_id(&session_id.0))
}

fn project_account(snapshot: &ClaudeAccountsSnapshot, project_id: &str) -> String {
    snapshot
        .project_profiles
        .get(project_id.trim())
        .unwrap_or(&snapshot.default_account_id)
        .clone()
}

fn account_ref(snapshot: &ClaudeAccountsSnapshot, id: &str) -> AccountRef {
    let name = snapshot
        .profiles
        .iter()
        .find(|account| account.id == id)
        .map_or_else(|| id.to_string(), |account| account.name.clone());
    AccountRef {
        id: id.to_string(),
        name,
    }
}

fn candidates(
    snapshot: &ClaudeAccountsSnapshot,
    usage: &[ClaudeAccountUsage],
    current: &str,
) -> Vec<Candidate> {
    snapshot
        .profiles
        .iter()
        .filter(|account| account.id != current)
        .map(|account| {
            let read = usage.iter().find(|u| u.account_id == account.id);
            Candidate {
                account_id: account.id.clone(),
                ready: account.signed_in == Some(true)
                    && read.is_none_or(|u| u.status != ClaudeUsageStatus::SignedOut),
                percent: most_used(read).map(|(percent, _)| percent),
            }
        })
        .collect()
}

fn most_used(usage: Option<&ClaudeAccountUsage>) -> Option<(f64, Option<&str>)> {
    let usage = usage.filter(|u| u.status == ClaudeUsageStatus::Ok)?;
    usage
        .windows
        .iter()
        .reduce(|top, w| if w.percent > top.percent { w } else { top })
        .map(|w| (w.percent, w.resets_at.as_deref()))
}

fn primary_reset(usage: Option<&ClaudeAccountUsage>) -> Option<i64> {
    let (_, reset) = most_used(usage)?;
    chrono::DateTime::parse_from_rfc3339(reset?)
        .ok()
        .map(|at| at.timestamp())
}

fn epoch(secs: i64) -> SystemTime {
    UNIX_EPOCH + Duration::from_secs(u64::try_from(secs).unwrap_or(0))
}

fn epoch_secs(at: SystemTime) -> i64 {
    at.duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

async fn sleep_or_forever(wait: Option<Duration>) {
    match wait {
        Some(wait) => tokio::time::sleep(wait).await,
        None => std::future::pending().await,
    }
}

#[cfg(test)]
#[path = "supervisor_tests.rs"]
mod tests;
