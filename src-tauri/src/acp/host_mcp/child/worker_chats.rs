//! The `start_chat` and `send_to_chat` tools: forward the input to the
//! parent and return its JSON reply.

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::CallToolResult;
use rmcp::{tool, tool_router};

use super::TermulPlanServer;
use crate::acp::host_mcp::worker_chats::{
    SendToChatInput, StartChatInput, LIST_STARTED_CHATS_DESCRIPTION, SEND_TO_CHAT_DESCRIPTION,
    START_CHAT_DESCRIPTION, START_CHAT_LATE,
};
use crate::acp::host_mcp::{FrameKind, FrameRequest};

/// Starting a chat spawns an agent, reads every Account's usage and opens a
/// session before the first message is accepted.
const START_ROUND_TRIP: std::time::Duration = std::time::Duration::from_secs(180);
const SEND_ROUND_TRIP: std::time::Duration = std::time::Duration::from_secs(60);

#[tool_router(router = worker_chats_tool_router, vis = "pub(super)")]
impl TermulPlanServer {
    #[tool(
        name = "start_chat",
        description = START_CHAT_DESCRIPTION,
        annotations(read_only_hint = false, destructive_hint = false, open_world_hint = false)
    )]
    async fn start_chat(&self, Parameters(input): Parameters<StartChatInput>) -> CallToolResult {
        let request = FrameRequest {
            start_chat: Some(input),
            ..self.frame(FrameKind::StartChat)
        };
        self.text_call_or("start_chat", request, START_ROUND_TRIP, START_CHAT_LATE)
            .await
    }

    #[tool(
        name = "send_to_chat",
        description = SEND_TO_CHAT_DESCRIPTION,
        annotations(read_only_hint = false, destructive_hint = false, open_world_hint = false)
    )]
    async fn send_to_chat(&self, Parameters(input): Parameters<SendToChatInput>) -> CallToolResult {
        let request = FrameRequest {
            send_to_chat: Some(input),
            ..self.frame(FrameKind::SendToChat)
        };
        self.text_call("send_to_chat", request, SEND_ROUND_TRIP).await
    }

    #[tool(
        name = "list_started_chats",
        description = LIST_STARTED_CHATS_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn list_started_chats(&self) -> CallToolResult {
        let request = self.frame(FrameKind::ListStartedChats);
        self.text_call("list_started_chats", request, SEND_ROUND_TRIP)
            .await
    }
}
