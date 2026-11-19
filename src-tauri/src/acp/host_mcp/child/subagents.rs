//! The `subagent_*` tools: each forwards its arguments to the parent as a
//! `Subagent` frame and returns the parent's JSON verbatim. `subagent_start`
//! and `subagent_wait` have no round-trip timeout of their own (the parent
//! bounds the spawn and the wait budget); a client cancel hangs up on the
//! parent instead.

use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock};
use rmcp::{tool, tool_router};
use serde_json::Value;
use tokio_util::sync::CancellationToken;

use super::{exchange_frame, text_result, TermulPlanServer};
use crate::acp::host_mcp::subagent_tools::{
    SubagentRefInput, SubagentStartInput, SubagentStatusInput, SubagentTool, SubagentWaitInput,
    LIST_AGENTS_DESCRIPTION, START_DESCRIPTION, STATUS_DESCRIPTION, STOP_DESCRIPTION,
    WAIT_DESCRIPTION,
};
use crate::acp::host_mcp::{FrameKind, FrameRequest};

/// Listing, status and stop answer from the host's memory.
const ROUND_TRIP: std::time::Duration = std::time::Duration::from_secs(10);

impl TermulPlanServer {
    fn subagent_frame(&self, tool: SubagentTool, input: Option<Value>) -> FrameRequest {
        FrameRequest {
            subagent_tool: Some(tool),
            subagent_input: input,
            ..self.frame(FrameKind::Subagent)
        }
    }

    /// A call the parent answers promptly.
    async fn subagent(&self, tool: SubagentTool, input: Option<Value>) -> CallToolResult {
        let request = self.subagent_frame(tool, input);
        self.text_call(tool.name(), request, ROUND_TRIP).await
    }

    /// A call the parent holds (spawn, wait): no timeout here, and a client
    /// cancel hangs up so the parent stops holding it.
    async fn parked_subagent(
        &self,
        tool: SubagentTool,
        input: Option<Value>,
        cancelled: CancellationToken,
    ) -> CallToolResult {
        let request = self.subagent_frame(tool, input);
        let reply = tokio::select! {
            reply = exchange_frame(&self.config, request) => reply,
            () = cancelled.cancelled() => {
                return CallToolResult::error(vec![ContentBlock::text(format!(
                    "{} cancelled by the client",
                    tool.name()
                ))]);
            }
        };
        match reply {
            Ok(reply) => text_result(reply),
            Err(error) => {
                eprintln!("[host-mcp-child] {}: {error}", tool.name());
                CallToolResult::error(vec![ContentBlock::text(format!(
                    "the Troupe host is unreachable: {error}"
                ))])
            }
        }
    }
}

fn arguments<T: serde::Serialize>(input: T) -> Option<Value> {
    serde_json::to_value(input).ok()
}

#[tool_router(router = subagent_tool_router, vis = "pub(super)")]
impl TermulPlanServer {
    #[tool(
        name = "subagent_list_agents",
        description = LIST_AGENTS_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn subagent_list_agents(&self) -> CallToolResult {
        self.subagent(SubagentTool::ListAgents, None).await
    }

    #[tool(
        name = "subagent_start",
        description = START_DESCRIPTION,
        annotations(destructive_hint = false, open_world_hint = true)
    )]
    async fn subagent_start(
        &self,
        Parameters(input): Parameters<SubagentStartInput>,
        cancelled: CancellationToken,
    ) -> CallToolResult {
        self.parked_subagent(SubagentTool::Start, arguments(input), cancelled)
            .await
    }

    #[tool(
        name = "subagent_wait",
        description = WAIT_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn subagent_wait(
        &self,
        Parameters(input): Parameters<SubagentWaitInput>,
        cancelled: CancellationToken,
    ) -> CallToolResult {
        self.parked_subagent(SubagentTool::Wait, arguments(input), cancelled)
            .await
    }

    #[tool(
        name = "subagent_status",
        description = STATUS_DESCRIPTION,
        annotations(read_only_hint = true, open_world_hint = false)
    )]
    async fn subagent_status(
        &self,
        Parameters(input): Parameters<SubagentStatusInput>,
    ) -> CallToolResult {
        self.subagent(SubagentTool::Status, arguments(input)).await
    }

    #[tool(
        name = "subagent_stop",
        description = STOP_DESCRIPTION,
        annotations(destructive_hint = true, open_world_hint = false)
    )]
    async fn subagent_stop(&self, Parameters(input): Parameters<SubagentRefInput>) -> CallToolResult {
        self.subagent(SubagentTool::Stop, arguments(input)).await
    }
}
