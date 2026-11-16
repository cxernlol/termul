//! Test seams for a parked `mcp_install`. Not part of the production path.

use std::time::{Duration, Instant};

use tokio::sync::mpsc;

use super::super::HostPlanServer;
use super::OpenMcpInstall;
use crate::acp::host_mcp::mcp_install::{HostMcpInstall, McpInstallDecision};
use crate::mcp_catalog::PlanCaller;

use std::sync::Arc;

impl HostPlanServer {
    pub(crate) fn set_mcp_installer_for_tests(&self, installer: Arc<HostMcpInstall>) {
        *self.mcp_installer.lock() = Some(installer);
    }

    pub(crate) fn open_mcp_install_ids(&self) -> Vec<String> {
        self.pending_installs.lock().keys().cloned().collect()
    }

    /// Drop the answer floor so a test can answer as soon as the card exists.
    pub(crate) fn set_mcp_install_answer_floor_for_tests(&self, floor: Duration) {
        *self.mcp_install_answer_floor.lock() = floor;
    }

    /// Drop a plan so the next approve finds it missing. The caller matches
    /// the one `mcp_install` binds when it plans.
    pub async fn forget_mcp_plan_for_tests(&self, request_id: &str, plan_id: &str) {
        let Some(installer) = self.installer() else {
            return;
        };
        let caller = PlanCaller::Client(format!("host-mcp-{request_id}"));
        installer.cancel(plan_id, &caller).await;
    }

    /// Park an install with no catalog, so a route test can answer it.
    pub fn park_mcp_install_for_tests(
        &self,
        request_id: &str,
        session_id: &str,
    ) -> mpsc::UnboundedReceiver<McpInstallDecision> {
        let (sender, receiver) = mpsc::unbounded_channel();
        self.pending_installs.lock().insert(
            request_id.to_string(),
            OpenMcpInstall {
                session_id: session_id.to_string(),
                sender,
                answered: false,
                shown_at: Instant::now(),
            },
        );
        receiver
    }
}
