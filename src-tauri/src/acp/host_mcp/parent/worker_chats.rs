//! `StartChat` and `SendToChat` frames, answered by the worker-chat service
//! for the calling session.

use std::sync::Arc;

use serde_json::json;

use super::HostPlanServer;
use crate::acp::config::SessionId;
use crate::acp::host_mcp::worker_chats::{SendToChatInput, StartChatInput};
use crate::acp::host_mcp::FrameReply;
use crate::acp::worker_chats::{AccountChoice, StartChatRequest, WorkerChatError, WorkerChats};

impl HostPlanServer {
    pub(crate) fn set_worker_chats(&self, chats: Arc<WorkerChats>) {
        if self.worker_chats.set(chats).is_err() {
            log::warn!("[host-mcp] worker chats already installed; kept the first");
        }
    }

    pub(super) async fn start_chat(&self, caller: &str, input: Option<StartChatInput>) -> FrameReply {
        let Some(input) = input else {
            return FrameReply::err("a start_chat frame needs a prompt");
        };
        let Some(chats) = self.worker_chats.get() else {
            return refusal(&WorkerChatError::Unavailable);
        };
        let request = StartChatRequest {
            caller: SessionId(caller.to_string()),
            prompt: input.prompt,
            title: input.title,
            account: AccountChoice::parse(input.account.as_deref()),
        };
        match chats.start(request).await {
            Ok(started) => match serde_json::to_value(&started) {
                Ok(value) => FrameReply::ok_with(value),
                Err(_) => FrameReply::err("the started chat could not be described"),
            },
            Err(error) => refusal(&error),
        }
    }

    pub(super) async fn send_to_chat(
        &self,
        caller: &str,
        input: Option<SendToChatInput>,
    ) -> FrameReply {
        let Some(input) = input else {
            return FrameReply::err("a send_to_chat frame needs a chat_id and a prompt");
        };
        let Some(chats) = self.worker_chats.get() else {
            return refusal(&WorkerChatError::Unavailable);
        };
        let chat_id = input.chat_id.clone();
        match chats
            .send(
                SessionId(caller.to_string()),
                SessionId(input.chat_id),
                input.prompt,
            )
            .await
        {
            Ok(()) => FrameReply::ok_with(json!({ "chatId": chat_id, "sent": true })),
            Err(error) => refusal(&error),
        }
    }

    pub(super) async fn list_started_chats(&self, caller: &str) -> FrameReply {
        let Some(chats) = self.worker_chats.get() else {
            return refusal(&WorkerChatError::Unavailable);
        };
        match chats.list(SessionId(caller.to_string())).await {
            Ok(listed) => FrameReply::ok_with(json!({ "chats": listed })),
            Err(error) => refusal(&error),
        }
    }
}

/// A refused call: the wire code, and `{code, message}` as the tool text.
fn refusal(error: &WorkerChatError) -> FrameReply {
    let (code, message) = (error.code(), error.message());
    FrameReply {
        result: Some(json!({ "code": code, "message": message })),
        ..FrameReply::err_code(code, message)
    }
}
