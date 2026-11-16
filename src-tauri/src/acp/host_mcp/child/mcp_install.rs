//! The `mcp_install` tool. It forwards the source to the parent and waits.
//! The user can take as long as they need. Secret values are never in this
//! process: the parent collects them on the approval card.

use rmcp::handler::server::wrapper::Parameters;
use rmcp::{tool, tool_router};

use super::TermulPlanServer;
use crate::acp::host_mcp::mcp_install::{McpInstallToolInput, MCP_INSTALL_DESCRIPTION};
use crate::acp::host_mcp::{FrameKind, FrameRequest};

#[tool_router(router = mcp_install_tool_router, vis = "pub(super)")]
impl TermulPlanServer {
    #[tool(name = "mcp_install", description = MCP_INSTALL_DESCRIPTION)]
    async fn mcp_install(
        &self,
        Parameters(input): Parameters<McpInstallToolInput>,
        cancelled: tokio_util::sync::CancellationToken,
    ) -> String {
        let request = FrameRequest {
            mcp_install: Some(input.into_form_request()),
            ..self.frame(FrameKind::McpInstall)
        };
        let reply = tokio::select! {
            reply = super::exchange_frame(&self.config, request) => reply,
            () = cancelled.cancelled() => {
                return "mcp_install cancelled by the client".to_string();
            }
        };
        match reply {
            Ok(reply) if reply.ok => reply
                .result
                .map(|value| value.to_string())
                .unwrap_or_else(|| "{}".to_string()),
            Ok(reply) => format!(
                "mcp_install error: {}",
                reply.error.unwrap_or_else(|| "unknown".to_string())
            ),
            Err(error) => format!("mcp_install transport error: {error}"),
        }
    }
}
