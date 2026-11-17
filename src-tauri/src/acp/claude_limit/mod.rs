//! The host acts when a managed Claude chat reaches its account's plan limit,
//! with or without a client connected: it moves that chat alone to the
//! signed-in account with the most room and continues it there, or continues
//! it when the limit resets. The renderer only shows what happened
//! (`acp:claude_limit_action`).

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tokio::sync::{mpsc, oneshot};

use crate::acp::claude_accounts::usage::ClaudeRateLimit;
use crate::acp::config::{AgentId, SessionId};
use crate::acp::events::{EVENT_AGENT_DISCONNECTED, EVENT_USAGE_UPDATE};
use crate::acp::AcpManager;
use crate::web::sink::{AcpEvent, EventSink};
use crate::web::WsRelaySink;

pub mod decide;
mod relaunch;
mod schedule;
mod supervisor;

pub const CLAUDE_CONFIG_ID: &str = "acp-registry:claude-acp";

pub const RESUME_GRACE: Duration = Duration::from_secs(15);

const SCHEDULE_FILE: &str = "claude-limit-resumes.json";

enum Input {
    Limit {
        agent_id: AgentId,
        session_id: SessionId,
        limit: ClaudeRateLimit,
    },
    SetResume {
        session_id: SessionId,
        at: Option<SystemTime>,
        reply: oneshot::Sender<Result<(), String>>,
    },
    /// The chat started turn `seq` of the [`TurnClock`]. Sent from the driver
    /// before the agent sees the prompt, so it arrives ahead of any limit
    /// that turn reaches.
    TurnStarted { session_id: SessionId, seq: u64 },
    /// The chat was closed, or deleted with its log.
    Closed { session_id: SessionId, deleted: bool },
    /// The agent stopped (killed, reaped or crashed).
    AgentStopped { agent_id: AgentId },
}

/// Numbers the turns of every chat. The supervisor acts on one input at a
/// time, so a `TurnStarted` can wait in its inbox while it resumes another
/// chat; it reads the clock instead, which the driver sets before the agent
/// sees the prompt.
#[derive(Default)]
pub(crate) struct TurnClock {
    /// The last turn number, and the last turn of each chat whose
    /// `TurnStarted` the supervisor has not handled yet.
    turns: parking_lot::Mutex<(u64, HashMap<String, u64>)>,
}

impl TurnClock {
    fn start(&self, session_id: &str) -> u64 {
        let mut turns = self.turns.lock();
        turns.0 += 1;
        let seq = turns.0;
        turns.1.insert(session_id.to_string(), seq);
        seq
    }

    /// The last turn number of any chat.
    pub(crate) fn now(&self) -> u64 {
        self.turns.lock().0
    }

    /// A turn of the chat started after `mark` (a [`Self::now`] reading).
    pub(crate) fn started_since(&self, session_id: &str, mark: u64) -> bool {
        self.turns
            .lock()
            .1
            .get(session_id)
            .is_some_and(|seq| *seq > mark)
    }

    /// The supervisor handled turn `seq`. A later turn keeps its entry until
    /// its own `TurnStarted` is handled.
    pub(crate) fn settle(&self, session_id: &str, seq: u64) {
        let mut turns = self.turns.lock();
        if turns.1.get(session_id) == Some(&seq) {
            turns.1.remove(session_id);
        }
    }
}

/// Accounts that reached a limit, until their reset. The supervisor marks
/// them; a new chat's Account pick reads them. A cached usage read can still
/// show room for an Account that just reached its limit.
#[derive(Default)]
pub(crate) struct LimitedAccounts(parking_lot::Mutex<HashMap<String, SystemTime>>);

impl LimitedAccounts {
    fn mark(&self, account_id: &str, until: SystemTime) {
        self.0.lock().insert(account_id.to_string(), until);
    }

    fn snapshot(&self) -> HashMap<String, SystemTime> {
        self.0.lock().clone()
    }
}

#[derive(Clone)]
pub struct ClaudeLimitHandle {
    tx: mpsc::UnboundedSender<Input>,
    clock: Arc<TurnClock>,
    limited: Arc<LimitedAccounts>,
}

pub struct ClaudeLimitInbox {
    rx: mpsc::UnboundedReceiver<Input>,
    clock: Arc<TurnClock>,
    limited: Arc<LimitedAccounts>,
}

impl ClaudeLimitHandle {
    #[must_use]
    pub fn channel() -> (Self, ClaudeLimitInbox) {
        let (tx, rx) = mpsc::unbounded_channel();
        let clock = Arc::new(TurnClock::default());
        let limited = Arc::new(LimitedAccounts::default());
        (
            Self {
                tx,
                clock: Arc::clone(&clock),
                limited: Arc::clone(&limited),
            },
            ClaudeLimitInbox { rx, clock, limited },
        )
    }

    /// The event sink that forwards limit signals. Add it to the manager's
    /// sinks.
    #[must_use]
    pub fn sink(&self) -> Arc<dyn EventSink> {
        Arc::new(LimitSignalSink {
            tx: self.tx.clone(),
        })
    }

    /// Continue the chat at `at`, or cancel its scheduled resume with `None`.
    pub async fn set_resume(
        &self,
        session_id: SessionId,
        at: Option<SystemTime>,
    ) -> Result<(), String> {
        let (reply, answer) = oneshot::channel();
        self.tx
            .send(Input::SetResume {
                session_id,
                at,
                reply,
            })
            .map_err(|_| "the Claude limit supervisor is not running".to_string())?;
        answer
            .await
            .map_err(|_| "the Claude limit supervisor stopped".to_string())?
    }

    /// A turn of the chat started: its scheduled resume no longer applies.
    pub fn turn_started(&self, session_id: SessionId) {
        let seq = self.clock.start(&session_id.0);
        let _ = self.tx.send(Input::TurnStarted { session_id, seq });
    }

    /// The chat closed, or was deleted with its log: drop its scheduled
    /// resume.
    pub fn chat_closed(&self, session_id: SessionId, deleted: bool) {
        let _ = self.tx.send(Input::Closed {
            session_id,
            deleted,
        });
    }
}

/// The Account of `candidates` with the most room for a new chat: the
/// ranking a chat at its limit moves by, skipping the Accounts the
/// supervisor saw reach a limit that has not reset. `None` when none has
/// room.
#[must_use]
pub fn roomiest_account(acp: &AcpManager, candidates: &[decide::Candidate]) -> Option<String> {
    let ranked = decide::rank_alternatives(candidates);
    let limited = acp
        .claude_limit()
        .map(|handle| handle.limited.snapshot())
        .unwrap_or_default();
    decide::first_with_room(&ranked, &limited, SystemTime::now()).cloned()
}

struct LimitSignalSink {
    tx: mpsc::UnboundedSender<Input>,
}

impl EventSink for LimitSignalSink {
    fn emit(&self, event: &AcpEvent) {
        if event.type_ == EVENT_AGENT_DISCONNECTED {
            if let Some(agent_id) = event.payload.get("agentId").and_then(|id| id.as_str()) {
                let _ = self.tx.send(Input::AgentStopped {
                    agent_id: AgentId(agent_id.to_string()),
                });
            }
            return;
        }
        if event.type_ != EVENT_USAGE_UPDATE {
            return;
        }
        let Some(limit) = event
            .payload
            .get("limitReached")
            .and_then(|value| serde_json::from_value::<ClaudeRateLimit>(value.clone()).ok())
        else {
            return;
        };
        if !limit.blocks_chat() {
            return;
        }
        let text = |key: &str| event.payload.get(key)?.as_str().map(str::to_string);
        let (Some(agent_id), Some(session_id)) = (text("agentId"), text("sessionId")) else {
            return;
        };
        let _ = self.tx.send(Input::Limit {
            agent_id: AgentId(agent_id),
            session_id: SessionId(session_id),
            limit,
        });
    }
}

pub fn start(
    acp: &Arc<AcpManager>,
    relay: &Arc<WsRelaySink>,
    handle: ClaudeLimitHandle,
    inbox: ClaudeLimitInbox,
    runtime: &tokio::runtime::Handle,
) {
    let path = acp
        .claude_agent()
        .state_dir()
        .map(|dir| dir.join(SCHEDULE_FILE));
    acp.set_claude_limit(handle);
    let ClaudeLimitInbox { rx, clock, limited } = inbox;
    let supervisor = supervisor::Supervisor::new(
        Arc::clone(acp),
        Arc::clone(relay),
        schedule::Schedule::load(path),
        RESUME_GRACE,
        clock,
        limited,
    );
    runtime.spawn(supervisor.run(rx));
    log::info!("[claude-limit] supervisor started");
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AccountRef {
    pub id: String,
    pub name: String,
}

/// Payload of `acp:claude_limit_action`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeLimitActionEvent {
    pub session_id: String,
    pub project_id: String,
    #[serde(flatten)]
    pub action: ClaudeLimitAction,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum ClaudeLimitAction {
    /// The chat continues on `to`, in a new agent.
    #[serde(rename_all = "camelCase")]
    Switched {
        from: AccountRef,
        to: AccountRef,
        from_agent_id: String,
        new_agent_id: String,
    },
    /// The chat continues at `at`, epoch milliseconds.
    ResumeScheduled {
        at: i64,
    },
    ResumeCancelled,
    #[serde(rename_all = "camelCase")]
    Resumed {
        from_agent_id: Option<String>,
        new_agent_id: String,
    },
    Failed {
        reason: String,
    },
}

#[must_use]
pub fn window_name(kind: Option<&str>) -> &'static str {
    match kind {
        Some("five_hour") => "5-hour",
        Some("seven_day") => "weekly",
        Some("seven_day_opus") => "Opus weekly",
        Some("seven_day_sonnet") => "Sonnet weekly",
        _ => "usage",
    }
}

#[must_use]
pub fn switch_notice(from: &str, to: &str, window: &str) -> String {
    format!(
        "Troupe moved this chat from Claude account {from} to {to} because {from} reached its \
         {window} limit. Continue the task you were working on. Subagents and background \
         commands that were running before the switch were stopped; restart the ones that are \
         still needed."
    )
}

#[must_use]
pub fn resume_notice(account: &str, window: &str, reset: &str) -> String {
    format!(
        "Troupe continued this chat because the {window} limit of Claude account {account} \
         reset at {reset}. Continue the task you were working on. Subagents and background \
         commands that were running when the limit was reached may have stopped; restart the \
         ones that are still needed."
    )
}

#[cfg(test)]
#[path = "real_loop_tests.rs"]
pub(crate) mod real_loop_tests;
