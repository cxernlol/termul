//! Parent handler for `mcp_install`: approve, decline, secret redaction,
//! duplicate, and unsupported. The catalog service and the host list are the
//! same ones Settings uses.

use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

use super::mcp_install::{tool_result, HostMcpInstall, McpInstallDecision, ToolOutcome};
use super::parent::HostPlanServer;
use crate::mcp_catalog::{McpCatalogService, RunnerAvailability};
use crate::web::mcp_registry::STORE_KEY;
use crate::web::sink::{AcpEvent, EventSink};
use crate::web::store::{StorePolicy, WebStore};

const SECRET: &str = "super-secret-token-1861";

const ALL_RUNNERS: RunnerAvailability = RunnerAvailability {
    npx: true,
    uvx: true,
    docker: true,
    dotnet: true,
};

struct Capture {
    events: StdMutex<Vec<(String, Value)>>,
}

impl EventSink for Capture {
    fn emit(&self, event: &AcpEvent) {
        self.events
            .lock()
            .unwrap()
            .push((event.type_.to_string(), event.payload.clone()));
    }
}

struct Harness {
    server: Arc<HostPlanServer>,
    store: Arc<WebStore>,
    sink: Arc<Capture>,
    port: u16,
    token: String,
    provisional: String,
    _dir: tempfile::TempDir,
}

fn harness(rows: Vec<Value>, runners: RunnerAvailability) -> Harness {
    let dir = tempfile::tempdir().unwrap();
    let store =
        Arc::new(WebStore::open(dir.path().join("store.json"), StorePolicy::default()).unwrap());
    let catalog = Arc::new(McpCatalogService::service_for_rows(rows, runners));
    let sink = Arc::new(Capture {
        events: StdMutex::new(Vec::new()),
    });
    let server = HostPlanServer::start(vec![sink.clone()], None);
    server.set_mcp_install_answer_floor_for_tests(Duration::ZERO);
    server.set_mcp_installer_for_tests(Arc::new(HostMcpInstall::for_tests(
        catalog,
        Arc::clone(&store),
    )));
    let (port, token, provisional) = server.register_session("agent-1");
    server.bind_session(&token, "sess-real");
    server.begin_turn("agent-1", "sess-real");
    Harness {
        server,
        store,
        sink,
        port,
        token,
        provisional,
        _dir: dir,
    }
}

fn keys_row() -> Value {
    json!({
        "server": {
            "name": "com.example/keys",
            "title": "Keys",
            "description": "A remote server with one secret.",
            "version": "1.0.0",
            "remotes": [{
                "type": "streamable-http",
                "url": "https://example.com/mcp",
                "headers": [{
                    "name": "Authorization",
                    "value": "Bearer {token}",
                    "variables": { "token": { "isSecret": true, "isRequired": true } }
                }]
            }]
        },
        "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    })
}

fn npm_row() -> Value {
    json!({
        "server": {
            "name": "com.example/pkg",
            "title": "Pkg",
            "description": "Needs npx.",
            "version": "1.0.0",
            "packages": [{
                "registryType": "npm",
                "identifier": "pkg-mcp",
                "version": "1.0.0",
                "transport": { "type": "stdio" }
            }]
        },
        "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active", "isLatest": true } }
    })
}

fn frame(harness: &Harness, source: Value) -> Value {
    json!({
        "token": harness.token,
        "session_id": harness.provisional,
        "kind": "mcp_install",
        "mcp_install": { "source": source },
    })
}

async fn send(port: u16, frame: &Value) -> Value {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let mut buf = serde_json::to_vec(frame).unwrap();
    buf.push(b'\n');
    stream.write_all(&buf).await.unwrap();
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    serde_json::from_str(&line).unwrap()
}

async fn wait_for_install(server: &HostPlanServer) -> String {
    for _ in 0..200 {
        if let Some(id) = server.open_mcp_install_ids().into_iter().next() {
            return id;
        }
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    panic!("mcp_install was never parked");
}

fn contains_secret(value: &impl std::fmt::Display) -> bool {
    value.to_string().contains(SECRET)
}

fn latest_card(sink: &Capture) -> Value {
    sink.events
        .lock()
        .unwrap()
        .iter()
        .rev()
        .find(|(kind, _)| kind == "acp:mcp_install_request")
        .map(|(_, payload)| payload.clone())
        .expect("approval card")
}

fn approve(
    server: &HostPlanServer,
    sink: &Capture,
    request_id: &str,
    secret_values: std::collections::BTreeMap<String, String>,
) {
    let card = latest_card(sink);
    server
        .answer_mcp_install(
            request_id,
            "sess-real",
            McpInstallDecision::Approve {
                inputs: Default::default(),
                secret_values,
                plan_id: card["planId"].as_str().unwrap().to_string(),
                launch_digest: card["launchDigest"].as_str().unwrap().to_string(),
            },
        )
        .unwrap();
}

fn stored_list(store: &WebStore) -> Value {
    store.peek(STORE_KEY).unwrap().unwrap_or(Value::Null)
}

#[test]
fn decline_saves_nothing_and_returns_declined() {
    let harness = harness(Vec::new(), ALL_RUNNERS);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let frame = frame(
            &harness,
            json!({
                "kind": "import",
                "json": r#"{"mcpServers":{"echo":{"command":"echo","args":["hi"]}}}"#,
            }),
        );
        let call = tokio::spawn(async move { send(harness.port, &frame).await });
        let request_id = wait_for_install(&harness.server).await;
        assert!(
            !call.is_finished(),
            "the call stays parked until the user decides"
        );
        assert!(harness
            .server
            .answer_mcp_install(&request_id, "sess-real", McpInstallDecision::Decline)
            .is_ok());
        let reply = call.await.unwrap();
        assert_eq!(reply["ok"], true);
        assert_eq!(reply["result"]["outcome"], "declined");
        assert_eq!(reply["result"]["nextSteps"][0]["kind"], "declined");
        assert!(
            stored_list(&harness.store).get("data").is_none()
                || stored_list(&harness.store)["data"]
                    .as_array()
                    .unwrap()
                    .is_empty()
        );
    });
}

#[test]
fn approve_installs_and_keeps_the_secret_out_of_the_result_events_and_logs() {
    let _ = crate::web::log_capture::logged_lines();
    let before = crate::web::log_capture::logged_lines().len();
    let harness = harness(vec![keys_row()], ALL_RUNNERS);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let frame = frame(
            &harness,
            json!({ "kind": "catalog", "name": "com.example/keys", "version": "1.0.0" }),
        );
        let port = harness.port;
        let call = tokio::spawn(async move { send(port, &frame).await });
        let request_id = wait_for_install(&harness.server).await;
        let card = harness
            .sink
            .events
            .lock()
            .unwrap()
            .iter()
            .find(|(kind, _)| kind == "acp:mcp_install_request")
            .map(|(_, payload)| payload.clone())
            .expect("approval card");
        assert_eq!(card["title"], "Keys");
        assert_eq!(card["transport"], "http");
        assert_eq!(card["consent"]["url"], "https://example.com/mcp");
        assert!(
            card.to_string().contains("Authorization")
                || card["form"]["fields"].to_string().contains("token")
        );
        assert!(!contains_secret(&card), "the card event has the secret");
        let secret_field = card["form"]["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|field| field["isSecret"] == true)
            .expect("secret field");
        let field_id = secret_field["id"].as_str().unwrap().to_string();
        approve(
            &harness.server,
            &harness.sink,
            &request_id,
            [(field_id, SECRET.to_string())].into(),
        );
        let reply = call.await.unwrap();
        assert_eq!(reply["result"]["outcome"], "installed", "{reply}");
        assert_eq!(reply["result"]["attached"], false);
        assert_eq!(reply["result"]["newSessionNeeded"], true);
        assert!(reply["result"]["nextSteps"]
            .as_array()
            .unwrap()
            .iter()
            .any(|step| step["kind"] == "new_session"));
        assert!(reply["result"]["nextSteps"]
            .as_array()
            .unwrap()
            .iter()
            .any(|step| step["kind"] == "oauth" || step["kind"] == "new_session"));
        let reply_text = reply.to_string();
        assert!(
            !reply_text.contains(SECRET),
            "tool result leaked the secret: {reply_text}"
        );
        let events = harness.sink.events.lock().unwrap().clone();
        for (kind, payload) in &events {
            assert!(
                !contains_secret(payload),
                "{kind} leaked the secret: {payload}"
            );
        }
        let stored = stored_list(&harness.store).to_string();
        assert!(
            stored.contains(SECRET),
            "the saved server must hold the secret the way Settings does"
        );
        assert!(stored.contains("com.example/keys"));
    });
    let leaked = crate::web::log_capture::logged_lines()
        .into_iter()
        .skip(before)
        .any(|line| line.contains(SECRET));
    assert!(!leaked, "a log line contains the secret");
}

#[test]
fn a_second_install_of_the_same_server_does_not_duplicate() {
    let harness = harness(Vec::new(), ALL_RUNNERS);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let source = json!({
        "kind": "import",
        "json": r#"{"mcpServers":{"echo":{"command":"echo","args":["hi"]}}}"#,
    });
    runtime.block_on(async {
        let first = frame(&harness, source.clone());
        let port = harness.port;
        let call = tokio::spawn(async move { send(port, &first).await });
        let request_id = wait_for_install(&harness.server).await;
        approve(&harness.server, &harness.sink, &request_id, Default::default());
        let reply = call.await.unwrap();
        assert_eq!(reply["result"]["outcome"], "installed", "{reply}");

        let second = frame(&harness, source);
        let port = harness.port;
        let again = send(port, &second).await;
        assert_eq!(again["result"]["outcome"], "already_exists", "{again}");
        assert_eq!(again["result"]["name"], "echo");
        let count = stored_list(&harness.store)["data"]
            .as_array()
            .unwrap()
            .len();
        assert_eq!(count, 1);
    });
}

#[test]
fn an_unsupported_source_returns_the_reason_and_saves_nothing() {
    let harness = harness(vec![npm_row()], RunnerAvailability::default());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let frame = frame(
            &harness,
            json!({ "kind": "catalog", "name": "com.example/pkg", "version": "1.0.0" }),
        );
        let reply = send(harness.port, &frame).await;
        assert_eq!(reply["result"]["outcome"], "unsupported", "{reply}");
        assert_eq!(reply["result"]["reason"]["code"], "needs-runtime");
        assert_eq!(reply["result"]["reason"]["runtime"], "npx");
        assert_eq!(reply["result"]["nextSteps"][0]["kind"], "runtime");
        assert!(harness.server.open_mcp_install_ids().is_empty());
        assert!(
            stored_list(&harness.store).as_object().is_none()
                || stored_list(&harness.store).get("data").is_none()
        );
    });
}

#[test]
fn an_import_whose_runtime_is_missing_still_installs_and_says_so() {
    let harness = harness(Vec::new(), RunnerAvailability::default());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let frame = frame(
            &harness,
            json!({
                "kind": "import",
                "json": r#"{"mcpServers":{"docs":{"command":"npx","args":["-y","docs-mcp"]}}}"#,
            }),
        );
        let port = harness.port;
        let call = tokio::spawn(async move { send(port, &frame).await });
        let request_id = wait_for_install(&harness.server).await;
        approve(&harness.server, &harness.sink, &request_id, Default::default());
        let reply = call.await.unwrap();
        assert_eq!(reply["result"]["outcome"], "installed", "{reply}");
        assert!(reply["result"]["nextSteps"]
            .as_array()
            .unwrap()
            .iter()
            .any(|step| step["kind"] == "runtime" && step["runtime"] == "npx"));
        assert!(reply["result"]["nextSteps"]
            .as_array()
            .unwrap()
            .iter()
            .any(|step| step["kind"] == "new_session"));
    });
}

#[test]
fn the_tool_result_builder_omits_secret_values() {
    let result = tool_result(ToolOutcome {
        outcome: "installed",
        name: Some("keys"),
        server_id: Some("id-1"),
        config: None,
        reason: None,
        attached: false,
        new_session_needed: true,
        next_steps: vec![json!({"kind": "new_session", "message": "Start a new chat."})],
    });
    assert!(!result.to_string().contains(SECRET));
    assert_eq!(result["outcome"], "installed");
    assert!(result.get("secrets").is_none());
    assert!(result.get("env").is_none());
}

#[test]
fn the_tool_description_says_attached_is_always_false() {
    assert!(
        super::mcp_install::MCP_INSTALL_DESCRIPTION.contains("`attached` is always false for now"),
        "the agent must not treat attached as a live connection"
    );
}

#[test]
fn an_import_shows_its_environment_on_the_card_and_refuses_node_options() {
    let harness = harness(Vec::new(), ALL_RUNNERS);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let blocked = frame(
            &harness,
            json!({
                "kind": "import",
                "json": r#"{"mcpServers":{"echo":{"command":"node","args":["server.js"],"env":{"NODE_OPTIONS":"--experimental-vm-modules"}}}}"#,
            }),
        );
        let reply = send(harness.port, &blocked).await;
        assert_eq!(reply["result"]["reason"]["code"], "denied-env", "{reply}");
        assert_eq!(reply["result"]["reason"]["name"], "NODE_OPTIONS");
        assert!(harness.server.open_mcp_install_ids().is_empty());

        let frame = frame(
            &harness,
            json!({
                "kind": "import",
                "json": r#"{"mcpServers":{"echo":{"command":"node","args":["server.js"],"env":{"LOG_LEVEL":"debug"}}}}"#,
            }),
        );
        let port = harness.port;
        let call = tokio::spawn(async move { send(port, &frame).await });
        let request_id = wait_for_install(&harness.server).await;
        let card = latest_card(&harness.sink);
        let env = card["consent"]["env"].to_string();
        assert!(env.contains("LOG_LEVEL"), "{card}");
        assert!(env.contains("debug"), "{card}");
        assert_eq!(card["name"], "echo");
        harness
            .server
            .answer_mcp_install(&request_id, "sess-real", McpInstallDecision::Decline)
            .unwrap();
        let _ = call.await.unwrap();
        assert!(
            stored_list(&harness.store).get("data").is_none()
                || stored_list(&harness.store)["data"].as_array().unwrap().is_empty()
        );
    });
}

#[test]
fn a_wrong_launch_digest_does_not_commit() {
    let harness = harness(Vec::new(), ALL_RUNNERS);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let frame = frame(
            &harness,
            json!({
                "kind": "import",
                "json": r#"{"mcpServers":{"echo":{"command":"echo","args":["hi"]}}}"#,
            }),
        );
        let port = harness.port;
        let call = tokio::spawn(async move { send(port, &frame).await });
        let request_id = wait_for_install(&harness.server).await;
        let card = latest_card(&harness.sink);
        harness
            .server
            .answer_mcp_install(
                &request_id,
                "sess-real",
                McpInstallDecision::Approve {
                    inputs: Default::default(),
                    secret_values: Default::default(),
                    plan_id: card["planId"].as_str().unwrap().to_string(),
                    launch_digest: "sha256:not-the-card".to_string(),
                },
            )
            .unwrap();
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(!call.is_finished(), "a mismatched digest must not finish the install");
        assert!(
            stored_list(&harness.store).get("data").is_none()
                || stored_list(&harness.store)["data"].as_array().unwrap().is_empty()
        );
        let again = latest_card(&harness.sink);
        assert!(again["error"].as_str().unwrap_or("").contains("out of date"));
        approve(&harness.server, &harness.sink, &request_id, Default::default());
        let reply = call.await.unwrap();
        assert_eq!(reply["result"]["outcome"], "installed", "{reply}");
    });
}

#[test]
fn a_missing_plan_is_planned_again_instead_of_an_error() {
    let harness = harness(Vec::new(), ALL_RUNNERS);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let frame = frame(
            &harness,
            json!({
                "kind": "import",
                "json": r#"{"mcpServers":{"echo":{"command":"echo","args":["hi"]}}}"#,
            }),
        );
        let port = harness.port;
        let call = tokio::spawn(async move { send(port, &frame).await });
        let request_id = wait_for_install(&harness.server).await;
        let card = latest_card(&harness.sink);
        let old_plan = card["planId"].as_str().unwrap().to_string();
        harness
            .server
            .forget_mcp_plan_for_tests(&request_id, &old_plan)
            .await;
        harness
            .server
            .answer_mcp_install(
                &request_id,
                "sess-real",
                McpInstallDecision::Approve {
                    inputs: Default::default(),
                    secret_values: Default::default(),
                    plan_id: old_plan.clone(),
                    launch_digest: card["launchDigest"].as_str().unwrap().to_string(),
                },
            )
            .unwrap();
        let mut refreshed = None;
        for _ in 0..100 {
            let next = latest_card(&harness.sink);
            if next["planId"].as_str() != Some(old_plan.as_str()) {
                refreshed = Some(next);
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let refreshed = refreshed.expect("the card was shown again with a new plan");
        assert!(refreshed["error"].as_str().unwrap_or("").contains("expired"));
        assert!(!call.is_finished());
        approve(&harness.server, &harness.sink, &request_id, Default::default());
        let reply = call.await.unwrap();
        assert_eq!(reply["result"]["outcome"], "installed", "{reply}");
    });
}

#[test]
fn the_first_answer_wins_and_a_wrong_session_does_not() {
    let harness = harness(Vec::new(), ALL_RUNNERS);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let frame = frame(
            &harness,
            json!({
                "kind": "import",
                "json": r#"{"mcpServers":{"echo":{"command":"echo","args":["hi"]}}}"#,
            }),
        );
        let port = harness.port;
        let call = tokio::spawn(async move { send(port, &frame).await });
        let request_id = wait_for_install(&harness.server).await;
        let wrong = harness.server.answer_mcp_install(
            &request_id,
            "other-session",
            McpInstallDecision::Decline,
        );
        assert_eq!(
            wrong,
            Err(super::mcp_install::McpInstallAnswerError::SessionMismatch)
        );
        assert!(!call.is_finished(), "the wrong session left the install open");
        harness
            .server
            .answer_mcp_install(&request_id, "sess-real", McpInstallDecision::Decline)
            .unwrap();
        let second = harness.server.answer_mcp_install(
            &request_id,
            "sess-real",
            McpInstallDecision::Decline,
        );
        assert_eq!(
            second,
            Err(super::mcp_install::McpInstallAnswerError::AlreadyResolved)
        );
        let unknown = harness.server.answer_mcp_install(
            "mcp-missing",
            "sess-real",
            McpInstallDecision::Decline,
        );
        assert_eq!(
            unknown,
            Err(super::mcp_install::McpInstallAnswerError::NotFound)
        );
        let reply = call.await.unwrap();
        assert_eq!(reply["result"]["outcome"], "declined");
        let finished = harness.server.answer_mcp_install(
            &request_id,
            "sess-real",
            McpInstallDecision::Decline,
        );
        assert_eq!(
            finished,
            Err(super::mcp_install::McpInstallAnswerError::AlreadyResolved)
        );
    });
}

#[test]
fn two_saves_at_once_keep_both_servers() {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(
        WebStore::open(dir.path().join("store.json"), StorePolicy::default()).unwrap(),
    );
    let catalog = Arc::new(McpCatalogService::service_for_rows(Vec::new(), ALL_RUNNERS));
    let installer = Arc::new(HostMcpInstall::for_tests(catalog, Arc::clone(&store)));
    std::thread::scope(|scope| {
        for index in 0..16 {
            let installer = Arc::clone(&installer);
            scope.spawn(move || {
                let entry = json!({
                    "id": format!("id-{index}"),
                    "name": format!("server-{index}"),
                    "type": "stdio",
                    "command": "echo",
                    "args": [],
                    "enabled": true
                });
                installer.save(&entry).unwrap();
            });
        }
    });
    let saved = stored_list(&store)["data"].as_array().cloned().unwrap_or_default();
    assert_eq!(saved.len(), 16, "{saved:?}");
}
