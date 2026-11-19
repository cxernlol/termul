#![allow(clippy::unwrap_used, clippy::expect_used)]
//! `stop_subagent` maps each refusal to a stable code. The success path, a
//! cancel that reaches the child session, is covered end to end by
//! `acp::manager::native_subagents_loop_tests`.

use super::*;

async fn stop(payload: Value) -> WsReply {
    let acp = Arc::new(AcpManager::new(vec![]));
    handle_stop_subagent("s1".to_string(), &payload, &acp).await
}

#[tokio::test]
async fn an_unknown_agent_is_not_found() {
    let reply = stop(json!({
        "agentId": "agent-gone",
        "rootSessionId": "chat-1",
        "subagentId": "child-1",
    }))
    .await;
    let error = reply.err.expect("refused");
    assert_eq!(error.code, "not_found");
    assert_eq!(error.message, "The agent of this chat is not running");
}

#[tokio::test]
async fn a_payload_without_the_subagent_is_refused() {
    let reply = stop(json!({ "agentId": "agent-1", "rootSessionId": "chat-1" })).await;
    let error = reply.err.expect("refused");
    assert_eq!(error.code, "unsupported");
    assert!(error
        .message
        .contains("want agentId, rootSessionId, subagentId"));
}

fn settings_patch(payload: Value) -> SubagentSettingsPayload {
    serde_json::from_value(payload).expect("the payload parses")
}

#[test]
fn a_settings_patch_keeps_every_omitted_field() {
    let mut merged = crate::acp::orchestrator::OrchestratorSettings {
        enabled: true,
        max_running: 4,
        max_depth: 2,
        agents: [("codex".to_string(), false)].into_iter().collect(),
    };
    merge_settings(
        &mut merged,
        settings_patch(json!({
            "maxDepth": 3,
            "agents": [{ "agentId": "gemini", "allowed": false }],
        })),
    );
    assert!(merged.enabled);
    assert_eq!(merged.max_running, 4);
    assert_eq!(merged.max_depth, 3);
    assert_eq!(merged.agents.get("codex"), Some(&false));
    assert_eq!(merged.agents.get("gemini"), Some(&false));
}

#[test]
fn a_settings_patch_turns_an_agent_back_on() {
    let mut merged = crate::acp::orchestrator::OrchestratorSettings {
        agents: [("codex".to_string(), false)].into_iter().collect(),
        ..Default::default()
    };
    merge_settings(
        &mut merged,
        settings_patch(json!({
            "enabled": false,
            "agents": [{ "agentId": "codex", "allowed": true }],
        })),
    );
    assert!(!merged.enabled);
    assert_eq!(merged.agents.get("codex"), Some(&true));
}

#[test]
fn a_settings_set_with_an_unknown_field_is_a_validation_error() {
    let reply = handle_subagent_settings_set("s1".to_string(), &json!({ "maxRuning": 3 }));
    let error = reply.err.expect("refused");
    assert_eq!(error.code, "VALIDATION_ERROR");
}
