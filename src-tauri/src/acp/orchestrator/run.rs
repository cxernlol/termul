//! The run types and the ledger: one [`ChildRun`] per orchestrated
//! subagent, keyed by its host-minted [`RunId`], with pure state
//! transitions only. The engine (`engine.rs`) owns the ledger and every
//! side effect.

use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;

use tokio::sync::oneshot;

use crate::acp::config::{AgentId, SessionId};
use crate::acp::subagents::{
    Subagent, SubagentAgent, SubagentCaps, SubagentEnd, SubagentEndReason, SubagentSource,
    SubagentState, SubagentStop, SubagentTranscript, SubagentUsage, SubagentWorkspace,
    SubagentWorkspaceMode, MAX_TEXT_CHARS,
};

/// Settled runs kept per chat; the durable chat history outlives the entry.
const MAX_SETTLED_PER_CHAT: usize = 64;

/// Host-minted run id, `sub-<12 hex>`: wide enough that an id is never
/// reused, though the ledger forgets evicted runs and a restart forgets
/// all. Also the record id the renderer stops and looks up; the dispatch
/// tool call id is `termul-subagent:<run id>`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct RunId(pub String);

impl RunId {
    pub(crate) fn mint() -> Self {
        Self(format!(
            "sub-{}",
            &uuid::Uuid::new_v4().simple().to_string()[..12]
        ))
    }

    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }

    /// The dispatch tool call id of this run.
    pub(crate) fn dispatch_id(&self) -> String {
        format!("termul-subagent:{}", self.0)
    }
}

/// How a run ended. The first settle wins.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RunEnd {
    Completed,
    Cancelled,
    Failed(String),
}

impl RunEnd {
    fn reason(&self) -> SubagentEndReason {
        match self {
            Self::Completed => SubagentEndReason::Completed,
            Self::Cancelled => SubagentEndReason::Cancelled,
            Self::Failed(_) => SubagentEndReason::Failed,
        }
    }
}

/// One run's state machine.
#[derive(Debug, Clone)]
pub(crate) enum RunBody {
    /// Spawned, no session yet; capacity held.
    Spawning { child_agent: AgentId },
    Live {
        child_agent: AgentId,
        session: SessionId,
        awaiting_permission: bool,
    },
    /// A stop was requested; the cancel is out, with a force-kill backstop.
    Stopping {
        child_agent: AgentId,
        session: SessionId,
        since_ms: u64,
    },
    Settled { end: RunEnd, at_ms: u64 },
}

/// Longest result text kept, tail-capped.
pub(crate) const MAX_RESULT_CHARS: usize = 32_768;

/// The run's live capture: what the watcher sink collected from the child.
#[derive(Default)]
pub(crate) struct RunCapture {
    inner: parking_lot::Mutex<CaptureState>,
}

#[derive(Default)]
struct CaptureState {
    text: String,
    tool_uses: u64,
}

impl RunCapture {
    pub(crate) fn note_chunk(&self, text: &str) {
        let mut capture = self.inner.lock();
        capture.text.push_str(text);
        let overflow = capture.text.chars().count().saturating_sub(MAX_RESULT_CHARS);
        if overflow > 0 {
            let cut = capture
                .text
                .char_indices()
                .nth(overflow)
                .map_or(capture.text.len(), |(index, _)| index);
            capture.text.replace_range(..cut, "");
        }
    }

    pub(crate) fn note_tool_call(&self) {
        self.inner.lock().tool_uses += 1;
    }

    pub(crate) fn result_text(&self) -> String {
        self.inner.lock().text.clone()
    }
}

/// One orchestrated child run. The record is derived ([`ChildRun::record`]),
/// never synced: state comes from the body, identity, workspace and result
/// are carried.
pub(crate) struct ChildRun {
    pub(crate) run: RunId,
    /// The chat the run renders in (the caller's root session).
    pub(crate) root: String,
    /// The driver that receives the cards (the root chat's agent).
    pub(crate) parent_agent: AgentId,
    /// The spawning run, for nesting.
    pub(crate) parent_run: Option<RunId>,
    /// 1 = the chat's agent spawned it directly.
    pub(crate) depth: u8,
    pub(crate) identity: SubagentAgent,
    pub(crate) title: String,
    pub(crate) task: String,
    pub(crate) model: Option<String>,
    pub(crate) created_ms: u64,
    pub(crate) workspace: SubagentWorkspace,
    /// The snapshot commit a worktree run started from; the settle diff is
    /// taken against it. Absent for shared runs and empty repositories.
    pub(crate) base_commit: Option<String>,
    pub(crate) body: RunBody,
    pub(crate) result: Option<String>,
    pub(crate) waiters: Vec<oneshot::Sender<()>>,
    pub(crate) capture: Arc<RunCapture>,
}

impl ChildRun {
    pub(crate) fn session(&self) -> Option<&SessionId> {
        match &self.body {
            RunBody::Live { session, .. } | RunBody::Stopping { session, .. } => Some(session),
            RunBody::Spawning { .. } | RunBody::Settled { .. } => None,
        }
    }

    pub(crate) fn child_agent(&self) -> Option<&AgentId> {
        match &self.body {
            RunBody::Spawning { child_agent }
            | RunBody::Live { child_agent, .. }
            | RunBody::Stopping { child_agent, .. } => Some(child_agent),
            RunBody::Settled { .. } => None,
        }
    }

    /// The run's observable state.
    pub(crate) fn state(&self) -> RunState {
        match &self.body {
            RunBody::Spawning { .. } | RunBody::Stopping { .. } => RunState::Running,
            RunBody::Live {
                awaiting_permission, ..
            } => {
                if *awaiting_permission {
                    RunState::RequiresAction
                } else {
                    RunState::Running
                }
            }
            RunBody::Settled { end, .. } => match end {
                RunEnd::Completed => RunState::Completed,
                RunEnd::Cancelled => RunState::Cancelled,
                RunEnd::Failed(_) => RunState::Failed,
            },
        }
    }

    pub(crate) fn is_live(&self) -> bool {
        !matches!(self.body, RunBody::Settled { .. })
    }

    /// Settle: the first caller wins, so a repeated end report changes
    /// nothing.
    pub(crate) fn settle(&mut self, end: RunEnd, now_ms: u64) -> bool {
        if !self.is_live() {
            return false;
        }
        self.body = RunBody::Settled {
            end,
            at_ms: now_ms,
        };
        true
    }

    /// Move a live run into `Stopping` (the cancel is going out). Returns
    /// the cancel target, or `None` when the run is already stopping,
    /// spawning (the lease drop stops it) or settled.
    pub(crate) fn begin_stop(&mut self, now_ms: u64) -> Option<(AgentId, SessionId)> {
        match std::mem::replace(&mut self.body, RunBody::Settled {
            end: RunEnd::Cancelled,
            at_ms: now_ms,
        }) {
            RunBody::Live { child_agent, session, .. } => {
                self.body = RunBody::Stopping {
                    child_agent: child_agent.clone(),
                    session: session.clone(),
                    since_ms: now_ms,
                };
                Some((child_agent, session))
            }
            other => {
                self.body = other;
                None
            }
        }
    }

    /// Set (or clear) the awaiting-permission flag of a live run. Returns
    /// true when the flag changed.
    pub(crate) fn set_awaiting(&mut self, awaiting: bool) -> bool {
        let RunBody::Live {
            awaiting_permission, ..
        } = &mut self.body
        else {
            return false;
        };
        if *awaiting_permission == awaiting {
            return false;
        }
        *awaiting_permission = awaiting;
        true
    }

    /// The run's usage, merging what the watcher captured. No token total:
    /// ACP reports context occupancy, not a run's token use.
    pub(crate) fn usage(&self) -> Option<SubagentUsage> {
        let duration = match &self.body {
            RunBody::Settled { at_ms, .. } => at_ms.saturating_sub(self.created_ms),
            _ => 0,
        };
        let usage = SubagentUsage {
            input_tokens: None,
            output_tokens: None,
            total_tokens: None,
            tool_uses: Some(self.capture.tool_uses()),
            duration_ms: Some(duration),
        };
        (usage != SubagentUsage::default()).then_some(usage)
    }

    /// The derived record. Never synced: the engine sends it on every card.
    pub(crate) fn record(&self) -> Subagent {
        let state = match &self.body {
            RunBody::Spawning { .. } | RunBody::Stopping { .. } => SubagentState::Running,
            RunBody::Live {
                awaiting_permission, ..
            } => {
                if *awaiting_permission {
                    SubagentState::RequiresAction
                } else {
                    SubagentState::Running
                }
            }
            RunBody::Settled { end, .. } => SubagentState::Idle {
                end: SubagentEnd {
                    reason: end.reason(),
                    error: match end {
                        RunEnd::Failed(error) => Some(bounded(error, MAX_TEXT_CHARS)),
                        _ => None,
                    },
                },
            },
        };
        Subagent {
            id: self.run.0.clone(),
            root_session_id: self.root.clone(),
            parent_id: self.parent_run.as_ref().map(|run| run.0.clone()),
            dispatch_tool_call_id: self.run.dispatch_id(),
            source: SubagentSource::Orchestrated,
            title: self.title.clone(),
            description: Some(bounded(&self.task, 80)).filter(|text| !text.is_empty()),
            role: None,
            prompt: Some(self.task.clone()),
            background: true,
            state,
            started_at: Some(self.created_ms),
            ended_at: match &self.body {
                RunBody::Settled { at_ms, .. } => Some(*at_ms),
                _ => None,
            },
            model: self.model.clone(),
            usage: self.usage(),
            output_file: None,
            agent: Some(self.identity.clone()),
            workspace: Some(self.workspace.clone()),
            caps: SubagentCaps {
                stop: Some(SubagentStop::SessionCancel),
                transcript: SubagentTranscript::Live,
                live_progress: true,
                usage: true,
            },
        }
    }

    /// The engine-facing summary of the run.
    pub(crate) fn summary(&self) -> RunSummary {
        RunSummary {
            run: self.run.clone(),
            state: self.state(),
            title: self.title.clone(),
            ended_at: match &self.body {
                RunBody::Settled { at_ms, .. } => Some(*at_ms),
                _ => None,
            },
            result: self.result.clone(),
            error: match &self.body {
                RunBody::Settled {
                    end: RunEnd::Failed(error),
                    ..
                } => Some(bounded(error, MAX_TEXT_CHARS)),
                _ => None,
            },
            workspace: Some(self.workspace.clone()),
            usage: self.usage(),
        }
    }

    fn ended_at_ms(&self) -> u64 {
        match &self.body {
            RunBody::Settled { at_ms, .. } => *at_ms,
            _ => 0,
        }
    }
}

impl RunCapture {
    fn tool_uses(&self) -> u64 {
        self.inner.lock().tool_uses
    }
}

/// The observable state of a run, as the agent-facing tools report it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunState {
    Running,
    RequiresAction,
    Completed,
    Cancelled,
    Failed,
}

/// The engine-facing summary of one run.
#[derive(Debug, Clone, PartialEq)]
pub struct RunSummary {
    pub(crate) run: RunId,
    pub(crate) state: RunState,
    pub(crate) title: String,
    pub(crate) ended_at: Option<u64>,
    pub(crate) result: Option<String>,
    pub(crate) error: Option<String>,
    pub(crate) workspace: Option<SubagentWorkspace>,
    pub(crate) usage: Option<SubagentUsage>,
}

/// One launchable agent in the engine's listing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentListing {
    /// The launch key `subagent_start`'s `agent` takes.
    pub(crate) agent_id: String,
    pub(crate) name: String,
    pub(crate) allowed: bool,
    /// The model a start that names none asks for.
    pub(crate) default_model: Option<String>,
}

/// The caller of an engine operation, from the frame's session auth.
#[derive(Debug, Clone)]
pub struct CallerRef {
    pub(crate) agent: AgentId,
    pub(crate) session: SessionId,
}

/// What `start` was asked for (bounds validated host-side and re-checked
/// here).
#[derive(Debug, Clone)]
pub struct StartRequest {
    pub(crate) agent: String,
    pub(crate) task: String,
    pub(crate) workspace: SubagentWorkspaceMode,
    pub(crate) title: Option<String>,
    pub(crate) model: Option<String>,
}

/// A start the engine refused, or could not deliver.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartError {
    Disabled,
    UnknownAgent(String),
    AgentNotAllowed(String),
    Capacity { max: u32 },
    Depth { max: u8 },
    /// Names the field, never the value.
    InvalidInput(&'static str),
    WorkspaceUnavailable(String),
    SpawnFailed(String),
}

impl std::fmt::Display for StartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Disabled => f.write_str("subagents are disabled in the settings"),
            Self::UnknownAgent(agent) => write!(f, "unknown agent {agent}"),
            Self::AgentNotAllowed(agent) => write!(f, "agent {agent} is not allowed"),
            Self::Capacity { max } => write!(f, "too many running subagents (max {max})"),
            Self::Depth { max } => write!(f, "the subagent depth limit is {max}"),
            Self::InvalidInput(field) => write!(f, "invalid {field}"),
            Self::WorkspaceUnavailable(error) => f.write_str(error),
            Self::SpawnFailed(error) => write!(f, "could not start the subagent: {error}"),
        }
    }
}

/// A lookup that named no run of the caller's chat.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunLookupError;

/// The outcome of `wait`.
#[derive(Debug)]
pub enum WaitOutcome {
    Settled(Box<RunSummary>),
    /// The budget ended; an outcome, never an error.
    TimedOut { state: RunState },
}

/// The outcome of `stop`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopOutcome {
    Sent,
    AlreadyEnded,
}

/// A stop the engine could not deliver.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StopError {
    /// No run of the caller's chat has this id.
    NotFound,
}

impl std::fmt::Display for StopError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => f.write_str("no such subagent in this chat"),
        }
    }
}

/// A start in flight, from the capacity check until `start` returns. It
/// holds a capacity slot, and a closing chat or a dying parent agent
/// cancels it.
pub(crate) struct Starting {
    pub(crate) root: String,
    pub(crate) parent_agent: AgentId,
    pub(crate) cancel: tokio_util::sync::CancellationToken,
}

/// The runs of every chat, under the engine's one mutex.
pub(crate) struct RunLedger {
    pub(crate) runs: HashMap<RunId, ChildRun>,
    pub(crate) by_root: BTreeMap<String, Vec<RunId>>,
    pub(crate) starting: HashMap<RunId, Starting>,
}

impl RunLedger {
    pub(crate) fn new() -> Self {
        Self {
            runs: HashMap::new(),
            by_root: BTreeMap::new(),
            starting: HashMap::new(),
        }
    }

    /// The capacity slots `root` holds: its live runs plus its starts that
    /// are not live runs yet.
    pub(crate) fn occupied_of_root(&self, root: &str) -> usize {
        let live = self.live_runs_of_root(root);
        let pending = self
            .starting
            .iter()
            .filter(|(id, start)| start.root == root && !live.contains(id))
            .count();
        live.len() + pending
    }

    /// Cancel every start `matches` selects.
    pub(crate) fn cancel_starts(&self, matches: impl Fn(&Starting) -> bool) -> usize {
        let mut cancelled = 0;
        for start in self.starting.values().filter(|start| matches(start)) {
            start.cancel.cancel();
            cancelled += 1;
        }
        cancelled
    }

    pub(crate) fn insert(&mut self, run: ChildRun) {
        let id = run.run.clone();
        let root = run.root.clone();
        if self.runs.insert(id.clone(), run).is_some() {
            return;
        }
        self.by_root.entry(root.clone()).or_default().push(id);
        self.evict_settled(&root);
    }

    pub(crate) fn remove(&mut self, run: &RunId) -> Option<ChildRun> {
        let removed = self.runs.remove(run)?;
        let root = removed.root.clone();
        if let Some(ids) = self.by_root.get_mut(&root) {
            ids.retain(|id| id != run);
            if ids.is_empty() {
                self.by_root.remove(&root);
            }
        }
        Some(removed)
    }

    /// Keep at most [`MAX_SETTLED_PER_CHAT`] settled runs per chat: the
    /// earliest settled entries are evicted, insertion order breaking ties
    /// (live runs are never evicted). Called on insert and on every settle.
    pub(crate) fn evict_settled(&mut self, root: &str) {
        while self.settled_of_root(root) > MAX_SETTLED_PER_CHAT {
            let Some(victim) = self.by_root.get(root).and_then(|ids| {
                ids.iter()
                    .enumerate()
                    .filter_map(|(order, id)| {
                        let run = self.runs.get(id).filter(|run| !run.is_live())?;
                        Some(((run.ended_at_ms(), order), id))
                    })
                    .min_by_key(|(key, _)| *key)
                    .map(|(_, id)| id.clone())
            }) else {
                return;
            };
            self.runs.remove(&victim);
            if let Some(ids) = self.by_root.get_mut(root) {
                ids.retain(|id| *id != victim);
            }
        }
    }

    fn settled_of_root(&self, root: &str) -> usize {
        self.by_root
            .get(root)
            .map(|ids| ids.iter().filter(|id| self.is_settled(id)).count())
            .unwrap_or(0)
    }

    fn is_settled(&self, id: &RunId) -> bool {
        self.runs.get(id).is_some_and(|run| !run.is_live())
    }

    /// The live and settled runs of `root`: live first, then settled newest
    /// first.
    pub(crate) fn runs_of_root(&self, root: &str) -> Vec<&ChildRun> {
        let Some(ids) = self.by_root.get(root) else {
            return Vec::new();
        };
        let mut runs: Vec<&ChildRun> = ids.iter().filter_map(|id| self.runs.get(id)).collect();
        runs.sort_by(|a, b| {
            let key = |run: &ChildRun| (run.is_live(), run.ended_at_ms());
            key(b).cmp(&key(a))
        });
        runs
    }

    /// The run whose child is the caller: its session and its agent both
    /// match (the spawning run of a nested caller). Session ids come from
    /// each agent, so the session alone could name another agent's run.
    pub(crate) fn run_with_session(&self, caller: &CallerRef) -> Option<&ChildRun> {
        self.runs.values().find(|run| {
            run.session() == Some(&caller.session) && run.child_agent() == Some(&caller.agent)
        })
    }

    /// Live runs whose parent agent is `agent`.
    pub(crate) fn live_runs_of_agent(&self, agent: &AgentId) -> Vec<RunId> {
        self.runs
            .values()
            .filter(|run| run.is_live() && &run.parent_agent == agent)
            .map(|run| run.run.clone())
            .collect()
    }

    /// Live runs of `root`.
    pub(crate) fn live_runs_of_root(&self, root: &str) -> Vec<RunId> {
        self.runs
            .values()
            .filter(|run| run.is_live() && run.root == root)
            .map(|run| run.run.clone())
            .collect()
    }
}

/// Trimmed non-blank text, cut to `max` characters.
pub(crate) fn bounded(text: &str, max: usize) -> String {
    let trimmed = text.trim();
    let end = trimmed
        .char_indices()
        .nth(max)
        .map_or(trimmed.len(), |(index, _)| index);
    trimmed[..end].to_string()
}

#[cfg(test)]
#[path = "run_tests.rs"]
mod run_tests;
