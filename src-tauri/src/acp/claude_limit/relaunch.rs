//! Moving a chat, and the other chats of its agent, to a new agent.

use std::sync::Arc;
use std::time::SystemTime;

use agent_client_protocol::schema::v1::{ContentBlock, TextContent};

use super::supervisor::{scrub, Supervisor};
use super::{AccountRef, ClaudeLimitAction};
use crate::acp::claude_agent::ClaudeLaunchAuth;
use crate::acp::config::{AgentId, SessionId};
use crate::acp::manager::HostMove;
use crate::logging::redact_session_id;
use crate::web::prompt_turn::{
    accept_prompt_turn, complete_prompt_turn, PromptAdmission, PromptTurnRequest,
};

/// Another chat the stopped agent held.
struct Sibling {
    session_id: SessionId,
    /// A turn of it was running when the agent stopped.
    interrupted: bool,
    reopened: Result<(), String>,
}

pub(super) struct Relaunched {
    pub(super) agent_id: AgentId,
    siblings: Vec<Sibling>,
}

pub(super) enum Relaunch {
    Done(Relaunched),
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
        let mut moving = self.acp.begin_host_move(session_id).await;
        match self.relaunch(&mut moving, session_id, Some(old_agent)).await {
            Ok(Relaunch::Done(relaunched)) => {
                let switched = ClaudeLimitAction::Switched {
                    from,
                    to,
                    from_agent_id: old_agent.0.clone(),
                    new_agent_id: relaunched.agent_id.0.clone(),
                };
                self.emit(session_id, project_id, switched.clone());
                self.send_notice(&relaunched.agent_id, session_id, &notice)
                    .await;
                self.follow_siblings(project_id, relaunched, &switched, &notice)
                    .await;
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
    }

    /// Tell the clients of every other chat the stopped agent held where it
    /// continues, and continue the ones whose turn the stop cut off or that
    /// waited for their account to reset.
    pub(super) async fn follow_siblings(
        &mut self,
        project_id: &str,
        relaunched: Relaunched,
        action: &ClaudeLimitAction,
        notice: &str,
    ) {
        let new_account = self
            .acp
            .agent_launch(&relaunched.agent_id)
            .and_then(|launch| match launch.claude {
                ClaudeLaunchAuth::Account(id) => Some(id),
                _ => None,
            });
        for sibling in relaunched.siblings {
            match sibling.reopened {
                Ok(()) => {
                    self.emit(&sibling.session_id, project_id, action.clone());
                    let waited = self.end_wait_on(&sibling.session_id, new_account.as_deref());
                    if sibling.interrupted || waited {
                        self.send_notice(&relaunched.agent_id, &sibling.session_id, notice)
                            .await;
                    }
                }
                Err(error) => self.emit(
                    &sibling.session_id,
                    project_id,
                    ClaudeLimitAction::Failed {
                        reason: format!(
                            "Troupe restarted this chat's agent for another chat at its Claude limit, and this chat did not reopen ({error}). Send a message to continue."
                        ),
                    },
                ),
            }
        }
    }

    /// A chat that waits for its account to reset continues now when it
    /// reopened on another account with room: its scheduled resume goes.
    fn end_wait_on(&mut self, session_id: &SessionId, new_account: Option<&str>) -> bool {
        let Some(new_account) = new_account else {
            return false;
        };
        let Some(entry) = self.schedule.get(&session_id.0) else {
            return false;
        };
        let limited = self
            .limited_until
            .get(new_account)
            .is_some_and(|until| *until > SystemTime::now());
        if entry.account_id.as_deref() == Some(new_account) || limited {
            return false;
        }
        self.schedule.remove(&session_id.0);
        log::info!(
            "[claude-limit] chat {} waited for its limit to reset and continues on the new account now",
            redact_session_id(&session_id.0)
        );
        true
    }

    /// Stop `old_agent` (every chat it held) and open the chat, and the other
    /// durable chats the old agent held, on a new agent from the recipe.
    /// `moving` holds the chat; the other chats join it.
    pub(super) async fn relaunch(
        &self,
        moving: &mut HostMove,
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
        let mut others = Vec::new();
        if let Some(old) = old_agent {
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
            for other in self.acp.agent_session_ids(old).await.unwrap_or_default() {
                let other = SessionId(other);
                let ephemeral = self
                    .acp
                    .is_ephemeral_session(old, other.clone())
                    .await
                    .unwrap_or(true);
                if other == *session_id || ephemeral {
                    continue;
                }
                self.acp.add_to_host_move(moving, &other).await;
                if self.live_owner(&other, Some(old)).await.is_some() {
                    continue;
                }
                let interrupted = self
                    .acp
                    .is_turn_active(old, other.clone())
                    .await
                    .unwrap_or(false);
                others.push((other, interrupted));
            }
            if let Err(error) = self.acp.kill(old).await {
                log::warn!("[claude-limit] stopping agent {old} failed: {error}");
            }
        }
        let spawned = self
            .acp
            .spawn_with_command_id(
                recipe.launch.config.clone(),
                None,
                recipe.launch.project_id.clone(),
            )
            .await?;
        let agent_id = spawned.agent_id;
        self.reopen(moving, &agent_id, session_id).await?;
        let mut siblings = Vec::new();
        for (other, interrupted) in others {
            let reopened = self.reopen(moving, &agent_id, &other).await;
            match &reopened {
                Ok(()) => log::info!(
                    "[claude-limit] chat {} moved with the agent (turn cut off: {interrupted})",
                    redact_session_id(&other.0)
                ),
                Err(error) => log::warn!(
                    "[claude-limit] chat {} of the stopped agent did not reopen: {}",
                    redact_session_id(&other.0),
                    scrub(error, &other)
                ),
            }
            siblings.push(Sibling {
                session_id: other,
                interrupted,
                reopened,
            });
        }
        Ok(Relaunch::Done(Relaunched { agent_id, siblings }))
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
