//! The orchestrated card path: `orchestrated_updates` builds the announce,
//! change and settle cards from a record, and `AcpCommand::UpsertSubagent`
//! delivers them through the real command loop.

use std::sync::Arc;

use parking_lot::Mutex;
use serde_json::{json, Value};

use super::native_subagents::orchestrated_updates;
use super::*;
use crate::acp::subagents::{
    Subagent, SubagentAgent, SubagentCaps, SubagentEnd, SubagentEndReason, SubagentSource,
    SubagentState, SubagentStop, SubagentTranscript, SubagentWorkspace, SubagentWorkspaceMode,
};

const ROOT: &str = "chat-1";
const RUN: &str = "sub-9f2c1a";

fn orchestrated_record(state: SubagentState) -> Subagent {
    let record = Subagent {
        id: RUN.to_string(),
        root_session_id: ROOT.to_string(),
        parent_id: None,
        dispatch_tool_call_id: format!("termul-subagent:{RUN}"),
        source: SubagentSource::Orchestrated,
        title: "Codex".to_string(),
        description: Some("Run the test sweep".to_string()),
        role: None,
        prompt: Some("Run the test sweep and report failures.".to_string()),
        background: true,
        state,
        started_at: Some(10),
        ended_at: None,
        model: Some("gpt-5.5".to_string()),
        usage: None,
        output_file: None,
        agent: Some(SubagentAgent {
            name: "Codex".to_string(),
            config_id: Some("acp-registry:codex-acp".to_string()),
            agent_id: "agent-child".to_string(),
        }),
        workspace: Some(SubagentWorkspace {
            mode: SubagentWorkspaceMode::Worktree,
            path: Some("/repo/.termul/worktrees/sub-9f2c1a".to_string()),
            branch: Some(format!("troupe/sub/{RUN}")),
            base: Some("main @ 42be01e, with uncommitted changes".to_string()),
            diff_stat: None,
        }),
        caps: SubagentCaps {
            stop: Some(SubagentStop::SessionCancel),
            transcript: SubagentTranscript::Live,
            live_progress: true,
            usage: true,
        },
    };
    record
}

#[test]
fn a_first_record_announces_a_dispatch_tool_call_on_the_chat() {
    let state = Mutex::new(DriverState::new());
    let updates = orchestrated_updates(
        &mut state.lock(),
        orchestrated_record(SubagentState::Running),
        None,
        20,
    );
    assert_eq!(updates.len(), 1);
    assert_eq!(
        updates[0],
        json!({
            "sessionId": ROOT,
            "update": {
                "sessionUpdate": "tool_call",
                "toolCallId": "termul-subagent:sub-9f2c1a",
                "title": "Codex",
                "kind": "think",
                "status": "in_progress",
                "_meta": {
                    "termul/subagent": {
                        "id": RUN,
                        "rootSessionId": ROOT,
                        "dispatchToolCallId": "termul-subagent:sub-9f2c1a",
                        "source": "orchestrated",
                        "title": "Codex",
                        "description": "Run the test sweep",
                        "prompt": "Run the test sweep and report failures.",
                        "background": true,
                        "activity": "running",
                        "startedAt": 10,
                        "model": "gpt-5.5",
                        "agent": {
                            "name": "Codex",
                            "configId": "acp-registry:codex-acp",
                            "agentId": "agent-child",
                        },
                        "workspace": {
                            "mode": "worktree",
                            "path": "/repo/.termul/worktrees/sub-9f2c1a",
                            "branch": "troupe/sub/sub-9f2c1a",
                            "base": "main @ 42be01e, with uncommitted changes",
                        },
                        "caps": {
                            "stop": "session-cancel",
                            "transcript": "live",
                            "liveProgress": true,
                            "usage": true,
                        },
                    },
                },
            },
        })
    );
    assert!(
        state
            .lock()
            .subagent_records()
            .record(ROOT, "termul-subagent:sub-9f2c1a")
            .is_some(),
        "the record is upserted into the chat's records"
    );
    assert!(
        state.lock().subagent_route(RUN).is_none(),
        "no route is registered on the parent driver"
    );
}

#[test]
fn a_nested_run_announces_with_its_parents_dispatch() {
    let state = Mutex::new(DriverState::new());
    let mut nested = orchestrated_record(SubagentState::Running);
    nested.parent_id = Some("sub-parent1".to_string());
    let updates = orchestrated_updates(&mut state.lock(), nested, None, 20);
    assert_eq!(
        updates[0]["update"]["_meta"]["claudeCode"]["parentToolUseId"],
        "termul-subagent:sub-parent1"
    );
}

#[test]
fn a_state_change_reports_a_record_update_card() {
    let state = Mutex::new(DriverState::new());
    let mut locked = state.lock();
    orchestrated_updates(&mut locked, orchestrated_record(SubagentState::Running), None, 20);
    let updates =
        orchestrated_updates(&mut locked, orchestrated_record(SubagentState::RequiresAction), None, 30);
    drop(locked);
    assert_eq!(
        updates,
        vec![json!({
            "sessionId": ROOT,
            "update": {
                "sessionUpdate": "tool_call_update",
                "toolCallId": "termul-subagent:sub-9f2c1a",
                "_meta": {
                    "termul/subagent": json!({
                        "id": RUN,
                        "rootSessionId": ROOT,
                        "dispatchToolCallId": "termul-subagent:sub-9f2c1a",
                        "source": "orchestrated",
                        "title": "Codex",
                        "prompt": "Run the test sweep and report failures.",
                        "description": "Run the test sweep",
                        "background": true,
                        "activity": "requires_action",
                        "startedAt": 10,
                        "model": "gpt-5.5",
                        "agent": {
                            "name": "Codex",
                            "configId": "acp-registry:codex-acp",
                            "agentId": "agent-child",
                        },
                        "workspace": {
                            "mode": "worktree",
                            "path": "/repo/.termul/worktrees/sub-9f2c1a",
                            "branch": "troupe/sub/sub-9f2c1a",
                            "base": "main @ 42be01e, with uncommitted changes",
                        },
                        "caps": {
                            "stop": "session-cancel",
                            "transcript": "live",
                            "liveProgress": true,
                            "usage": true,
                        },
                    }),
                },
            },
        })]
    );
}

#[test]
fn a_settle_carries_the_result_content_and_the_idle_record() {
    let state = Mutex::new(DriverState::new());
    let mut locked = state.lock();
    orchestrated_updates(&mut locked, orchestrated_record(SubagentState::Running), None, 20);
    let mut settled = orchestrated_record(SubagentState::Idle {
        end: SubagentEnd {
            reason: SubagentEndReason::Completed,
            error: None,
        },
    });
    settled.ended_at = Some(40);
    let updates = orchestrated_updates(&mut locked, settled, Some("all green"), 40);
    drop(locked);
    assert_eq!(updates.len(), 1);
    let update = &updates[0]["update"];
    assert_eq!(update["sessionUpdate"], "tool_call_update");
    assert_eq!(update["toolCallId"], "termul-subagent:sub-9f2c1a");
    assert_eq!(update["status"], "completed");
    assert_eq!(
        update["content"],
        json!([{ "type": "content", "content": { "type": "text", "text": "all green" } }])
    );
    assert_eq!(
        update["_meta"]["termul/subagent"]["activity"],
        "idle"
    );
    assert_eq!(
        update["_meta"]["termul/subagent"]["end"]["reason"],
        "completed"
    );
    assert_eq!(update["_meta"]["termul/subagent"]["endedAt"], 40);
}

#[test]
fn a_repeated_record_with_no_content_reports_nothing() {
    let state = Mutex::new(DriverState::new());
    let mut locked = state.lock();
    orchestrated_updates(&mut locked, orchestrated_record(SubagentState::Running), None, 20);
    let repeat =
        orchestrated_updates(&mut locked, orchestrated_record(SubagentState::Running), None, 30);
    drop(locked);
    assert!(
        repeat.is_empty(),
        "an unchanged record with no content emits no card"
    );
}

#[test]
fn a_settle_record_without_a_stamp_gets_one() {
    let state = Mutex::new(DriverState::new());
    let mut unstamped = orchestrated_record(SubagentState::idle(SubagentEndReason::Cancelled));
    unstamped.ended_at = None;
    let updates = orchestrated_updates(&mut state.lock(), unstamped, None, 77);
    assert_eq!(
        updates[0]["update"]["_meta"]["termul/subagent"]["endedAt"],
        77
    );
}

#[test]
fn a_working_snapshot_after_the_settle_is_ignored() {
    let state = Mutex::new(DriverState::new());
    let mut locked = state.lock();
    orchestrated_updates(&mut locked, orchestrated_record(SubagentState::Running), None, 20);
    orchestrated_updates(
        &mut locked,
        orchestrated_record(SubagentState::idle(SubagentEndReason::Cancelled)),
        None,
        30,
    );
    let stale =
        orchestrated_updates(&mut locked, orchestrated_record(SubagentState::RequiresAction), None, 31);
    assert!(stale.is_empty(), "a stale change card is dropped");
    assert!(locked
        .subagent_records()
        .record(ROOT, "termul-subagent:sub-9f2c1a")
        .is_some_and(|record| record.state.is_idle()));
}

#[test]
fn a_failed_settle_without_content_marks_the_card_failed() {
    let state = Mutex::new(DriverState::new());
    let mut locked = state.lock();
    orchestrated_updates(&mut locked, orchestrated_record(SubagentState::Running), None, 20);
    let updates = orchestrated_updates(
        &mut locked,
        orchestrated_record(SubagentState::Idle {
            end: SubagentEnd {
                reason: SubagentEndReason::Failed,
                error: Some("boom".to_string()),
            },
        }),
        None,
        30,
    );
    assert_eq!(updates.len(), 1);
    assert_eq!(updates[0]["update"]["status"], "failed");
}

#[test]
fn a_settle_for_a_forgotten_record_announces_with_its_result() {
    let state = Mutex::new(DriverState::new());
    let settled = orchestrated_record(SubagentState::idle(SubagentEndReason::Completed));
    let updates = orchestrated_updates(&mut state.lock(), settled, Some("all green"), 40);
    assert_eq!(updates.len(), 1);
    let update = &updates[0]["update"];
    assert_eq!(update["sessionUpdate"], "tool_call");
    assert_eq!(update["status"], "completed");
    assert_eq!(
        update["content"],
        json!([{ "type": "content", "content": { "type": "text", "text": "all green" } }])
    );
}

#[test]
fn a_routed_child_update_nudges_the_childs_own_turn() {
    let state = Mutex::new(DriverState::new());
    let origin = ChildOrigin {
        root_session_id: ROOT.to_string(),
        parent_session_id: ROOT.to_string(),
        parent_dispatch_id: None,
        dispatch_id: format!("termul-subagent:{RUN}"),
        depth: 1,
    };
    state.lock().seed_child_route(&origin, "child-1");
    let idle = state.lock().try_begin_turn("child-1").expect("turn").idle_rx;
    let params = json!({
        "sessionId": "child-1",
        "update": {
            "sessionUpdate": "agent_message_chunk",
            "content": { "type": "text", "text": "working" },
        },
    });
    let _ = super::native_subagents::route_session_update(&state, &params, 20);
    assert!(
        idle.has_changed().expect("turn open"),
        "a streaming child is not idle"
    );
}

#[derive(Default)]
struct EventLog(Mutex<Vec<(String, Option<String>, Value)>>);

impl EventSink for EventLog {
    fn emit(&self, event: &crate::web::sink::AcpEvent) {
        self.0.lock().push((
            event.type_.to_string(),
            event.sid.clone(),
            event.payload.clone(),
        ));
    }
}

/// `AcpCommand::UpsertSubagent` through the real command loop of a spawned
/// agent: the cards reach the sinks as `acp:tool_call` / `acp:tool_call_update`
/// for the chat session. `None` when the host has no python (the loop tests
/// opt out), like `native_subagents_loop_tests`.
async fn upsert_through_a_real_driver() -> Option<Vec<(String, Option<String>, Value)>> {
    let python = ["python3", "python"].into_iter().find(|candidate| {
        std::process::Command::new(candidate)
            .arg("--version")
            .output()
            .is_ok_and(|output| output.status.success())
    })?;
    let root = tempfile::tempdir().expect("tempdir");
    let script = root.path().join("agent.py");
    std::fs::write(
        &script,
        r#"
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    method, rid = msg.get("method"), msg.get("id")
    if method == "initialize":
        send = {"jsonrpc": "2.0", "id": rid, "result": {
            "protocolVersion": 1, "agentCapabilities": {}, "authMethods": []}}
        sys.stdout.write(json.dumps(send) + "\n")
        sys.stdout.flush()
    elif method == "session/new":
        send = {"jsonrpc": "2.0", "id": rid, "result": {"sessionId": "mock-chat"}}
        sys.stdout.write(json.dumps(send) + "\n")
        sys.stdout.flush()
"#,
    )
    .expect("script");
    let log = Arc::new(EventLog::default());
    let acp = Arc::new(AcpManager::new(vec![log.clone()]));
    let spawned = acp
        .spawn(AgentConfig {
            config_id: None,
            name: "mock".to_string(),
            command: python.to_string(),
            args: vec!["-u".to_string(), script.to_string_lossy().into_owned()],
            env: HashMap::new(),
            allow_terminal: false,
        })
        .await
        .expect("mock agent initializes");
    let session = acp
        .new_session(
            &spawned.agent_id,
            root.path().to_string_lossy().into_owned(),
            vec![],
        )
        .await
        .expect("mock session");
    let chat = session.session_id.0.clone();
    let mut announced = orchestrated_record(SubagentState::Running);
    announced.root_session_id = chat.clone();
    acp.upsert_subagent_record(&spawned.agent_id, announced, None)
        .await
        .expect("announce delivered");
    let mut settled = orchestrated_record(SubagentState::Idle {
        end: SubagentEnd {
            reason: SubagentEndReason::Completed,
            error: None,
        },
    });
    settled.root_session_id = chat.clone();
    settled.ended_at = Some(40);
    acp.upsert_subagent_record(&spawned.agent_id, settled, Some("done".to_string()))
        .await
        .expect("settle delivered");
    let _ = acp.kill(&spawned.agent_id).await;
    let events: Vec<(String, Option<String>, Value)> = log
        .0
        .lock()
        .iter()
        .filter(|(kind, _, _)| {
            matches!(kind.as_str(), "acp:tool_call" | "acp:tool_call_update")
        })
        .cloned()
        .collect();
    Some(
        events
            .into_iter()
            .map(|(kind, sid, payload)| (kind, sid.filter(|sid| sid == &chat), payload))
            .collect(),
    )
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_command_loop_delivers_the_orchestrated_cards_for_the_chat() {
    let Some(events) = upsert_through_a_real_driver().await else {
        return;
    };
    let kinds: Vec<&str> = events.iter().map(|(kind, _, _)| kind.as_str()).collect();
    assert_eq!(kinds, ["acp:tool_call", "acp:tool_call_update"]);
    assert!(events
        .iter()
        .all(|(_, sid, _)| sid.as_deref() == Some("mock-chat")));
    let announce = &events[0].2["toolCall"];
    assert_eq!(announce["toolCallId"], "termul-subagent:sub-9f2c1a");
    assert_eq!(announce["kind"], "think");
    assert_eq!(announce["status"], "in_progress");
    assert_eq!(
        announce["_meta"]["termul/subagent"]["source"],
        "orchestrated"
    );
    let settle = &events[1].2["update"];
    assert_eq!(settle["toolCallId"], "termul-subagent:sub-9f2c1a");
    assert_eq!(settle["status"], "completed");
    assert_eq!(settle["content"][0]["content"]["text"], "done");
    assert_eq!(settle["_meta"]["termul/subagent"]["activity"], "idle");
}
