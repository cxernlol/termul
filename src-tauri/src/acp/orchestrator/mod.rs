//! The subagent orchestrator: lets a chat's agent start other installed ACP
//! agents as subagents, each on a private ephemeral session routed under
//! the chat.
//!
//! - [`run`] holds the run types, the state machine and the ledger
//!   (pure transitions).
//! - [`engine`] owns the ledger and every side effect: spawn, announce,
//!   supervise, settle, stop.
//! - [`settings`] is the host-side truth for the feature gates.
//! - [`sinks`] holds the child's filter and watcher sinks.
//! - [`worktree`] snapshots the parent's state and manages the per-run
//!   worktree.
//!
//! The engine is reached through the process-wide [`installed`] handle
//! (the automation-service pattern), installed at startup by BOTH binaries
//! where the `AcpManager` is built.

mod engine;
mod lifecycle;
mod run;
mod settings;
mod sinks;
mod worktree;

pub use engine::OrchestratorEngine;
#[cfg(test)]
pub(crate) use engine::engine_with_installed;
#[allow(unused_imports)]
pub use run::{
    AgentListing, CallerRef, RunId, RunLookupError, RunState, RunSummary, StartError, StartRequest,
    StopError, StopOutcome, WaitOutcome,
};
#[allow(unused_imports)]
pub use settings::{OrchestratorSettings, SettingsInput};

use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use tokio::runtime::Handle;

use crate::acp::install::AcpInstallService;
use crate::acp::manager::AcpManager;

static INSTALLED: OnceLock<Arc<OrchestratorEngine>> = OnceLock::new();

/// Build and install the host's engine, and return it. The first call
/// wins.
///
/// `data_dir` holds the settings file and the known-agents registry.
/// `installed_agents` feeds the launch listing and resolution for agents
/// the host installed from the catalog. `handle` spawns the engine's tasks
/// from contexts that hold no runtime (driver threads, `Drop`).
/// `project_roots` scopes the startup sweep of abandoned subagent
/// worktrees.
pub fn install(
    manager: Arc<AcpManager>,
    data_dir: PathBuf,
    installed_agents: Option<Arc<AcpInstallService>>,
    project_roots: Vec<PathBuf>,
    handle: Handle,
) -> Arc<OrchestratorEngine> {
    let engine = Arc::new(OrchestratorEngine::new(
        manager,
        data_dir,
        installed_agents,
        handle,
    ));
    worktree::sweep(&engine.handle, project_roots);
    if INSTALLED.set(engine.clone()).is_err() {
        log::warn!("[orchestrator] an engine was already installed");
    }
    engine
}

/// The host's engine, when the binary installed one.
pub fn installed() -> Option<Arc<OrchestratorEngine>> {
    INSTALLED.get().cloned()
}
