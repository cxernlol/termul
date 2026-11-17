//! Moving one chat to a new agent. The other chats of its old agent stay
//! where they are.

use std::sync::Arc;

use agent_client_protocol::schema::v1::{ContentBlock, TextContent};

use super::supervisor::{scrub, Supervisor};
use super::{AccountRef, ClaudeLimitAction};
use crate::acp::config::{AgentId, SessionId};
use crate::acp::manager::HostMove;
use crate::acp::SpawnScope;
use crate::logging::redact_session_id;
use crate::web::prompt_turn::{
    accept_prompt_turn, complete_prompt_turn, PromptAdmission, PromptTurnRequest,
};

pub(super) enum Relaunch {
    /// The chat runs on this new agent.
    Done(AgentId),
    /// Another agent than the one being replaced holds the chat now: a
    /// client opened it there.
    HeldElsewhere(AgentId),
}

impl Supervisor {
    pub(super) async fn move_chat(
        &mut self,
        session_id: &SessionId,
        project_id: &str,
        old_agent: &AgentId,
        from: AccountRef,
        to: AccountRef,
        notice: String,
    ) {
        let chat = redact_session_id(&session_id.0);
        let moving = self.acp.begin_host_move(session_id).await;
        match self.relaunch(&moving, session_id, Some(old_agent)).await {
            Ok(Relaunch::Done(agent_id)) => {
                self.emit(
                    session_id,
                    project_id,
                    ClaudeLimitAction::Switched {
                        from,
                        to,
                        from_agent_id: old_agent.0.clone(),
                        new_agent_id: agent_id.0.clone(),
                    },
                );
                self.send_notice(&agent_id, session_id, &notice).await;
            }
            Ok(Relaunch::HeldElsewhere(holder)) => log::info!(
                "[claude-limit] chat {chat} is open on agent {holder} now; left there"
            ),
            Err(reason) => {
                log::warn!(
                    "[claude-limit] chat {chat} did not continue on the new account: {}",
                    scrub(&reason, session_id)
                );
                self.emit(session_id, project_id, ClaudeLimitAction::Failed { reason });
            }
        }
        drop(moving);
    }

    /// Take the chat off `old_agent` and open it on a new agent started from
    /// its recipe with the chat's Account. `moving` holds the chat.
    pub(super) async fn relaunch(
        &self,
        moving: &HostMove,
        session_id: &SessionId,
        old_agent: Option<&AgentId>,
    ) -> Result<Relaunch, String> {
        let recipe = self
            .acp
            .launch_recipe(session_id)
            .ok_or_else(|| "the host has no launch recipe for this chat".to_string())?;
        if let Some(holder) = self.live_owner(session_id, old_agent).await {
            return Ok(Relaunch::HeldElsewhere(holder));
        }
        if let Some(old) = old_agent {
            self.release(old, session_id).await?;
        }
        let spawned = self
            .acp
            .spawn_with_command_id(
                recipe.launch.config.clone(),
                None,
                SpawnScope {
                    project_id: recipe.launch.project_id.clone(),
                    chat_id: Some(session_id.clone()),
                },
            )
            .await?;
        self.reopen(moving, &spawned.agent_id, session_id).await?;
        Ok(Relaunch::Done(spawned.agent_id))
    }

    /// Cancel the chat's held turn on `old`, then stop `old` when no other
    /// durable chat runs on it, or close only this chat there so the others
    /// keep their agent and their turns.
    async fn release(&self, old: &AgentId, session_id: &SessionId) -> Result<(), String> {
        if self
            .acp
            .is_turn_active(old, session_id.clone())
            .await
            .unwrap_or(false)
        {
            if let Err(error) = self.acp.cancel_prompt(old, session_id.clone()).await {
                log::warn!(
                    "[claude-limit] cancelling the held turn failed: {}",
                    scrub(&error, session_id)
                );
            }
        }
        let mut shared = false;
        for other in self.acp.agent_session_ids(old).await.unwrap_or_default() {
            let other = SessionId(other);
            if other != *session_id
                && !self
                    .acp
                    .is_ephemeral_session(old, other.clone())
                    .await
                    .unwrap_or(true)
            {
                shared = true;
                break;
            }
        }
        if !shared {
            if let Err(error) = self.acp.kill(old).await {
                log::warn!("[claude-limit] stopping agent {old} failed: {error}");
            }
            return Ok(());
        }
        log::info!(
            "[claude-limit] agent {old} keeps its other chats; closing only chat {} on it",
            redact_session_id(&session_id.0)
        );
        self.acp
            .close_session_keeping_recipe(old, session_id.clone())
            .await
            .map_err(|error| format!("the chat did not close on its old agent ({error})"))
    }

    async fn reopen(
        &self,
        moving: &HostMove,
        agent_id: &AgentId,
        session_id: &SessionId,
    ) -> Result<(), String> {
        let recipe = self
            .acp
            .launch_recipe(session_id)
            .ok_or_else(|| "the host has no launch recipe for this chat".to_string())?;
        let resumed = self
            .acp
            .resume_session_in_move(
                moving,
                agent_id,
                session_id.clone(),
                recipe.cwd.clone(),
                recipe.additional_directories.clone(),
                recipe.mcp_servers.clone(),
            )
            .await;
        let Err(resume_error) = resumed else {
            return Ok(());
        };
        log::info!(
            "[claude-limit] resuming chat {} failed ({}); loading it instead",
            redact_session_id(&session_id.0),
            scrub(&resume_error, session_id)
        );
        self.acp
            .load_session_in_move(
                moving,
                agent_id,
                session_id.clone(),
                recipe.cwd,
                recipe.additional_directories,
                recipe.mcp_servers,
            )
            .await
            .map(|_| ())
            .map_err(|load_error| format!("resume: {resume_error}; load: {load_error}"))
    }

    /// Start the continuation turn and return once the agent accepted it, so
    /// a client that waited for the move finds the chat busy on the new agent.
    pub(super) async fn send_notice(&self, agent_id: &AgentId, session_id: &SessionId, notice: &str) {
        let chat = redact_session_id(&session_id.0);
        let blocks = vec![ContentBlock::Text(TextContent::new(notice))];
        let request = PromptTurnRequest {
            agent_id: agent_id.clone(),
            session_id: session_id.clone(),
            content: blocks.clone(),
            record_content: blocks,
            turn_id: Some(format!("claude-limit-{}", uuid::Uuid::new_v4())),
        };
        match accept_prompt_turn(&self.acp, &self.relay, request).await {
            Ok(PromptAdmission::Running(running)) => {
                let acp = Arc::clone(&self.acp);
                tokio::spawn(async move {
                    match complete_prompt_turn(&acp, running).await {
                        Ok(reason) => log::info!(
                            "[claude-limit] chat {chat} continued; turn ended ({reason:?})"
                        ),
                        Err(_) => log::warn!(
                            "[claude-limit] the continuation turn of chat {chat} failed"
                        ),
                    }
                });
            }
            Ok(PromptAdmission::Receipt(_)) => log::info!("[claude-limit] chat {chat} continued"),
            Err(error) => log::warn!(
                "[claude-limit] the continuation prompt of chat {chat} failed ({})",
                error.kind()
            ),
        }
    }
}
