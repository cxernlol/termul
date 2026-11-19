//! Subagent WS handlers: `stop_subagent`, and the orchestrator's settings
//! view `subagent_settings_get` / `subagent_settings_set`.

use super::*;
use crate::acp::subagents::StopSubagentError;

/// `stop_subagent` → `AcpManager::stop_subagent(agent_id, root, subagent)`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StopSubagentPayload {
    agent_id: crate::acp::AgentId,
    root_session_id: String,
    subagent_id: String,
}

/// Replies `{ "outcome": "sent" | "already_ended" }`. An unknown agent or
/// subagent is `not_found`; a subagent the agent offers no stop for is
/// `unsupported`.
pub(super) async fn handle_stop_subagent(
    id: String,
    payload: &Value,
    acp: &Arc<AcpManager>,
) -> WsReply {
    let parsed: StopSubagentPayload = match serde_json::from_value(payload.clone()) {
        Ok(parsed) => parsed,
        Err(error) => {
            return WsReply::err(
                id,
                WsErrorCode::Unsupported,
                format!(
                    "malformed stop_subagent payload (want agentId, rootSessionId, subagentId): {error}"
                ),
            )
        }
    };
    let result = acp
        .stop_subagent(&parsed.agent_id, parsed.root_session_id, parsed.subagent_id)
        .await;
    match result {
        Ok(outcome) => WsReply::ok(id, Some(json!({ "outcome": outcome }))),
        Err(error @ (StopSubagentError::UnknownAgent | StopSubagentError::UnknownSubagent)) => {
            WsReply::err(id, WsErrorCode::NotFound, error.to_string())
        }
        Err(error @ StopSubagentError::NotStoppable) => {
            WsReply::err(id, WsErrorCode::Unsupported, error.to_string())
        }
        Err(StopSubagentError::Failed(error)) => acp_err_to_reply(id, error),
    }
}

/// The orchestrator's settings view: the gates plus every launchable agent
/// with its allow switch and default model.
fn settings_view(engine: &crate::acp::orchestrator::OrchestratorEngine) -> Value {
    let settings = engine.settings_view();
    let agents: Vec<Value> = engine
        .list_agents()
        .into_iter()
        .map(|agent| {
            json!({
                "agentId": agent.agent_id,
                "name": agent.name,
                "allowed": agent.allowed,
                "model": agent.default_model,
            })
        })
        .collect();
    json!({
        "enabled": settings.enabled,
        "maxRunning": settings.max_running,
        "maxDepth": settings.max_depth,
        "agents": agents,
    })
}

fn no_engine(id: String) -> WsReply {
    WsReply::err(
        id,
        WsErrorCode::Unsupported,
        "sub-agents are not available on this host",
    )
}

/// `subagent_settings_get` → the settings view.
pub(super) fn handle_subagent_settings_get(id: String) -> WsReply {
    let Some(engine) = crate::acp::orchestrator::installed() else {
        return no_engine(id);
    };
    WsReply::ok(id, Some(settings_view(&engine)))
}

/// One allow switch of a `subagent_settings_set` call.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AgentAllowPayload {
    agent_id: String,
    allowed: bool,
}

/// One default model of a `subagent_settings_set` call; `null` clears it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AgentModelPayload {
    agent_id: String,
    model: Option<String>,
}

/// `subagent_settings_set`: a partial of the view; an omitted field keeps
/// its value.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SubagentSettingsPayload {
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    max_running: Option<u32>,
    #[serde(default)]
    max_depth: Option<u8>,
    #[serde(default)]
    agents: Option<Vec<AgentAllowPayload>>,
    #[serde(default)]
    models: Option<Vec<AgentModelPayload>>,
}

/// Apply the payload's fields over `settings`.
fn merge_settings(
    settings: &mut crate::acp::orchestrator::OrchestratorSettings,
    patch: SubagentSettingsPayload,
) {
    if let Some(enabled) = patch.enabled {
        settings.enabled = enabled;
    }
    if let Some(max_running) = patch.max_running {
        settings.max_running = max_running;
    }
    if let Some(max_depth) = patch.max_depth {
        settings.max_depth = max_depth;
    }
    for agent in patch.agents.unwrap_or_default() {
        settings
            .agents
            .insert(agent.agent_id.trim().to_string(), agent.allowed);
    }
    for agent in patch.models.unwrap_or_default() {
        let key = agent.agent_id.trim().to_string();
        match agent.model {
            Some(model) => settings.models.insert(key, model),
            None => settings.models.remove(&key),
        };
    }
}

/// Merge `patch` into the settings, each agent under the key the listing
/// and `subagent_start` use, so a bare installed id is not saved unread.
fn apply_settings_patch(
    engine: &crate::acp::orchestrator::OrchestratorEngine,
    mut patch: SubagentSettingsPayload,
) -> Result<crate::acp::orchestrator::OrchestratorSettings, String> {
    for agent in patch.agents.iter_mut().flatten() {
        agent.agent_id = engine.canonical_agent(agent.agent_id.trim());
    }
    for agent in patch.models.iter_mut().flatten() {
        agent.agent_id = engine.canonical_agent(agent.agent_id.trim());
    }
    engine.update_settings(|settings| merge_settings(settings, patch))
}

/// `subagent_settings_set` → merge into the current settings, persist, and
/// answer the new view. Out-of-bounds values are `VALIDATION_ERROR`.
pub(super) fn handle_subagent_settings_set(id: String, payload: &Value) -> WsReply {
    let parsed: SubagentSettingsPayload = match serde_json::from_value(payload.clone()) {
        Ok(parsed) => parsed,
        Err(error) => {
            return WsReply::err_with_code(
                id,
                "VALIDATION_ERROR",
                format!("malformed subagent_settings_set payload: {error}"),
            )
        }
    };
    let Some(engine) = crate::acp::orchestrator::installed() else {
        return no_engine(id);
    };
    match apply_settings_patch(&engine, parsed) {
        Ok(_) => WsReply::ok(id, Some(settings_view(&engine))),
        Err(error) => WsReply::err_with_code(id, "VALIDATION_ERROR", error),
    }
}

#[cfg(test)]
#[path = "subagents_tests.rs"]
mod subagents_tests;
