//! Accept, reopen, or close a parked `mcp_install` card. An answer before
//! the host-ticket floor is refused and the card stays open.

use tokio::sync::mpsc;

use super::super::HostPlanServer;
use crate::acp::host_mcp::mcp_install::{McpInstallAnswerError, McpInstallDecision};

const FINISHED_INSTALL_MEMORY: usize = 128;

impl HostPlanServer {
    /// Send the user's decision to the parked install of `session_id`.
    /// The first decline or approve wins. A preview can repeat until then.
    /// An unknown id, a finished id, a session that does not match, and an
    /// answer before [`ANSWER_FLOOR`] are rejected. The card stays open.
    pub fn answer_mcp_install(
        &self,
        request_id: &str,
        session_id: &str,
        decision: McpInstallDecision,
    ) -> Result<(), McpInstallAnswerError> {
        let mut pending = self.pending_installs.lock();
        let Some(open) = pending.get_mut(request_id) else {
            drop(pending);
            let finished = self.finished_installs.lock();
            return Err(if finished.iter().any(|id| id == request_id) {
                McpInstallAnswerError::AlreadyResolved
            } else {
                McpInstallAnswerError::NotFound
            });
        };
        if open.session_id != session_id {
            return Err(McpInstallAnswerError::SessionMismatch);
        }
        if open.answered {
            return Err(McpInstallAnswerError::AlreadyResolved);
        }
        let floor = *self.mcp_install_answer_floor.lock();
        if open.shown_at.elapsed() < floor {
            return Err(McpInstallAnswerError::TooEarly);
        }
        let terminal = !matches!(decision, McpInstallDecision::Preview { .. });
        if open.sender.send(decision).is_err() {
            return Err(McpInstallAnswerError::AlreadyResolved);
        }
        if terminal {
            open.answered = true;
        }
        Ok(())
    }

    /// The refused approve did not finish the install. The user may answer
    /// the card that was shown again.
    pub(super) fn reopen_install_answer(&self, request_id: &str) {
        if let Some(open) = self.pending_installs.lock().get_mut(request_id) {
            open.answered = false;
            open.shown_at = std::time::Instant::now();
        }
    }

    pub(super) fn close_install(&self, request_id: &str) {
        self.pending_installs.lock().remove(request_id);
        let mut finished = self.finished_installs.lock();
        finished.push_back(request_id.to_string());
        while finished.len() > FINISHED_INSTALL_MEMORY {
            finished.pop_front();
        }
    }

    pub(in crate::acp::host_mcp::parent) fn cancel_mcp_installs_for_session(&self, session_id: &str) {
        let senders: Vec<mpsc::UnboundedSender<McpInstallDecision>> = {
            let mut pending = self.pending_installs.lock();
            let ids: Vec<String> = pending
                .iter()
                .filter(|(_, open)| open.session_id == session_id)
                .map(|(id, _)| id.clone())
                .collect();
            let mut finished = self.finished_installs.lock();
            ids.into_iter()
                .filter_map(|id| {
                    let open = pending.remove(&id)?;
                    finished.push_back(id);
                    Some(open.sender)
                })
                .collect()
        };
        for sender in senders {
            let _ = sender.send(McpInstallDecision::Cancelled);
        }
    }
}
