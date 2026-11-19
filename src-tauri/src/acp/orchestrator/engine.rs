//! The orchestrator engine: the one API the host MCP tools, the stop
//! interception and the chat/agent lifecycle hooks call. No wire types
//! cross it.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tokio::runtime::Handle;

use crate::acp::config::{AgentConfig, AgentId, SessionId};
use crate::acp::install::AcpInstallService;
use crate::acp::manager::{AcpManager, ChildOrigin, SessionCreationContext};
use crate::acp::orchestrator::lifecycle::{now_millis, ChildLease};
use crate::acp::orchestrator::run::{
    bounded, AgentListing, CallerRef, ChildRun, RunBody, RunCapture, RunEnd, RunId, RunLedger,
    RunLookupError, RunSummary, StartError, StartRequest, Starting, StopError, StopOutcome,
    WaitOutcome,
};
use crate::acp::orchestrator::settings::{OrchestratorSettings, SettingsInput, SettingsStore};
use crate::acp::orchestrator::sinks::{RerouteFilter, RunWatcher};
use crate::acp::subagents::{SubagentAgent, SubagentWorkspace, SubagentWorkspaceMode};
use crate::automation::agents::{self, AgentRegistry};
use crate::web::EventSink;

/// How long `start` may take end to end; every step below it has its own
/// bound, so reaching this means a wedged host.
const SPAWN_BOUND: Duration = Duration::from_secs(120);
/// `subagent_start` task length bound.
const MAX_TASK_CHARS: usize = 8_000;
/// The config id prefix the renderer saves a catalog agent under: the
/// installed agent `x` is the registry's `acp-registry:x`.
const REGISTRY_PREFIX: &str = "acp-registry:";

pub struct OrchestratorEngine {
    pub(super) manager: Arc<AcpManager>,
    registry: AgentRegistry,
    installed: Option<Arc<AcpInstallService>>,
    settings: SettingsStore,
    pub(super) ledger: Mutex<RunLedger>,
    pub(super) handle: Handle,
}

impl OrchestratorEngine {
    pub(crate) fn new(
        manager: Arc<AcpManager>,
        data_dir: PathBuf,
        installed: Option<Arc<AcpInstallService>>,
        handle: Handle,
    ) -> Self {
        let engine = Self {
            registry: AgentRegistry::open(data_dir.join(agents::FILE_NAME)),
            installed,
            settings: SettingsStore::open(&data_dir),
            ledger: Mutex::new(RunLedger::new()),
            manager,
            handle,
        };
        engine.migrate_bare_switches();
        engine
    }

    /// Switches were once saved under an installed agent's bare id: any key
    /// without the config-id prefix that the registry lacks, since registry
    /// keys are never removed. An agent the registry lacked had only that
    /// row, so its switch moves to the config id. An agent the registry knew
    /// also had its own row, which the bare switch never applied to, so that
    /// switch is dropped. The move applies in memory even when it cannot be
    /// saved, and a later registry record or install cannot lift a block.
    /// An unreadable registry cannot tell the two apart, so the move waits
    /// for a start that reads it.
    fn migrate_bare_switches(&self) {
        if !self.registry.loaded() {
            log::warn!("[orchestrator] known agents unreadable; bare sub-agent switches kept");
            return;
        }
        let moved = self.settings.apply_and_save(|settings| {
            let bare: Vec<String> = settings
                .agents
                .keys()
                .filter(|id| !id.starts_with(REGISTRY_PREFIX) && !self.registry.contains(id))
                .cloned()
                .collect();
            for id in bare {
                let Some(allowed) = settings.agents.remove(&id) else {
                    continue;
                };
                let key = format!("{REGISTRY_PREFIX}{id}");
                if !self.registry.contains(&key) {
                    settings.agents.entry(key).or_insert(allowed);
                }
            }
        });
        if let Err(error) = moved {
            log::warn!("[orchestrator] could not save the moved sub-agent switches: {error}");
        }
    }

    /// The launchable agents: the known-agents registry merged with the
    /// installed overlay, one entry per config id, `allowed` and
    /// `default_model` from the settings. Command, args and env never leave
    /// the host.
    pub fn list_agents(&self) -> Vec<AgentListing> {
        let settings = self.settings.get();
        self.registry.reload();
        let listing = |agent_id: String, name: String| AgentListing {
            allowed: self.allowed(&settings, &agent_id),
            default_model: settings.models.get(&agent_id).cloned(),
            agent_id,
            name,
        };
        let mut agents: Vec<AgentListing> = self
            .registry
            .list()
            .into_iter()
            .map(|known| listing(known.agent_id, known.name))
            .collect();
        if let Some(installed) = &self.installed {
            for agent in installed.installed_agents() {
                let key = format!("{REGISTRY_PREFIX}{}", agent.agent_id);
                if !agents.iter().any(|known| known.agent_id == key) {
                    agents.push(listing(key, agent.agent_id));
                }
            }
        }
        agents.sort_by(|a, b| a.agent_id.cmp(&b.agent_id));
        agents
    }

    /// Whether the settings allow the listing key `key`. While an unreadable
    /// registry holds back the move of bare switches, a bare block still
    /// refuses its config id; the next start that reads the registry moves it.
    fn allowed(&self, settings: &OrchestratorSettings, key: &str) -> bool {
        settings.agents.get(key).copied().unwrap_or_else(|| {
            self.registry.loaded()
                || key
                    .strip_prefix(REGISTRY_PREFIX)
                    .and_then(|bare| settings.agents.get(bare))
                    .copied()
                    .unwrap_or(true)
        })
    }

    /// The listing key `agent` names: a bare catalog id the registry does
    /// not know is the installed agent's `acp-registry:` config id.
    pub(crate) fn canonical_agent(&self, agent: &str) -> String {
        self.registry.reload();
        let installed = self.installed.as_ref().is_some_and(|installed| {
            installed
                .installed_agents()
                .iter()
                .any(|known| known.agent_id == agent)
        });
        if installed && !self.registry.contains(agent) {
            format!("{REGISTRY_PREFIX}{agent}")
        } else {
            agent.to_string()
        }
    }

    /// The run the caller's session belongs to (the spawning run of a
    /// nested call), with the ids a new run derives from it.
    fn caller_context(&self, caller: &CallerRef) -> (String, Option<RunId>, AgentId, u8) {
        let ledger = self.ledger.lock();
        if let Some(parent) = ledger.run_with_session(caller) {
            return (
                parent.root.clone(),
                Some(parent.run.clone()),
                parent.parent_agent.clone(),
                parent.depth + 1,
            );
        }
        (caller.session.0.clone(), None, caller.agent.clone(), 1)
    }

    /// The root of the caller's chat: the root of its run, else the session
    /// itself. Lookups of another chat's run answer `NotFound`.
    fn caller_root(&self, caller: &CallerRef) -> String {
        let ledger = self.ledger.lock();
        ledger
            .run_with_session(caller)
            .map(|run| run.root.clone())
            .unwrap_or_else(|| caller.session.0.clone())
    }

    /// Resolve the launch config of `agent`: the known-agents registry
    /// first, then the installed-agents overlay.
    fn resolve_agent(&self, agent: &str) -> Result<AgentConfig, StartError> {
        // The spawn path records launch configs into the automation
        // service's registry; read the file it writes, not a startup copy.
        self.registry.reload();
        if let Some(config) = self.registry.resolve(agent) {
            return Ok(config);
        }
        if let Some(installed) = &self.installed {
            let registry_id = agent.strip_prefix(REGISTRY_PREFIX).unwrap_or(agent);
            if let Some(config) = installed
                .installed_agents()
                .into_iter()
                .find(|known| known.agent_id == registry_id)
                .map(|known| AgentConfig {
                    config_id: Some(format!("{REGISTRY_PREFIX}{}", known.agent_id)),
                    name: known.agent_id,
                    command: known.command,
                    args: known.args,
                    env: std::collections::HashMap::new(),
                    allow_terminal: false,
                })
            {
                return Ok(config);
            }
        }
        Err(StartError::UnknownAgent(agent.to_string()))
    }

    /// The caller session's workspace root, from the caller agent's
    /// authoritative session roots.
    async fn caller_cwd(&self, caller: &CallerRef) -> Result<String, StartError> {
        let roots = self
            .manager
            .agent_session_roots(&caller.agent)
            .await
            .map_err(|_| StartError::InvalidInput("session"))?;
        roots
            .into_iter()
            .find(|(session, _)| *session == caller.session.0)
            .map(|(_, root)| root.to_string_lossy().into_owned())
            .ok_or(StartError::InvalidInput("session"))
    }

    /// The project of the chat the run renders in.
    fn project_id(&self, root: &str) -> Option<String> {
        let persistence = self.manager.persistence()?;
        let metadata = persistence.metadata(root).ok()?;
        metadata
            .project_id
            .filter(|project| !project.is_empty())
            .clone()
    }

    fn checks(&self, caller: &CallerRef, req: &StartRequest) -> Result<StartChecks, StartError> {
        let settings = self.settings.get();
        if !settings.enabled {
            return Err(StartError::Disabled);
        }
        let agent = req.agent.trim();
        if agent.is_empty() || agent.len() > crate::acp::subagents::MAX_ID_CHARS {
            return Err(StartError::InvalidInput("agent"));
        }
        let agent = self.canonical_agent(agent);
        let task_chars = req.task.chars().count();
        if task_chars == 0 || task_chars > MAX_TASK_CHARS {
            return Err(StartError::InvalidInput("task"));
        }
        if req
            .title
            .as_deref()
            .is_some_and(|title| title.trim().is_empty() || title.chars().count() > 512)
        {
            return Err(StartError::InvalidInput("title"));
        }
        if req
            .model
            .as_deref()
            .is_some_and(|model| model.trim().is_empty() || model.chars().count() > 512)
        {
            return Err(StartError::InvalidInput("model"));
        }
        if !self.allowed(&settings, &agent) {
            return Err(StartError::AgentNotAllowed(agent));
        }
        let (root, parent_run, parent_agent, depth) = self.caller_context(caller);
        if depth > settings.max_depth {
            return Err(StartError::Depth {
                max: settings.max_depth,
            });
        }
        let config = self.resolve_agent(&agent)?;
        let model = req
            .model
            .clone()
            .or_else(|| settings.models.get(&agent).cloned());
        Ok(StartChecks {
            root,
            parent_run,
            parent_agent,
            depth,
            config,
            model,
            settings,
        })
    }

    pub async fn start(
        self: &Arc<Self>,
        caller: CallerRef,
        req: StartRequest,
    ) -> Result<RunSummary, StartError> {
        self.start_until(caller, req, tokio_util::sync::CancellationToken::new())
            .await
    }

    /// [`start`](Self::start), given up when `abandoned` fires (the tool
    /// caller hung up): the start is cancelled and cleaned up like one a
    /// closing chat cancels, so no child runs that nobody holds the id of.
    pub async fn start_until(
        self: &Arc<Self>,
        caller: CallerRef,
        req: StartRequest,
        abandoned: tokio_util::sync::CancellationToken,
    ) -> Result<RunSummary, StartError> {
        let checks = self.checks(&caller, &req)?;
        let reservation = self.reserve(&checks, &abandoned)?;
        let run = Arc::new(reservation.run.clone());
        let cancel = reservation.cancel.clone();
        let progress: Arc<Mutex<StartProgress>> = Arc::default();
        let start = {
            let engine = self.clone();
            let run = Arc::clone(&run);
            let progress = Arc::clone(&progress);
            let caller = caller.clone();
            let req = req.clone();
            async move {
                engine
                    .start_inner(&caller, &req, checks, run, progress)
                    .await
            }
        };
        // A timeout or a cancel drops `start_inner` at an await point; every
        // failure, wherever it happened, is cleaned up below.
        let outcome = tokio::select! {
            biased;
            outcome = tokio::time::timeout(SPAWN_BOUND, start) => outcome.unwrap_or_else(|_| {
                Err(StartError::SpawnFailed("starting the subagent timed out".to_string()))
            }),
            () = cancel.cancelled() => Err(StartError::SpawnFailed(
                "the subagent was stopped while it was starting".to_string(),
            )),
        };
        if let Err(error) = &outcome {
            let end = if cancel.is_cancelled() {
                RunEnd::Cancelled
            } else {
                RunEnd::Failed(bounded(&error.to_string(), 512))
            };
            self.abort_start(&run, &progress, end).await;
        }
        drop(reservation);
        outcome
    }

    /// Take a capacity slot for a new run of the checked chat: the check
    /// and the claim happen under one lock, so parallel starts cannot both
    /// pass it. The slot is released when the returned reservation drops.
    fn reserve(
        self: &Arc<Self>,
        checks: &StartChecks,
        abandoned: &tokio_util::sync::CancellationToken,
    ) -> Result<Reservation, StartError> {
        let mut ledger = self.ledger.lock();
        let max = checks.settings.max_running;
        if ledger.occupied_of_root(&checks.root) >= max as usize {
            return Err(StartError::Capacity { max });
        }
        let run = loop {
            let candidate = RunId::mint();
            if !ledger.runs.contains_key(&candidate) && !ledger.starting.contains_key(&candidate) {
                break candidate;
            }
        };
        let cancel = abandoned.child_token();
        ledger.starting.insert(
            run.clone(),
            Starting {
                root: checks.root.clone(),
                parent_agent: checks.parent_agent.clone(),
                cancel: cancel.clone(),
            },
        );
        Ok(Reservation {
            engine: self.clone(),
            run,
            cancel,
        })
    }

    async fn start_inner(
        self: &Arc<Self>,
        caller: &CallerRef,
        req: &StartRequest,
        checks: StartChecks,
        run: Arc<RunId>,
        progress: Arc<Mutex<StartProgress>>,
    ) -> Result<RunSummary, StartError> {
        let StartChecks {
            root,
            parent_run,
            parent_agent,
            depth,
            config,
            model,
            ..
        } = checks;
        let agent_name = config.name.clone();
        let config_id = config.config_id.clone();
        let cwd = self.caller_cwd(caller).await?;
        let (workspace, base_commit) = match req.workspace {
            SubagentWorkspaceMode::Shared => (
                SubagentWorkspace {
                    mode: SubagentWorkspaceMode::Shared,
                    path: None,
                    branch: None,
                    base: None,
                    diff_stat: None,
                },
                None,
            ),
            SubagentWorkspaceMode::Worktree => {
                // On its own task: git keeps working when a cancel or timeout
                // drops this start, so the task, not this future, hands the
                // worktree over (or removes it, when the start was abandoned).
                let prepare = {
                    let cwd = cwd.clone();
                    let run = (*run).clone();
                    let progress = Arc::clone(&progress);
                    tokio::spawn(async move {
                        let prepared = crate::acp::orchestrator::worktree::prepare(&cwd, &run).await?;
                        if let (Some(path), Some(branch)) =
                            (&prepared.workspace.path, &prepared.workspace.branch)
                        {
                            let made = (cwd.clone(), path.clone(), branch.clone());
                            let abandoned = {
                                let mut progress = progress.lock();
                                if !progress.abandoned {
                                    progress.worktree = Some(made.clone());
                                }
                                progress.abandoned
                            };
                            if abandoned {
                                crate::acp::orchestrator::worktree::discard(made.0, made.1, made.2)
                                    .await;
                                return Err("the start was abandoned".to_string());
                            }
                        }
                        Ok(prepared)
                    })
                };
                match prepare.await {
                    Ok(Ok(prepared)) => (prepared.workspace, prepared.base_commit),
                    Ok(Err(error)) => return Err(StartError::WorkspaceUnavailable(error)),
                    Err(error) => return Err(StartError::WorkspaceUnavailable(error.to_string())),
                }
            }
        };
        let capture = Arc::new(RunCapture::default());
        let sinks: Vec<Arc<dyn EventSink>> = vec![
            Arc::new(RerouteFilter::new(root.clone(), self.manager.sinks().to_vec())),
            Arc::new(RunWatcher::new(
                self.clone(),
                (*run).clone(),
                capture.clone(),
            )),
        ];
        let run_log = crate::logging::redact_session_id(run.as_str());
        let chat_log = crate::logging::redact_session_id(&root);
        log::info!(
            "[orchestrator] run {run_log} starting in chat {chat_log} (depth {depth})"
        );
        let project_id = self.project_id(&root);
        let spawned = self
            .manager
            .spawn_private(
                config,
                project_id.as_deref(),
                // The chat's own Claude account, as its agent runs on.
                &crate::acp::claude_agent::LaunchChat::Existing(SessionId(root.clone())),
                sinks,
            )
            .await
            .map_err(|error| {
                log::warn!("[orchestrator] agent {agent_name} spawn failed: {error}");
                StartError::SpawnFailed(error)
            })?;
        progress.lock().child = Some(spawned.agent_id.clone());
        let child_agent = spawned.agent_id;
        let parent_dispatch_id = parent_run.as_ref().map(|parent| parent.dispatch_id());
        let entry = ChildRun {
            run: (*run).clone(),
            root: root.clone(),
            parent_agent,
            parent_run,
            depth,
            identity: SubagentAgent {
                name: agent_name.clone(),
                config_id,
                agent_id: child_agent.0.clone(),
            },
            title: req.title.clone().unwrap_or_else(|| agent_name.clone()),
            task: req.task.clone(),
            model: model.clone(),
            created_ms: now_millis(),
            workspace,
            base_commit,
            body: RunBody::Spawning {
                child_agent: child_agent.clone(),
            },
            result: None,
            waiters: Vec::new(),
            capture,
        };
        self.ledger.lock().insert(entry);

        let child_cwd = match self.ledger.lock().runs.get(&run) {
            Some(entry) if entry.workspace.mode == SubagentWorkspaceMode::Worktree => {
                entry.workspace.path.clone().unwrap_or_else(|| cwd.clone())
            }
            _ => cwd.clone(),
        };
        let origin = ChildOrigin {
            root_session_id: root.clone(),
            parent_session_id: caller.session.0.clone(),
            parent_dispatch_id,
            dispatch_id: run.dispatch_id(),
            depth,
        };
        let created = self
            .manager
            .new_session_with_context(
                &child_agent,
                child_cwd,
                Vec::new(),
                SessionCreationContext {
                    project_id,
                    ephemeral: true,
                    child_origin: Some(origin),
                    ..SessionCreationContext::default()
                },
            )
            .await;
        let session = match created {
            Ok(created) => created.session_id,
            Err(error) => {
                log::warn!("[orchestrator] run {run_log} session/new failed: {error}");
                return Err(StartError::SpawnFailed(error));
            }
        };
        {
            let mut ledger = self.ledger.lock();
            if let Some(entry) = ledger.runs.get_mut(&run) {
                entry.body = RunBody::Live {
                    child_agent: child_agent.clone(),
                    session: session.clone(),
                    awaiting_permission: false,
                };
            }
        }
        // Best-effort model switch: a refused switch keeps the agent's own
        // model, and the record then names none.
        let mut model = model;
        if let Some(requested) = model.clone() {
            if let Err(error) = self
                .manager
                .set_model(&child_agent, session.clone(), requested)
                .await
            {
                log::info!(
                    "[orchestrator] run {run_log} model switch failed: {error}; keeping the agent's model"
                );
                model = None;
            }
        }
        if let Some(entry) = self.ledger.lock().runs.get_mut(&run) {
            entry.model = model;
        }

        // Announce: from here on, failures settle through the card path,
        // even while the announce itself is still queued on the driver.
        let announce = self.ledger.lock().runs.get(&run).map(|entry| entry.record());
        if let Some(record) = announce {
            progress.lock().announced = true;
            if let Err(error) = self
                .manager
                .upsert_subagent_record(&self.parent_agent_of(&run), record, None)
                .await
            {
                log::warn!("[orchestrator] run {run_log} announce failed: {error}");
                return Err(StartError::SpawnFailed(error));
            }
        }

        let content = vec![agent_client_protocol::schema::v1::ContentBlock::Text(
            agent_client_protocol::schema::v1::TextContent::new(req.task.clone()),
        )];
        let started = self
            .manager
            .start_prompt(&child_agent, session.clone(), content, None, None)
            .await;
        let started = match started {
            Ok(started) => started,
            Err(error) => {
                log::warn!("[orchestrator] run {run_log} prompt failed: {error}");
                return Err(StartError::SpawnFailed(bounded(&error, 512)));
            }
        };
        let engine = self.clone();
        let supervise_run = (*run).clone();
        let lease = ChildLease {
            manager: self.manager.clone(),
            child: child_agent,
        };
        self.handle.spawn(async move {
            engine.supervise(supervise_run, lease, started).await;
        });
        self.ledger
            .lock()
            .runs
            .get(&run)
            .map(|entry| entry.summary())
            .ok_or_else(|| {
                StartError::SpawnFailed("the run vanished during startup".to_string())
            })
    }

    fn parent_agent_of(&self, run: &RunId) -> AgentId {
        self.ledger
            .lock()
            .runs
            .get(run)
            .map(|entry| entry.parent_agent.clone())
            .unwrap_or_default()
    }

    /// Wait for the run to settle, or report the budget end as an outcome.
    pub async fn wait(
        &self,
        caller: CallerRef,
        run: RunId,
        budget: Duration,
    ) -> Result<WaitOutcome, RunLookupError> {
        let root = self.caller_root(&caller);
        let waiter = {
            let mut ledger = self.ledger.lock();
            let Some(entry) = ledger.runs.get_mut(&run) else {
                return Err(RunLookupError);
            };
            if entry.root != root {
                return Err(RunLookupError);
            }
            if !entry.is_live() {
                None
            } else {
                // A waiter whose caller timed out or hung up is dropped here,
                // so a wait-and-retry loop cannot grow the list.
                entry.waiters.retain(|waiter| !waiter.is_closed());
                let (tx, rx) = tokio::sync::oneshot::channel();
                entry.waiters.push(tx);
                Some(rx)
            }
        };
        let Some(waiter) = waiter else {
            return self.settled_summary(&run);
        };
        match tokio::time::timeout(budget, waiter).await {
            Ok(Ok(())) | Ok(Err(_)) => self.settled_summary(&run),
            Err(_) => {
                let state = self
                    .ledger
                    .lock()
                    .runs
                    .get(&run)
                    .map(|entry| entry.state())
                    .ok_or(RunLookupError)?;
                Ok(WaitOutcome::TimedOut { state })
            }
        }
    }

    fn settled_summary(&self, run: &RunId) -> Result<WaitOutcome, RunLookupError> {
        let summary = self
            .ledger
            .lock()
            .runs
            .get(run)
            .map(|entry| entry.summary())
            .ok_or(RunLookupError)?;
        Ok(WaitOutcome::Settled(Box::new(summary)))
    }

    /// The caller's runs: every live one plus the settled ones the ledger
    /// still keeps, or just the named ones.
    pub fn status(
        &self,
        caller: CallerRef,
        runs: Option<Vec<RunId>>,
    ) -> Result<Vec<RunSummary>, RunLookupError> {
        let root = self.caller_root(&caller);
        let ledger = self.ledger.lock();
        match runs {
            Some(runs) => {
                let mut summaries = Vec::new();
                for run in runs {
                    let Some(entry) = ledger.runs.get(&run) else {
                        return Err(RunLookupError);
                    };
                    if entry.root != root {
                        return Err(RunLookupError);
                    }
                    summaries.push(entry.summary());
                }
                Ok(summaries)
            }
            None => Ok(ledger
                .runs_of_root(&root)
                .into_iter()
                .map(|entry| entry.summary())
                .collect()),
        }
    }

    /// Stop a run: convergent, so a stop of an ended run answers
    /// `AlreadyEnded`.
    pub async fn stop(
        self: &Arc<Self>,
        caller: CallerRef,
        run: RunId,
    ) -> Result<StopOutcome, StopError> {
        let root = self.caller_root(&caller);
        self.stop_run(&run, &root)
            .await
            .unwrap_or(Err(StopError::NotFound))
    }

    pub fn settings_view(&self) -> OrchestratorSettings {
        self.settings.get()
    }

    pub fn set_settings(&self, input: SettingsInput) -> Result<OrchestratorSettings, String> {
        self.settings.set(input)
    }

    /// Apply `edit` to the current settings under the store's writer lock,
    /// so concurrent patches keep each other's changes.
    pub fn update_settings(
        &self,
        edit: impl FnOnce(&mut OrchestratorSettings),
    ) -> Result<OrchestratorSettings, String> {
        self.settings.update(edit)
    }
}

/// What a start has made so far, for the cleanup of a start that fails or
/// is cancelled partway.
#[derive(Default)]
pub(super) struct StartProgress {
    pub(super) child: Option<AgentId>,
    /// `(repository root, worktree path, branch)`.
    pub(super) worktree: Option<(String, String, String)>,
    /// Set by the cleanup: a worktree finished after it is removed by the
    /// task that made it.
    pub(super) abandoned: bool,
    /// The announce card was submitted, so the chat may show the run.
    pub(super) announced: bool,
}

/// A held capacity slot; dropping it frees the slot.
struct Reservation {
    engine: Arc<OrchestratorEngine>,
    run: RunId,
    cancel: tokio_util::sync::CancellationToken,
}

impl Drop for Reservation {
    fn drop(&mut self) {
        self.engine.ledger.lock().starting.remove(&self.run);
    }
}

struct StartChecks {
    root: String,
    parent_run: Option<RunId>,
    parent_agent: AgentId,
    depth: u8,
    config: AgentConfig,
    /// The start's model, else the settings' default for the agent.
    model: Option<String>,
    settings: OrchestratorSettings,
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod engine_tests;
#[cfg(test)]
pub(crate) use engine_tests::engine_with_installed;
