//! The run lifecycle: everything that happens to a run after `start`
//! returns. The supervision task, the settle path, stops (from the agent
//! tool, the renderer, a closing chat, or a dying parent agent), and the
//! cards those paths send. Split from `engine.rs` to keep both under the
//! file-size rule; the impl blocks are one engine.

use std::sync::Arc;

use parking_lot::Mutex;

use crate::acp::config::AgentId;
use crate::acp::manager::{AcpManager, StartedPrompt};
use crate::acp::orchestrator::engine::{OrchestratorEngine, StartProgress};
use crate::acp::orchestrator::run::{bounded, ChildRun, RunBody, RunEnd, RunId};
use crate::acp::orchestrator::run::{StopError, StopOutcome};
use crate::acp::subagents::{Subagent, SubagentWorkspaceMode};

/// After a stop, how long the cancel has to settle before the child is
/// killed outright.
const STOP_BACKSTOP: std::time::Duration = std::time::Duration::from_secs(10);

impl OrchestratorEngine {
    /// Clean up a start that failed, timed out or was cancelled. Nothing
    /// ran yet: no prompt was accepted. An announced run (its card went
    /// out, or may have) settles with `end`; an unannounced one is
    /// forgotten. The child is killed and the worktree made for it is
    /// removed with its branch before the settle card, so neither waits on
    /// the parent driver's reply.
    pub(super) async fn abort_start(
        self: &Arc<Self>,
        run: &RunId,
        progress: &Mutex<StartProgress>,
        end: RunEnd,
    ) {
        let (child, worktree, announced) = {
            let mut progress = progress.lock();
            progress.abandoned = true;
            (progress.child.take(), progress.worktree.take(), progress.announced)
        };
        {
            let mut ledger = self.ledger.lock();
            if !announced {
                ledger.remove(run);
            } else if let Some(entry) = ledger.runs.get_mut(run) {
                if worktree.is_some() {
                    entry.workspace.path = None;
                    entry.workspace.branch = None;
                }
            }
        }
        if let Some(child) = child {
            self.manager.kill_detached(&child);
        }
        if let Some((root, path, branch)) = worktree {
            crate::acp::orchestrator::worktree::discard(root, path, branch).await;
        }
        if announced {
            self.finish(run, end).await;
        }
    }

    /// The supervision task of one run: park on the child's turn, settle on
    /// every outcome, then drop the lease (which kills the child,
    /// idempotent).
    pub(super) async fn supervise(self: Arc<Self>, run: RunId, lease: ChildLease, started: StartedPrompt) {
        let outcome = self.manager.wait_prompt(started).await;
        let end = match outcome {
            Ok(agent_client_protocol::schema::v1::StopReason::Cancelled) => RunEnd::Cancelled,
            Ok(_) => RunEnd::Completed,
            Err(error) => RunEnd::Failed(bounded(&error, 512)),
        };
        self.finish(&run, end).await;
        drop(lease);
    }

    /// Settle the run (first wins), resolve its waiters, compute the diff
    /// stat, and send the settle card with the result the watcher
    /// captured.
    pub(super) async fn finish(self: &Arc<Self>, run: &RunId, end: RunEnd) {
        let (parent_agent, mut record, content, base_commit) = {
            let mut ledger = self.ledger.lock();
            let Some(entry) = ledger.runs.get_mut(run) else {
                return;
            };
            if !entry.settle(end, now_millis()) {
                return;
            }
            let waiters = std::mem::take(&mut entry.waiters);
            for waiter in waiters {
                let _ = waiter.send(());
            }
            if entry.result.is_none() {
                let text = entry.capture.result_text();
                entry.result = (!text.is_empty()).then_some(text);
            }
            let (parent_agent, record, content) = settle_card(entry);
            let base_commit = entry
                .base_commit
                .clone()
                .filter(|_| entry.workspace.mode == SubagentWorkspaceMode::Worktree);
            let root = entry.root.clone();
            ledger.evict_settled(&root);
            (parent_agent, record, content, base_commit)
        };
        if let Some(workspace) = &mut record.workspace {
            if workspace.mode == SubagentWorkspaceMode::Worktree {
                if let Some(path) = workspace.path.clone() {
                    workspace.diff_stat =
                        crate::acp::orchestrator::worktree::diff_stat(&path, base_commit.as_deref())
                            .await;
                }
            }
        }
        if let Some(diff_stat) = record.workspace.as_ref().and_then(|w| w.diff_stat.clone()) {
            let mut ledger = self.ledger.lock();
            if let Some(entry) = ledger.runs.get_mut(run) {
                entry.workspace.diff_stat = Some(diff_stat);
            }
        }
        if let Err(error) = self
            .manager
            .upsert_subagent_record(&parent_agent, record, content)
            .await
        {
            log::warn!(
                "[orchestrator] run {} settle card failed: {error}",
                crate::logging::redact_session_id(run.as_str())
            );
        }
        log::info!(
            "[orchestrator] run {} settled",
            crate::logging::redact_session_id(run.as_str())
        );
    }

    /// `None` when the ledger holds no run of `root` with this id: the
    /// caller's stop was for something else (the native path). `Sent`
    /// reports the stop accepted, not the child's reply: the cancel goes out
    /// on its own task, and the backstop settles a run whose child ignores
    /// it or is already gone.
    pub(super) async fn stop_run(
        self: &Arc<Self>,
        run: &RunId,
        root: &str,
    ) -> Option<Result<StopOutcome, StopError>> {
        let (cancel, starting) = {
            let mut ledger = self.ledger.lock();
            let starting = ledger.starting.get(run).map(|start| start.cancel.clone());
            let entry = ledger.runs.get_mut(run)?;
            if entry.root != root {
                return None;
            }
            if !entry.is_live() {
                return Some(Ok(StopOutcome::AlreadyEnded));
            }
            (entry.begin_stop(now_millis()), starting)
        };
        // A run still starting has its start cancelled: the start cleans up
        // and settles it, and a prompt it was about to send never goes out.
        if let Some(starting) = &starting {
            starting.cancel();
        }
        // Live with no new cancel target: still starting (cancelled above)
        // or already stopping. Either way the run has not settled yet.
        if let Some((child_agent, session)) = cancel {
            self.arm_backstop(run.clone());
            let engine = self.clone();
            let run = run.clone();
            self.handle.spawn(async move {
                if let Err(error) = engine.manager.cancel_prompt(&child_agent, session).await {
                    log::warn!(
                        "[orchestrator] run {} cancel failed: {error}",
                        crate::logging::redact_session_id(run.as_str())
                    );
                }
            });
        }
        Some(Ok(StopOutcome::Sent))
    }

    /// After [`STOP_BACKSTOP`], a run that never settled is force-settled
    /// and its child killed.
    fn arm_backstop(self: &Arc<Self>, run: RunId) {
        let engine = self.clone();
        self.handle.spawn(async move {
            tokio::time::sleep(STOP_BACKSTOP).await;
            let stuck = engine
                .ledger
                .lock()
                .runs
                .get(&run)
                .and_then(|entry| match &entry.body {
                    RunBody::Stopping {
                        since_ms,
                        child_agent,
                        ..
                    } => Some((*since_ms, child_agent.clone())),
                    _ => None,
                });
            if let Some((stopped_at, child)) = stuck {
                log::warn!(
                    "[orchestrator] run {} did not settle {} ms after its stop; killing the child",
                    crate::logging::redact_session_id(run.as_str()),
                    now_millis().saturating_sub(stopped_at)
                );
                // Kill first: the settle frees the run's capacity slot, and a
                // child that ignored the cancel must not keep working past it.
                engine.manager.kill_detached(&child);
                engine.finish(&run, RunEnd::Cancelled).await;
            }
        });
    }

    /// The manager's stop interception: `Some(result)` for a run of this
    /// engine, `None` for anything else (the native path takes over).
    pub(crate) async fn stop_from_ui(
        self: &Arc<Self>,
        root: &str,
        record_id: &str,
    ) -> Option<Result<StopOutcome, StopError>> {
        self.stop_run(&RunId(record_id.to_string()), root).await
    }

    /// Stop every live run of a closed chat.
    pub(crate) async fn chat_closed(self: &Arc<Self>, root: &str) {
        let (runs, starts) = {
            let ledger = self.ledger.lock();
            let starts = ledger.cancel_starts(|start| start.root == root);
            (ledger.live_runs_of_root(root), starts)
        };
        if starts > 0 {
            log::info!(
                "[orchestrator] chat {} closed: cancelled {starts} start(s)",
                crate::logging::redact_session_id(root)
            );
        }
        if runs.is_empty() {
            return;
        }
        log::info!(
            "[orchestrator] chat {} closed: stopping {} run(s)",
            crate::logging::redact_session_id(root),
            runs.len()
        );
        for run in runs {
            let cancel = {
                let mut ledger = self.ledger.lock();
                ledger
                    .runs
                    .get_mut(&run)
                    .and_then(|entry| entry.begin_stop(now_millis()))
            };
            if let Some((child_agent, session)) = cancel {
                // The same backstop as a stop: a child stuck in a tool call
                // is killed if its turn has not ended in time.
                self.arm_backstop(run.clone());
                if let Err(error) = self.manager.cancel_prompt(&child_agent, session).await {
                    log::warn!(
                        "[orchestrator] run {} cancel before chat close failed: {error}",
                        crate::logging::redact_session_id(run.as_str())
                    );
                }
            }
        }
    }

    /// Settle the live runs whose parent agent died, kill their children
    /// and cancel their starts. Returns each settled run's card for the
    /// dying driver to deliver itself, before its session writers close:
    /// its command channel is already gone, so the usual card path cannot
    /// reach it. Sync, for the driver thread's teardown.
    pub(crate) fn on_agent_gone(self: &Arc<Self>, agent: &AgentId) -> Vec<(Subagent, Option<String>)> {
        let (cards, children) = {
            let mut ledger = self.ledger.lock();
            ledger.cancel_starts(|start| &start.parent_agent == agent);
            let runs = ledger.live_runs_of_agent(agent);
            let mut cards = Vec::new();
            let mut children = Vec::new();
            for run in &runs {
                let Some(entry) = ledger.runs.get_mut(run) else {
                    continue;
                };
                children.extend(entry.child_agent().cloned());
                if !entry.settle(RunEnd::Cancelled, now_millis()) {
                    continue;
                }
                for waiter in std::mem::take(&mut entry.waiters) {
                    let _ = waiter.send(());
                }
                let (_, record, content) = settle_card(entry);
                cards.push((record, content));
            }
            let roots: std::collections::BTreeSet<String> = runs
                .iter()
                .filter_map(|run| ledger.runs.get(run).map(|entry| entry.root.clone()))
                .collect();
            for root in roots {
                ledger.evict_settled(&root);
            }
            (cards, children)
        };
        if !cards.is_empty() {
            log::info!(
                "[orchestrator] agent {} gone: stopped {} run(s)",
                agent.0,
                cards.len()
            );
        }
        for child in children {
            self.manager.kill_detached(&child);
        }
        cards
    }

    /// The watcher's permission mirror: flip the awaiting flag and send a
    /// change card when it flipped.
    pub(crate) fn note_permission(self: &Arc<Self>, run: &RunId, awaiting: bool) {
        let flipped = {
            let mut ledger = self.ledger.lock();
            match ledger.runs.get_mut(run) {
                Some(entry) if entry.session().is_some() => entry.set_awaiting(awaiting),
                _ => false,
            }
        };
        if flipped {
            let engine = self.clone();
            let run = run.clone();
            self.handle.spawn(async move {
                engine.send_change_card(&run).await;
            });
        }
    }

    async fn send_change_card(self: Arc<Self>, run: &RunId) {
        let (parent_agent, record) = {
            let ledger = self.ledger.lock();
            let Some(entry) = ledger.runs.get(run) else {
                return;
            };
            (entry.parent_agent.clone(), entry.record())
        };
        if let Err(error) = self
            .manager
            .upsert_subagent_record(&parent_agent, record, None)
            .await
        {
            log::warn!(
                "[orchestrator] run {} change card failed: {error}",
                crate::logging::redact_session_id(run.as_str())
            );
        }
    }
}

/// The settle card of a settled run: the parent agent that receives it, the
/// record, and the result as the card's content when the run completed.
fn settle_card(entry: &ChildRun) -> (AgentId, Subagent, Option<String>) {
    let content = entry.result.clone().filter(|_| {
        matches!(
            entry.body,
            RunBody::Settled {
                end: RunEnd::Completed,
                ..
            }
        )
    });
    (entry.parent_agent.clone(), entry.record(), content)
}

/// Stops the child agent on drop. `kill_detached` is idempotent, so the
/// drop after a settled run is a no-op.
pub(super) struct ChildLease {
    pub(super) manager: Arc<AcpManager>,
    pub(super) child: AgentId,
}

impl Drop for ChildLease {
    fn drop(&mut self) {
        self.manager.kill_detached(&self.child);
    }
}

pub(super) fn now_millis() -> u64 {
    crate::acp::session_persistence::now_millis()
}
