//! Pending MCP install cards, listed with the other prompts a subscribe
//! restores. The card is answered through `answer_mcp_install`, so this table
//! only remembers the request until it is resolved or its session ends.

use std::collections::HashMap;

use parking_lot::Mutex;
use serde_json::Value;
use tracing::warn;

use crate::acp::AgentId;

struct McpInstallTicket {
    agent_id: AgentId,
    session_id: String,
    request: Value,
    order: u64,
}

#[derive(Default)]
struct State {
    tickets: HashMap<String, McpInstallTicket>,
    next_order: u64,
}

/// The relay's table of pending MCP install cards, keyed by `requestId`.
#[derive(Default)]
pub struct McpInstallTickets {
    state: Mutex<State>,
}

impl McpInstallTickets {
    /// Keep a published `mcp_install_request` until it is resolved or released.
    pub fn register_event(&self, payload: &Value) {
        let field = |name: &str| payload.get(name).and_then(Value::as_str);
        let request_id = field("requestId").unwrap_or_default();
        if request_id.is_empty() {
            warn!("[mcp-install] dropping mcp_install_request with no requestId");
            return;
        }
        let mut state = self.state.lock();
        let order = state.next_order;
        state.next_order += 1;
        state.tickets.insert(
            request_id.to_string(),
            McpInstallTicket {
                agent_id: AgentId(field("agentId").unwrap_or("unknown").to_string()),
                session_id: field("sessionId").unwrap_or_default().to_string(),
                request: payload.clone(),
                order,
            },
        );
    }

    /// Drop a resolved card. Idempotent.
    pub fn settle(&self, request_id: &str) {
        self.state.lock().tickets.remove(request_id);
    }

    /// The `mcp_install_request` payloads of `session_id` still waiting,
    /// oldest first.
    #[must_use]
    pub fn pending_requests(&self, session_id: &str) -> Vec<Value> {
        let state = self.state.lock();
        let mut pending: Vec<&McpInstallTicket> = state
            .tickets
            .values()
            .filter(|ticket| ticket.session_id == session_id)
            .collect();
        pending.sort_by_key(|ticket| ticket.order);
        pending
            .into_iter()
            .map(|ticket| ticket.request.clone())
            .collect()
    }

    pub fn release_session(&self, session_id: &str) -> usize {
        self.release_where(|ticket| ticket.session_id == session_id)
    }

    /// Drop the tickets `agent_id` raised in `session_id`, and only those: a
    /// turn of that agent ended. An orchestrated subagent's, raised under its
    /// chat as its own agent, end with its run. Returns how many.
    pub fn release_agent_session(&self, session_id: &str, agent_id: &AgentId) -> usize {
        self.release_where(|ticket| {
            ticket.session_id == session_id && ticket.agent_id == *agent_id
        })
    }

    pub fn release_agent(&self, agent_id: &AgentId) -> usize {
        self.release_where(|ticket| ticket.agent_id == *agent_id)
    }

    fn release_where(&self, matches: impl Fn(&McpInstallTicket) -> bool) -> usize {
        let mut state = self.state.lock();
        let before = state.tickets.len();
        state.tickets.retain(|_, ticket| !matches(ticket));
        before - state.tickets.len()
    }
}
