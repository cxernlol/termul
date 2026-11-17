//! One reopen of a chat at a time, across every agent.
//!
//! A client opens a chat by listing the live agents and adopting the one that
//! holds it, or by spawning an agent and resuming the chat there. When the
//! host moves a chat to a new agent (`claude_limit`), no agent holds the chat
//! between the stop of the old agent and the resume on the new one, so a
//! client that looked then would start a second holder. Every reopen holds
//! its chat's gate. A host move holds the gates of every chat it moves until
//! the new agent has accepted their continuation turns, and `list_agents`
//! waits for host moves, so the client finds the new holder.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tokio::sync::{watch, OwnedMutexGuard};

use super::AcpManager;
use crate::acp::config::SessionId;

/// A listing waits at most this long for a host move. A move that takes
/// longer (a wedged spawn) must not stall every client that lists agents.
const LISTING_WAIT: Duration = Duration::from_secs(20);

pub(super) struct ReopenGates {
    gates: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    host_moves: watch::Sender<usize>,
}

impl Default for ReopenGates {
    fn default() -> Self {
        Self {
            gates: Mutex::new(HashMap::new()),
            host_moves: watch::Sender::new(0),
        }
    }
}

impl ReopenGates {
    async fn hold(self: &Arc<Self>, session_id: &str) -> HeldChat {
        let gate = Arc::clone(
            self.gates
                .lock()
                .entry(session_id.to_string())
                .or_default(),
        );
        let guard = gate.lock_owned().await;
        HeldChat {
            session_id: session_id.to_string(),
            gates: Arc::clone(self),
            guard: Some(guard),
        }
    }
}

/// The reopen gate of one chat, released on drop.
pub(crate) struct HeldChat {
    session_id: String,
    gates: Arc<ReopenGates>,
    guard: Option<OwnedMutexGuard<()>>,
}

impl Drop for HeldChat {
    fn drop(&mut self) {
        drop(self.guard.take());
        let mut gates = self.gates.gates.lock();
        // Waiters clone the gate under this lock, so a count of one means the
        // map holds the last reference.
        if gates
            .get(&self.session_id)
            .is_some_and(|gate| Arc::strong_count(gate) == 1)
        {
            gates.remove(&self.session_id);
        }
    }
}

/// The chats the host is moving to a new agent. Reopens of them by anyone
/// else wait until it drops.
pub struct HostMove {
    chats: Vec<HeldChat>,
    gates: Arc<ReopenGates>,
}

impl HostMove {
    #[must_use]
    pub fn holds(&self, session_id: &SessionId) -> bool {
        self.chats.iter().any(|chat| chat.session_id == session_id.0)
    }
}

impl Drop for HostMove {
    fn drop(&mut self) {
        self.chats.clear();
        self.gates.host_moves.send_modify(|moves| *moves -= 1);
    }
}

impl AcpManager {
    /// The chat's gate, unless `moving` already holds it.
    pub(super) async fn hold_unless_moving(
        &self,
        moving: Option<&HostMove>,
        session_id: &SessionId,
    ) -> Option<HeldChat> {
        match moving {
            Some(moving) if moving.holds(session_id) => None,
            _ => Some(self.reopen_gates.hold(&session_id.0).await),
        }
    }

    /// Start moving `session_id` to a new agent. Waits for a reopen of it
    /// that is in flight.
    pub async fn begin_host_move(&self, session_id: &SessionId) -> HostMove {
        self.reopen_gates
            .host_moves
            .send_modify(|moves| *moves += 1);
        let mut moving = HostMove {
            chats: Vec::new(),
            gates: Arc::clone(&self.reopen_gates),
        };
        self.add_to_host_move(&mut moving, session_id).await;
        moving
    }

    /// Move another chat with `moving`.
    pub async fn add_to_host_move(&self, moving: &mut HostMove, session_id: &SessionId) {
        if !moving.holds(session_id) {
            moving.chats.push(self.reopen_gates.hold(&session_id.0).await);
        }
    }

    /// Wait until no host move is running, so a listing shows where each
    /// moved chat now lives.
    pub(super) async fn host_moves_settled(&self) {
        let mut moves = self.reopen_gates.host_moves.subscribe();
        if tokio::time::timeout(LISTING_WAIT, moves.wait_for(|moves| *moves == 0))
            .await
            .is_err()
        {
            log::warn!(
                "[acp] agent listing waited {LISTING_WAIT:?} for a host move of a chat; listed anyway"
            );
        }
    }
}

#[cfg(test)]
#[path = "reopen_gate_tests.rs"]
mod tests;
