#![allow(clippy::unwrap_used, clippy::expect_used)]
//! The `subagent_*` parent arm's wire mapping: every engine refusal has its
//! contract code, runs serialize to the documented JSON, and inputs parse
//! with the documented casing. The engine itself is covered by
//! `orchestrator::engine_tests`.

use super::*;
use crate::acp::subagents::{SubagentUsage, SubagentWorkspace};

#[test]
fn every_start_refusal_has_its_contract_code() {
    let cases = [
        (StartError::Disabled, "disabled"),
        (StartError::UnknownAgent("x".into()), "unknown_agent"),
        (StartError::AgentNotAllowed("x".into()), "agent_not_allowed"),
        (StartError::Capacity { max: 4 }, "capacity"),
        (StartError::Depth { max: 2 }, "depth"),
        (StartError::InvalidInput("task"), "invalid_input"),
        (StartError::WorkspaceUnavailable("w".into()), "workspace_failed"),
        (StartError::SpawnFailed("s".into()), "spawn_failed"),
    ];
    for (error, code) in cases {
        let reply = start_refusal(&error);
        assert!(!reply.ok);
        assert_eq!(reply.code.as_deref(), Some(code));
        assert_eq!(reply.result.as_ref().unwrap()["code"], code);
        assert_eq!(reply.result.as_ref().unwrap()["message"], error.to_string());
    }
}

#[test]
fn a_settled_worktree_run_serializes_to_the_contract_shape() {
    let summary = RunSummary {
        run: RunId("sub-9f2c1a".to_string()),
        state: RunState::Completed,
        title: "Codex".to_string(),
        ended_at: Some(1_700_000_000_000),
        result: Some("done".to_string()),
        error: None,
        workspace: Some(SubagentWorkspace {
            mode: SubagentWorkspaceMode::Worktree,
            path: Some("/repo/.termul/worktrees/sub-9f2c1a".to_string()),
            branch: Some("troupe/sub/sub-9f2c1a".to_string()),
            base: Some("main @ 42be01e".to_string()),
            diff_stat: Some("2 files changed, +3 -1".to_string()),
        }),
        usage: Some(SubagentUsage {
            tool_uses: Some(5),
            duration_ms: Some(1200),
            ..SubagentUsage::default()
        }),
    };
    assert_eq!(
        summary_json(&summary),
        json!({
            "subagentId": "sub-9f2c1a",
            "state": "completed",
            "title": "Codex",
            "endedAt": 1_700_000_000_000u64,
            "result": "done",
            "workspace": {
                "mode": "worktree",
                "path": "/repo/.termul/worktrees/sub-9f2c1a",
                "branch": "troupe/sub/sub-9f2c1a",
                "base": "main @ 42be01e",
                "diffStat": "2 files changed, +3 -1",
            },
            "usage": { "toolUses": 5, "durationMs": 1200 },
        })
    );
}

#[test]
fn a_running_run_carries_no_settle_fields() {
    let summary = RunSummary {
        run: RunId("sub-000001".to_string()),
        state: RunState::RequiresAction,
        title: "Gemini".to_string(),
        ended_at: None,
        result: None,
        error: None,
        workspace: None,
        usage: None,
    };
    assert_eq!(
        summary_json(&summary),
        json!({ "subagentId": "sub-000001", "state": "requires_action", "title": "Gemini" })
    );
}

#[test]
fn status_with_no_arguments_parses_as_every_run() {
    let input: SubagentStatusInput = parse(None).expect("no arguments parse");
    assert!(input.subagent_ids.is_none());
}

#[test]
fn inputs_use_camel_case() {
    let wait: SubagentWaitInput =
        parse(Some(json!({ "subagentId": "sub-1", "timeoutMs": 5000 }))).expect("wait parses");
    assert_eq!(wait.subagent_id, "sub-1");
    assert_eq!(wait.timeout_ms, Some(5000));
    let start: SubagentStartInput = parse(Some(json!({
        "agent": "codex",
        "task": "fix it",
        "workspace": "shared",
    })))
    .expect("start parses");
    assert_eq!(start.workspace, Some(SubagentWorkspaceInput::Shared));
}

#[test]
fn a_malformed_input_names_the_missing_field() {
    let message = parse::<SubagentRefInput>(Some(json!({ "id": "sub-1" }))).unwrap_err();
    assert!(message.contains("subagentId"), "{message}");
}

#[test]
fn status_previews_a_long_result_and_flags_the_cut() {
    let summary = RunSummary {
        run: RunId("sub-000002".to_string()),
        state: RunState::Completed,
        title: "Codex".to_string(),
        ended_at: Some(5),
        result: Some("é".repeat(1_500)),
        error: None,
        workspace: None,
        usage: None,
    };
    let value = status_json(&summary);
    assert_eq!(value["result"], json!("é".repeat(1_000)));
    assert_eq!(value["resultTruncated"], json!(true));
    assert_eq!(
        summary_json(&summary)["result"],
        json!("é".repeat(1_500)),
        "wait keeps the whole result"
    );
    let short = RunSummary {
        result: Some("done".to_string()),
        ..summary
    };
    assert_eq!(status_json(&short), summary_json(&short));
}
