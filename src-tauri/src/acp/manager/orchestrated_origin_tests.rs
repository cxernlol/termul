//! Route seeding for orchestrated child sessions: a child session created
//! with a `ChildOrigin` routes its permission requests to the chat, while a
//! plain ephemeral session still has its permissions answered headlessly.
//! Drives the production command loop through a scripted mock agent.

use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use serde_json::Value;

use super::*;
use crate::web::EventSink;

const MOCK_CHILD: &str = r#"
import json, sys

def send(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

pending_prompt = None
perm_id = 900
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    method, rid = msg.get("method"), msg.get("id")
    if method == "initialize":
        send({"jsonrpc": "2.0", "id": rid, "result": {
            "protocolVersion": 1, "agentCapabilities": {}, "authMethods": []}})
    elif method == "session/new":
        send({"jsonrpc": "2.0", "id": rid, "result": {"sessionId": "sess-child"}})
    elif method == "session/prompt":
        session = msg["params"]["sessionId"]
        send({"jsonrpc": "2.0", "id": perm_id, "method": "session/request_permission",
              "params": {"sessionId": session,
                         "toolCall": {"toolCallId": "tc-1", "title": "run a tool"},
                         "options": [{"optionId": "allow", "name": "Allow",
                                      "kind": "allow_once"}]}})
        pending_prompt = rid
    elif "result" in msg and rid == perm_id:
        # The turn's stop reason reports the host's answer: end_turn for the
        # allow option, cancelled for a cancel, refusal for anything else.
        outcome = msg["result"].get("outcome", {})
        if outcome.get("outcome") == "selected" and outcome.get("optionId") == "allow":
            reason = "end_turn"
        elif outcome.get("outcome") == "cancelled":
            reason = "cancelled"
        else:
            reason = "refusal"
        send({"jsonrpc": "2.0", "id": pending_prompt, "result": {"stopReason": reason}})
        pending_prompt = None
"#;

#[derive(Default)]
struct EventLog(Mutex<Vec<(String, Option<String>, Value)>>);

impl EventSink for EventLog {
    fn emit(&self, event: &crate::web::sink::AcpEvent) {
        if event.type_ == "acp:permission_request" {
            self.0.lock().push((
                event.type_.to_string(),
                event.sid.clone(),
                event.payload.clone(),
            ));
        }
    }
}

fn find_python() -> Option<&'static str> {
    super::real_loop_tests::find_python()
}

async fn spawn_mock(
    acp: &Arc<AcpManager>,
    root: &std::path::Path,
) -> Result<AgentId, String> {
    let python = find_python().expect("python3 on PATH (set TERMUL_SKIP_REAL_LOOP_TESTS=1 to skip)");
    let script = root.join("agent.py");
    std::fs::write(&script, MOCK_CHILD).expect("script");
    acp.spawn(AgentConfig {
        config_id: None,
        name: "mock".to_string(),
        command: python.to_string(),
        args: vec!["-u".to_string(), script.to_string_lossy().into_owned()],
        env: HashMap::new(),
        allow_terminal: false,
    })
    .await
    .map(|spawned| spawned.agent_id)
}

fn origin(root: &str, parent: &str) -> ChildOrigin {
    ChildOrigin {
        root_session_id: root.to_string(),
        parent_session_id: parent.to_string(),
        parent_dispatch_id: None,
        dispatch_id: "termul-subagent:sub-9f2c1a".to_string(),
        depth: 1,
    }
}

async fn prompt(acp: &Arc<AcpManager>, agent: &AgentId, session: &SessionId) -> Result<StopReason, String> {
    let content = vec![ContentBlock::Text(
        agent_client_protocol::schema::v1::TextContent::new("go"),
    )];
    let started = acp.start_prompt(agent, session.clone(), content, None, None).await?;
    acp.wait_prompt(started).await
}

/// A child session seeded with an origin parks its permission requests and
/// surfaces them on the chat the origin names. `None` when the host opted
/// out of the real-loop tests.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_seeded_childs_permission_request_parks_on_the_chat() {
    if find_python().is_none() {
        return;
    }
    let _serial = super::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let root = tempfile::tempdir().expect("tempdir");
    let log = Arc::new(EventLog::default());
    let acp = Arc::new(AcpManager::new(vec![log.clone()]));
    let agent = spawn_mock(&acp, root.path()).await.expect("mock agent");
    let created = acp
        .new_session_with_context(
            &agent,
            root.path().to_string_lossy().into_owned(),
            vec![],
            SessionCreationContext {
                ephemeral: true,
                child_origin: Some(origin("chat-root", "chat-root")),
                ..SessionCreationContext::default()
            },
        )
        .await
        .expect("child session");
    let session = created.session_id;
    let acp_for_turn = acp.clone();
    let agent_for_turn = agent.clone();
    let session_for_turn = session.clone();
    let turn = tokio::spawn(async move {
        prompt(&acp_for_turn, &agent_for_turn, &session_for_turn).await
    });
    let request = wait_for_permission(&log).await;
    let (sid, payload) = request.expect("a permission request event");
    assert_eq!(sid.as_deref(), Some("chat-root"));
    assert_eq!(payload["agentId"], agent.0);
    assert_eq!(payload["sessionId"], "chat-root");
    let request_id = payload["requestId"].as_str().expect("request id").to_string();
    acp.respond_permission(&agent, request_id, Some("allow".to_string()))
        .await
        .expect("permission answered");
    let stop = tokio::time::timeout(Duration::from_secs(30), turn)
        .await
        .expect("turn bounded")
        .expect("prompt task alive")
        .expect("turn completes");
    assert_eq!(stop, StopReason::EndTurn);
    let _ = acp.kill(&agent).await;
}

async fn wait_for_permission(log: &EventLog) -> Option<(Option<String>, Value)> {
    for _ in 0..2000 {
        if let Some((_, sid, payload)) = log.0.lock().first() {
            return Some((sid.clone(), payload.clone()));
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    None
}

/// A plain ephemeral session (no origin) keeps the headless behavior: the
/// host answers its permission requests from the tool policies and no
/// permission event is fanned out.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn an_unseeded_ephemeral_session_still_answers_permissions_headlessly() {
    if find_python().is_none() {
        return;
    }
    let _serial = super::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let root = tempfile::tempdir().expect("tempdir");
    let log = Arc::new(EventLog::default());
    let acp = Arc::new(AcpManager::new(vec![log.clone()]));
    let agent = spawn_mock(&acp, root.path()).await.expect("mock agent");
    let created = acp
        .new_session_with_context(
            &agent,
            root.path().to_string_lossy().into_owned(),
            vec![],
            SessionCreationContext {
                ephemeral: true,
                ..SessionCreationContext::default()
            },
        )
        .await
        .expect("ephemeral session");
    let stop = tokio::time::timeout(
        Duration::from_secs(30),
        prompt(&acp, &agent, &created.session_id),
    )
    .await
    .expect("turn bounded")
    .expect("turn completes");
    assert_eq!(
        stop,
        StopReason::Cancelled,
        "with no allowlist the host cancels the permission"
    );
    assert!(
        log.0.lock().is_empty(),
        "no permission event reaches a sink for a headless session"
    );
    let _ = acp.kill(&agent).await;
}
