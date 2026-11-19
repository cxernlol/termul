//! Lifecycle release of approval, question and elicitation tickets.
//!
//! Tickets have no timeout, so the relay must tell the rendezvous when a ticket
//! can no longer be answered: the turn ended, the session closed, or the agent
//! died. The agent driver has already cancelled the parked responders on those
//! paths; this releases the relay side and the session's queue slot. Stop,
//! close and kill release outside any session event, so a release re-derives
//! the chats it stopped needing the user (after the ticket locks are gone).

use super::WsRelaySink;
use crate::acp::AgentId;

impl WsRelaySink {
    /// Release the pending permissions, questions, elicitations and MCP
    /// installs of `session_id`: all of them, or with `agent_id` (a turn
    /// cancel) only that agent's, so an orchestrated subagent's prompts
    /// raised under the chat outlive a stop of the chat's turn.
    pub fn release_session_tickets(&self, session_id: &str, agent_id: Option<&AgentId>) {
        let permissions = self.rendezvous().map_or(0, |rendezvous| match agent_id {
            Some(agent_id) => rendezvous.release_agent_session(session_id, agent_id),
            None => rendezvous.release_session(session_id),
        });
        let (questions, elicitations, mcp_installs) = self.release_prompts(session_id, agent_id);
        if permissions + questions + elicitations + mcp_installs > 0 {
            tracing::info!(
                session_id = %crate::logging::redact_session_id(session_id),
                agent_scoped = agent_id.is_some(),
                permissions,
                questions,
                elicitations,
                mcp_installs,
                "released pending approvals after the session ended"
            );
            self.refresh_chat_activity(session_id);
        }
    }

    /// Release the pending prompts of `session_id` whose turn `turn_id`
    /// ended: those of `agent_id`, the agent whose turn it was (all of them
    /// when the turn end names none). The permission side also remembers the
    /// turn, so a request of it whose registration lands after this release
    /// is dropped.
    pub fn release_turn_tickets(
        &self,
        session_id: &str,
        turn_id: &str,
        agent_id: Option<&AgentId>,
    ) {
        let permissions = self.rendezvous().map_or(0, |rendezvous| {
            rendezvous.release_turn(session_id, turn_id, agent_id)
        });
        let (questions, elicitations, mcp_installs) = self.release_prompts(session_id, agent_id);
        if permissions + questions + elicitations + mcp_installs > 0 {
            tracing::info!(
                session_id = %crate::logging::redact_session_id(session_id),
                permissions,
                questions,
                elicitations,
                mcp_installs,
                "released pending approvals after the turn ended"
            );
        }
    }

    /// Release the question, elicitation and MCP install tickets of
    /// `session_id`: all of them, or only `agent_id`'s. Returns the three
    /// counts.
    fn release_prompts(
        &self,
        session_id: &str,
        agent_id: Option<&AgentId>,
    ) -> (usize, usize, usize) {
        let questions = self.question_rendezvous();
        match agent_id {
            Some(agent_id) => (
                questions.map_or(0, |rendezvous| {
                    rendezvous.release_agent_session(session_id, agent_id)
                }),
                self.elicitations.release_agent_session(session_id, agent_id),
                self.mcp_installs.release_agent_session(session_id, agent_id),
            ),
            None => (
                questions.map_or(0, |rendezvous| rendezvous.release_session(session_id)),
                self.elicitations.release_session(session_id),
                self.mcp_installs.release_session(session_id),
            ),
        }
    }

    /// Release one question its agent withdrew while the turn goes on (an
    /// `ask_user` call whose caller hung up). A later answer reads
    /// `already_resolved`.
    pub fn release_question_ticket(&self, question_id: &str) {
        if let Some(rendezvous) = self.question_rendezvous() {
            rendezvous.settle(question_id);
        }
    }

    /// Release every pending permission, question and elicitation of `agent_id`.
    pub fn release_agent_tickets(&self, agent_id: &AgentId) {
        let permissions = self
            .rendezvous()
            .map_or(0, |rendezvous| rendezvous.release_agent(agent_id));
        let questions = self
            .question_rendezvous()
            .map_or(0, |rendezvous| rendezvous.release_agent(agent_id));
        let elicitations = self.elicitations.release_agent(agent_id);
        let mcp_installs = self.mcp_installs.release_agent(agent_id);
        if permissions + questions + elicitations + mcp_installs > 0 {
            tracing::info!(
                agent_id = %agent_id,
                permissions,
                questions,
                elicitations,
                mcp_installs,
                "released pending approvals after the agent ended"
            );
            self.refresh_pending_chat_activity();
        }
    }
}
