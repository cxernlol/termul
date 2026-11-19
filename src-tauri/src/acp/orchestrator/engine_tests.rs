//! The engine against the real manager: the fake parent driver answers the
//! engine's queries and cards, and a scripted mock agent (python3, stdio
//! JSON-RPC) runs as the spawned child through the production command loop.
//! `TERMUL_SKIP_REAL_LOOP_TESTS=1` skips, as in `real_loop_tests.rs`.

use std::sync::Arc;
use std::time::Duration;

use serde_json::json;
use tokio::runtime::Handle;

use super::*;
use crate::acp::config::SessionId;
use crate::acp::orchestrator::run::{ChildRun, RunBody, RunCapture, RunId, RunState, StartRequest};
use crate::acp::orchestrator::settings::OrchestratorSettings;

const MOCK_CHILD: &str = r#"
import json, sys

def send(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

hung = None
model = None
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
        send({"jsonrpc": "2.0", "id": rid, "result": {"sessionId": "child-1"}})
    elif method == "session/prompt":
        task = msg["params"]["prompt"][0].get("text", "")
        if task == "report-model":
            send({"jsonrpc": "2.0", "method": "session/update", "params": {
                "sessionId": "child-1",
                "update": {"sessionUpdate": "agent_message_chunk",
                           "content": {"type": "text", "text": "model=%s" % model}}}})
            send({"jsonrpc": "2.0", "id": rid, "result": {"stopReason": "end_turn"}})
        elif task == "finish":
            send({"jsonrpc": "2.0", "method": "session/update", "params": {
                "sessionId": "child-1",
                "update": {"sessionUpdate": "agent_message_chunk",
                           "content": {"type": "text", "text": "all green"}}}})
            send({"jsonrpc": "2.0", "id": rid, "result": {"stopReason": "end_turn"}})
        else:
            hung = rid
    elif method == "session/set_config_option":
        model = msg["params"].get("value")
        send({"jsonrpc": "2.0", "id": rid, "result": {"configOptions": []}})
    elif method == "session/cancel":
        if hung is not None:
            send({"jsonrpc": "2.0", "id": hung, "result": {"stopReason": "cancelled"}})
            hung = None
"#;

const CHAT: &str = "chat-1";

#[derive(Default)]
struct EventLog(Mutex<Vec<crate::web::sink::AcpEvent>>);

impl EventSink for EventLog {
    fn emit(&self, event: &crate::web::sink::AcpEvent) {
        self.0.lock().push(event.clone());
    }
}

fn find_python() -> Option<&'static str> {
    crate::acp::manager::real_loop_tests::find_python()
}

struct EngineTest {
    engine: Arc<OrchestratorEngine>,
    caller: crate::acp::orchestrator::CallerRef,
    _data: tempfile::TempDir,
    _cwd: tempfile::TempDir,
}

fn engine_test(task_mode: &str) -> Option<EngineTest> {
    let _ = task_mode;
    let python = find_python()?;
    Some(engine_with_child(python))
}

/// An engine whose registry names a mock child launched by `command`. The
/// tests that never spawn the child pass a command that does not exist.
fn engine_with_child(command: &str) -> EngineTest {
    let data = tempfile::tempdir().expect("data dir");
    let cwd = tempfile::tempdir().expect("cwd dir");
    let script = cwd.path().join("child.py");
    std::fs::write(&script, MOCK_CHILD).expect("script");
    let agent = AgentConfig {
        config_id: Some("mock-sub".to_string()),
        name: "Mock Sub".to_string(),
        command: command.to_string(),
        args: vec!["-u".to_string(), script.to_string_lossy().into_owned()],
        env: std::collections::HashMap::new(),
        allow_terminal: false,
    };
    std::fs::write(
        data.path().join(crate::automation::agents::FILE_NAME),
        json!({"schema_version": 1, "agents": {"mock-sub": agent}}).to_string(),
    )
    .expect("registry");
    let log = Arc::new(EventLog::default());
    let acp = Arc::new(crate::acp::manager::AcpManager::new(vec![log.clone()]));
    let parent = AgentId("agent-parent".to_string());
    acp.install_test_agent_with_session_roots(
        parent.clone(),
        vec![(CHAT.to_string(), cwd.path().to_path_buf(), false)],
    );
    let engine = Arc::new(OrchestratorEngine::new(
        acp,
        data.path().to_path_buf(),
        None,
        Handle::current(),
    ));
    EngineTest {
        engine,
        caller: crate::acp::orchestrator::CallerRef {
            agent: parent,
            session: SessionId(CHAT.to_string()),
        },
        _data: data,
        _cwd: cwd,
    }
}

fn request(task: &str) -> StartRequest {
    StartRequest {
        agent: "mock-sub".to_string(),
        task: task.to_string(),
        workspace: SubagentWorkspaceMode::Shared,
        title: None,
        model: None,
    }
}

async fn wait_settled(
    engine: &Arc<OrchestratorEngine>,
    caller: &crate::acp::orchestrator::CallerRef,
    run: &RunId,
) -> crate::acp::orchestrator::RunSummary {
    let outcome = engine
        .wait(caller.clone(), run.clone(), Duration::from_secs(60))
        .await
        .expect("wait resolves");
    let crate::acp::orchestrator::WaitOutcome::Settled(summary) = outcome else {
        panic!("the run should settle within the budget");
    };
    *summary
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_run_starts_settles_completed_and_carries_the_result() {
    let Some(test) = engine_test("finish") else {
        return;
    };
    let _serial = crate::acp::manager::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let engine = test.engine.clone();
    let caller = test.caller.clone();
    let summary = engine
        .start(caller.clone(), request("finish"))
        .await
        .expect("run starts");
    assert_eq!(summary.state, RunState::Running);
    assert_eq!(summary.title, "Mock Sub");
    let run = summary.run.clone();
    let settled = wait_settled(&engine, &caller, &run).await;
    assert_eq!(settled.state, RunState::Completed);
    assert_eq!(settled.result.as_deref(), Some("all green"));
    assert_eq!(settled.title, "Mock Sub");
    assert!(settled.usage.is_some());
    assert!(
        engine.ledger.lock().runs.get(&run).is_some_and(|entry| !entry.is_live()),
        "the ledger keeps the settled run for status"
    );
    let status = engine
        .status(caller, None)
        .expect("status")
        .into_iter()
        .map(|summary| summary.run)
        .collect::<Vec<_>>();
    assert_eq!(status, vec![run]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn wait_reports_the_budget_end_as_an_outcome() {
    let Some(test) = engine_test("hang") else {
        return;
    };
    let _serial = crate::acp::manager::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let engine = test.engine.clone();
    let caller = test.caller.clone();
    let summary = engine.start(caller.clone(), request("hang")).await.expect("run starts");
    let outcome = engine
        .wait(caller.clone(), summary.run.clone(), Duration::from_millis(100))
        .await
        .expect("wait answers");
    match outcome {
        crate::acp::orchestrator::WaitOutcome::TimedOut { state } => {
            assert_eq!(state, RunState::Running);
        }
        other => panic!("the budget end is an outcome, not a settle: {other:?}"),
    }
    engine
        .stop(caller, summary.run)
        .await
        .expect("cleanup stop");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stop_converges_and_settles_cancelled() {
    let Some(test) = engine_test("hang") else {
        return;
    };
    let _serial = crate::acp::manager::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let engine = test.engine.clone();
    let caller = test.caller.clone();
    let summary = engine.start(caller.clone(), request("hang")).await.expect("run starts");
    let run = summary.run.clone();
    assert_eq!(
        engine.stop(caller.clone(), run.clone()).await.expect("stop"),
        crate::acp::orchestrator::StopOutcome::Sent
    );
    let settled = wait_settled(&engine, &caller, &run).await;
    assert_eq!(settled.state, RunState::Cancelled);
    assert!(
        engine
            .stop(caller, run)
            .await
            .is_ok_and(|outcome| outcome == crate::acp::orchestrator::StopOutcome::AlreadyEnded),
        "a repeated stop converges"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn every_waiter_resolves_exactly_once() {
    let Some(test) = engine_test("hang") else {
        return;
    };
    let _serial = crate::acp::manager::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let engine = test.engine.clone();
    let caller = test.caller.clone();
    let summary = engine.start(caller.clone(), request("hang")).await.expect("run starts");
    let run = summary.run.clone();
    let waiter = |engine: Arc<OrchestratorEngine>| {
        let (caller, run) = (caller.clone(), run.clone());
        tokio::spawn(async move { engine.wait(caller, run, Duration::from_secs(60)).await })
    };
    let first = waiter(engine.clone());
    let second = waiter(engine.clone());
    while engine.ledger.lock().runs.get(&run).map_or(0, |entry| entry.waiters.len()) < 2 {
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    engine.stop(test.caller.clone(), run.clone()).await.expect("stop");
    let (first, second) = tokio::join!(first, second);
    for outcome in [first, second] {
        let outcome = outcome.expect("waiter task").expect("waiter resolves");
        assert!(matches!(
            outcome,
            crate::acp::orchestrator::WaitOutcome::Settled(_)
        ));
    }
    // After the settle, a new wait answers at once.
    let again = engine
        .wait(test.caller, run, Duration::from_secs(1))
        .await
        .expect("settled wait");
    assert!(matches!(
        again,
        crate::acp::orchestrator::WaitOutcome::Settled(_)
    ));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn chat_closed_stops_the_live_runs() {
    let Some(test) = engine_test("hang") else {
        return;
    };
    let _serial = crate::acp::manager::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let engine = test.engine.clone();
    let caller = test.caller.clone();
    let summary = engine.start(caller.clone(), request("hang")).await.expect("run starts");
    engine.chat_closed(CHAT).await;
    let settled = wait_settled(&engine, &caller, &summary.run).await;
    assert_eq!(settled.state, RunState::Cancelled);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_gone_parent_agent_stops_its_runs() {
    let Some(test) = engine_test("hang") else {
        return;
    };
    let _serial = crate::acp::manager::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let engine = test.engine.clone();
    let caller = test.caller.clone();
    let summary = engine.start(caller.clone(), request("hang")).await.expect("run starts");
    let cards = engine.on_agent_gone(&caller.agent);
    let settled = wait_settled(&engine, &caller, &summary.run).await;
    assert_eq!(settled.state, RunState::Cancelled);
    assert_eq!(cards.len(), 1, "the dying driver gets the settle card");
    assert_eq!(cards[0].0.id, summary.run.0);
    assert!(cards[0].0.state.is_idle());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn stop_from_ui_answers_only_this_engines_runs() {
    let Some(test) = engine_test("hang") else {
        return;
    };
    let _serial = crate::acp::manager::real_loop_tests::TIMEOUT_TEST_LOCK.lock().await;
    let engine = test.engine.clone();
    let caller = test.caller.clone();
    assert!(
        engine.stop_from_ui(CHAT, "sub-notours").await.is_none(),
        "an unknown id falls through to the native path"
    );
    let summary = engine.start(caller.clone(), request("hang")).await.expect("run starts");
    let run = summary.run.clone();
    assert!(
        engine
            .stop_from_ui(CHAT, run.as_str())
            .await
            .is_some_and(|result| result.is_ok()),
        "a live run is stopped through the interception"
    );
    wait_settled(&engine, &caller, &run).await;
    assert!(
        engine
            .stop_from_ui(CHAT, run.as_str())
            .await
            .is_some_and(|result| {
                result.is_ok_and(|outcome| {
                    outcome == crate::acp::orchestrator::StopOutcome::AlreadyEnded
                })
            }),
        "a settled run answers AlreadyEnded"
    );
}

fn seeded_run(engine: &OrchestratorEngine, session: &str, depth: u8) -> RunId {
    let run = RunId::mint();
    let entry = ChildRun {
        run: run.clone(),
        root: CHAT.to_string(),
        parent_agent: AgentId("agent-parent".to_string()),
        parent_run: None,
        depth,
        identity: crate::acp::subagents::SubagentAgent {
            name: "Mock Sub".to_string(),
            config_id: None,
            agent_id: "agent-seeded".to_string(),
        },
        title: "seeded".to_string(),
        task: "seeded task".to_string(),
        model: None,
        created_ms: 1,
        workspace: crate::acp::subagents::SubagentWorkspace {
            mode: SubagentWorkspaceMode::Shared,
            path: None,
            branch: None,
            base: None,
            diff_stat: None,
        },
        base_commit: None,
        body: RunBody::Live {
            child_agent: AgentId("agent-seeded".to_string()),
            session: SessionId(session.to_string()),
            awaiting_permission: false,
        },
        result: None,
        waiters: Vec::new(),
        capture: Arc::new(RunCapture::default()),
    };
    engine.ledger.lock().insert(entry);
    run
}

/// An engine for the tests that never spawn the child: no python needed.
fn refusal_engine() -> EngineTest {
    engine_with_child("troupe-test-no-such-agent")
}

#[tokio::test]
async fn start_refuses_each_settings_gate() {
    let test = refusal_engine();
    let engine = &test.engine;
    let caller = test.caller.clone();

    engine
        .set_settings(OrchestratorSettings {
            enabled: false,
            ..OrchestratorSettings::default()
        })
        .expect("settings");
    assert_eq!(
        engine.start(caller.clone(), request("finish")).await,
        Err(crate::acp::orchestrator::StartError::Disabled)
    );
    engine
        .set_settings(OrchestratorSettings::default())
        .expect("settings");

    let mut disallowed = OrchestratorSettings::default();
    disallowed
        .agents
        .insert("mock-sub".to_string(), false);
    engine.set_settings(disallowed).expect("settings");
    assert_eq!(
        engine.start(caller.clone(), request("finish")).await,
        Err(crate::acp::orchestrator::StartError::AgentNotAllowed(
            "mock-sub".to_string()
        ))
    );
    engine.set_settings(OrchestratorSettings::default()).expect("settings");

    let unknown = StartRequest {
        agent: "no-such-agent".to_string(),
        ..request("finish")
    };
    assert_eq!(
        engine.start(caller.clone(), unknown).await,
        Err(crate::acp::orchestrator::StartError::UnknownAgent(
            "no-such-agent".to_string()
        ))
    );

    let empty_task = StartRequest {
        task: String::new(),
        ..request("finish")
    };
    assert_eq!(
        engine.start(caller.clone(), empty_task).await,
        Err(crate::acp::orchestrator::StartError::InvalidInput("task"))
    );

    let seeded = seeded_run(engine, "sess-seed", 1);
    let at_capacity = OrchestratorSettings {
        max_running: 1,
        ..OrchestratorSettings::default()
    };
    engine.set_settings(at_capacity).expect("settings");
    assert_eq!(
        engine.start(caller.clone(), request("finish")).await,
        Err(crate::acp::orchestrator::StartError::Capacity { max: 1 })
    );
    engine.ledger.lock().remove(&seeded);

    let nested = seeded_run(engine, "sess-nested", 2);
    // A nested call comes from the child agent that runs the seeded session.
    let nested_caller = crate::acp::orchestrator::CallerRef {
        agent: AgentId("agent-seeded".to_string()),
        session: SessionId("sess-nested".to_string()),
    };
    assert_eq!(
        engine.start(nested_caller, request("finish")).await,
        Err(crate::acp::orchestrator::StartError::Depth { max: 2 })
    );
    engine.ledger.lock().remove(&nested);
}

#[tokio::test]
async fn status_and_wait_refuse_another_chats_run() {
    let test = refusal_engine();
    let engine = &test.engine;
    let seeded = seeded_run(engine, "sess-seed", 1);
    let foreign = crate::acp::orchestrator::CallerRef {
        agent: AgentId("agent-other".to_string()),
        session: SessionId("chat-9".to_string()),
    };
    assert!(
        engine
            .wait(foreign.clone(), seeded.clone(), Duration::from_secs(1))
            .await
            .is_err()
    );
    assert!(
        engine
            .status(foreign, Some(vec![seeded.clone()]))
            .is_err()
    );
    let unknown = engine
        .status(test.caller.clone(), Some(vec![RunId("sub-nope".to_string())]));
    assert!(unknown.is_err());
    engine.ledger.lock().remove(&seeded);
}

#[tokio::test]
async fn worktree_mode_is_refused_outside_a_repository() {
    let test = refusal_engine();
    let engine = &test.engine;
    let worktree = StartRequest {
        workspace: SubagentWorkspaceMode::Worktree,
        ..request("finish")
    };
    match engine.start(test.caller.clone(), worktree).await {
        Err(crate::acp::orchestrator::StartError::WorkspaceUnavailable(_)) => {}
        other => panic!("worktree mode must refuse: {other:?}"),
    }
}

#[tokio::test]
async fn the_listing_names_the_registry_agent_and_its_allowance() {
    let test = refusal_engine();
    let engine = &test.engine;
    let listed = engine.list_agents();
    assert_eq!(
        listed,
        vec![crate::acp::orchestrator::AgentListing {
            agent_id: "mock-sub".to_string(),
            name: "Mock Sub".to_string(),
            allowed: true,
            default_model: None,
        }]
    );
    let mut disallowed = OrchestratorSettings::default();
    disallowed.agents.insert("mock-sub".to_string(), false);
    engine.set_settings(disallowed).expect("settings");
    assert!(!engine.list_agents()[0].allowed);
}

/// Seed a start in flight for `CHAT`, as `reserve` records one.
fn seeded_start(engine: &OrchestratorEngine, parent: &str) -> tokio_util::sync::CancellationToken {
    let cancel = tokio_util::sync::CancellationToken::new();
    engine.ledger.lock().starting.insert(
        RunId::mint(),
        crate::acp::orchestrator::run::Starting {
            root: CHAT.to_string(),
            parent_agent: AgentId(parent.to_string()),
            cancel: cancel.clone(),
        },
    );
    cancel
}

#[tokio::test]
async fn a_start_in_flight_holds_a_capacity_slot() {
    let test = refusal_engine();
    let engine = &test.engine;
    engine
        .set_settings(OrchestratorSettings {
            max_running: 1,
            ..OrchestratorSettings::default()
        })
        .expect("settings");
    let _pending = seeded_start(engine, "agent-parent");
    assert_eq!(
        engine.start(test.caller.clone(), request("finish")).await,
        Err(crate::acp::orchestrator::StartError::Capacity { max: 1 })
    );
}

#[tokio::test]
async fn closing_the_chat_cancels_its_starts_in_flight() {
    let test = refusal_engine();
    let engine = &test.engine;
    let cancel = seeded_start(engine, "agent-parent");
    engine.chat_closed("another-chat").await;
    assert!(!cancel.is_cancelled(), "another chat's close leaves it");
    engine.chat_closed(CHAT).await;
    assert!(cancel.is_cancelled());
}

#[tokio::test]
async fn a_gone_parent_agent_cancels_its_starts_in_flight() {
    let test = refusal_engine();
    let engine = &test.engine;
    let mine = seeded_start(engine, "agent-parent");
    let other = seeded_start(engine, "agent-other");
    engine.on_agent_gone(&AgentId("agent-parent".to_string()));
    assert!(mine.is_cancelled());
    assert!(!other.is_cancelled());
}

#[tokio::test]
async fn a_finished_start_frees_its_slot() {
    let test = refusal_engine();
    let engine = &test.engine;
    let refused = StartRequest {
        workspace: SubagentWorkspaceMode::Worktree,
        ..request("finish")
    };
    assert!(engine.start(test.caller.clone(), refused).await.is_err());
    assert!(
        engine.ledger.lock().starting.is_empty(),
        "a failed start releases its reservation"
    );
}

#[tokio::test]
async fn an_agent_recorded_after_startup_is_listed_and_resolved() {
    let test = refusal_engine();
    let engine = &test.engine;
    // The spawn path records into the automation service's registry, which
    // writes the same file; the engine must see it without a restart.
    let writer = crate::automation::agents::AgentRegistry::open(
        test._data.path().join(crate::automation::agents::FILE_NAME),
    );
    let late = |id: &str, name: &str| AgentConfig {
        config_id: Some(id.to_string()),
        name: name.to_string(),
        command: "late".to_string(),
        args: Vec::new(),
        env: std::collections::HashMap::new(),
        allow_terminal: false,
    };
    writer.record(&late("late-agent", "Late Agent"));
    assert!(engine
        .list_agents()
        .iter()
        .any(|agent| agent.name == "Late Agent"));
    // Recorded after the listing refreshed: only resolve's own reload sees it.
    let later = late("later-agent", "Later Agent");
    writer.record(&later);
    let key = crate::automation::agents::agent_key(&later);
    assert!(engine.resolve_agent(&key).is_ok());
}

#[tokio::test]
async fn stopping_a_run_that_is_still_starting_cancels_the_start() {
    let test = refusal_engine();
    let engine = &test.engine;
    let run = seeded_run(engine, "child-starting", 1);
    let cancel = tokio_util::sync::CancellationToken::new();
    {
        let mut ledger = engine.ledger.lock();
        ledger.runs.get_mut(&run).expect("seeded").body = RunBody::Spawning {
            child_agent: AgentId("agent-seeded".to_string()),
        };
        ledger.starting.insert(
            run.clone(),
            crate::acp::orchestrator::run::Starting {
                root: CHAT.to_string(),
                parent_agent: AgentId("agent-parent".to_string()),
                cancel: cancel.clone(),
            },
        );
    }
    let outcome = engine.stop_from_ui(CHAT, run.as_str()).await;
    assert_eq!(outcome, Some(Ok(crate::acp::orchestrator::StopOutcome::Sent)));
    assert!(cancel.is_cancelled(), "the start is cancelled, not reported ended");
}

#[tokio::test]
async fn a_second_stop_before_the_run_settles_answers_sent() {
    let test = refusal_engine();
    let engine = &test.engine;
    let run = seeded_run(engine, "child-stopping", 1);
    engine.ledger.lock().runs.get_mut(&run).expect("seeded").body = RunBody::Stopping {
        child_agent: AgentId("agent-seeded".to_string()),
        session: SessionId("child-stopping".to_string()),
        since_ms: 1,
    };
    assert_eq!(
        engine.stop_from_ui(CHAT, run.as_str()).await,
        Some(Ok(crate::acp::orchestrator::StopOutcome::Sent))
    );
}

#[tokio::test]
async fn an_abandoned_start_leaves_no_run_and_frees_its_slot() {
    let test = refusal_engine();
    let engine = &test.engine;
    let abandoned = tokio_util::sync::CancellationToken::new();
    abandoned.cancel();
    let outcome = engine
        .start_until(test.caller.clone(), request("finish"), abandoned)
        .await;
    assert!(
        matches!(outcome, Err(crate::acp::orchestrator::StartError::SpawnFailed(_))),
        "{outcome:?}"
    );
    let ledger = engine.ledger.lock();
    assert!(ledger.starting.is_empty(), "the slot is freed");
    assert!(
        ledger.runs.values().all(|run| !run.is_live()),
        "no run is left live"
    );
}

#[tokio::test]
async fn a_gone_parent_agent_hands_back_its_runs_settle_cards() {
    let test = refusal_engine();
    let engine = &test.engine;
    let run = seeded_run(engine, "child-orphan", 1);
    let cards = engine.on_agent_gone(&AgentId("agent-parent".to_string()));
    assert_eq!(cards.len(), 1);
    let (record, content) = &cards[0];
    assert_eq!(record.id, run.0);
    assert_eq!(
        record.state,
        crate::acp::subagents::SubagentState::Idle {
            end: crate::acp::subagents::SubagentEnd {
                reason: crate::acp::subagents::SubagentEndReason::Cancelled,
                error: None,
            }
        }
    );
    assert_eq!(*content, None);
    assert!(
        engine.on_agent_gone(&AgentId("agent-parent".to_string())).is_empty(),
        "a settled run is not handed back twice"
    );
}

#[tokio::test]
async fn a_stop_is_accepted_without_waiting_on_the_child() {
    let test = refusal_engine();
    let engine = &test.engine;
    // The seeded child agent is not running: its cancel cannot be delivered,
    // and the stop still answers Sent, with the backstop owning the settle.
    let run = seeded_run(engine, "child-gone", 1);
    assert_eq!(
        engine.stop_from_ui(CHAT, run.as_str()).await,
        Some(Ok(crate::acp::orchestrator::StopOutcome::Sent))
    );
    assert!(matches!(
        engine.ledger.lock().runs[&run].body,
        RunBody::Stopping { .. }
    ));
}

#[tokio::test]
async fn a_timed_out_waiter_is_not_kept() {
    let test = refusal_engine();
    let engine = &test.engine;
    let run = seeded_run(engine, "child-busy", 1);
    for _ in 0..3 {
        let outcome = engine
            .wait(test.caller.clone(), run.clone(), Duration::from_millis(5))
            .await
            .expect("wait answers");
        assert!(matches!(
            outcome,
            crate::acp::orchestrator::WaitOutcome::TimedOut { .. }
        ));
    }
    assert_eq!(
        engine.ledger.lock().runs[&run].waiters.len(),
        1,
        "each wait drops the registrations of callers that left"
    );
}

/// An engine whose known-agents registry holds `registry` and whose
/// install manifest lists the catalog agents `installed` (bare registry
/// ids, as the install service keys them).
pub(crate) async fn engine_with_installed(
    registry: &[AgentConfig],
    installed: &[&str],
) -> (Arc<OrchestratorEngine>, tempfile::TempDir) {
    engine_with_saved_switches(registry, installed, &[]).await
}

/// [`engine_with_installed`] over a settings file that already holds the
/// allow `switches`, as an earlier host saved them.
async fn engine_with_saved_switches(
    registry: &[AgentConfig],
    installed: &[&str],
    switches: &[(&str, bool)],
) -> (Arc<OrchestratorEngine>, tempfile::TempDir) {
    let data = tempfile::tempdir().expect("data dir");
    let agents: serde_json::Map<String, serde_json::Value> = switches
        .iter()
        .map(|(key, allowed)| (key.to_string(), json!(allowed)))
        .collect();
    std::fs::write(
        data.path().join(crate::acp::orchestrator::settings::FILE_NAME),
        json!({
            "schema_version": 1,
            "enabled": true,
            "maxRunning": 4,
            "maxDepth": 2,
            "agents": agents,
        })
        .to_string(),
    )
    .expect("settings");
    let known: serde_json::Map<String, serde_json::Value> = registry
        .iter()
        .map(|config| {
            (
                crate::automation::agents::agent_key(config),
                serde_json::to_value(config).expect("config"),
            )
        })
        .collect();
    std::fs::write(
        data.path().join(crate::automation::agents::FILE_NAME),
        json!({"schema_version": 1, "agents": known}).to_string(),
    )
    .expect("registry");
    engine_in(data, installed).await
}

/// An engine over the files already in `data`, whose install manifest lists
/// the catalog agents `installed`.
async fn engine_in(
    data: tempfile::TempDir,
    installed: &[&str],
) -> (Arc<OrchestratorEngine>, tempfile::TempDir) {
    let installs = data.path().join("installs");
    std::fs::create_dir_all(&installs).expect("install root");
    let manifest: serde_json::Map<String, serde_json::Value> = installed
        .iter()
        .map(|id| {
            (
                id.to_string(),
                json!({
                    "agentId": id,
                    "version": "1.0.0",
                    "platformTarget": "linux-x86_64",
                    "sha256": "",
                    "command": format!("/opt/{id}/bin/{id}"),
                    "args": ["acp"],
                    "installedAt": 1,
                }),
            )
        })
        .collect();
    std::fs::write(
        installs.join("installed.json"),
        json!({"schemaVersion": 1, "agents": manifest}).to_string(),
    )
    .expect("manifest");
    let catalog = crate::acp::AcpCatalogService::open(data.path().join("catalog"))
        .await
        .expect("catalog");
    let install = crate::acp::install::AcpInstallService::open(installs, catalog)
        .await
        .expect("install service");
    let engine = Arc::new(OrchestratorEngine::new(
        Arc::new(crate::acp::manager::AcpManager::new(Vec::new())),
        data.path().to_path_buf(),
        Some(install),
        Handle::current(),
    ));
    (engine, data)
}

fn registry_agent(id: &str, name: &str) -> AgentConfig {
    AgentConfig {
        config_id: Some(format!("acp-registry:{id}")),
        name: name.to_string(),
        command: format!("/opt/{id}/bin/{id}"),
        args: vec!["acp".to_string()],
        env: std::collections::HashMap::new(),
        allow_terminal: false,
    }
}

#[tokio::test]
async fn an_installed_agent_the_registry_knows_is_listed_once() {
    let (engine, _data) =
        engine_with_installed(&[registry_agent("cursor", "Cursor")], &["cursor"]).await;
    assert_eq!(
        engine.list_agents(),
        vec![crate::acp::orchestrator::AgentListing {
            agent_id: "acp-registry:cursor".to_string(),
            name: "Cursor".to_string(),
            allowed: true,
            default_model: None,
        }]
    );
}

#[tokio::test]
async fn an_installed_agent_the_registry_lacks_is_listed_under_its_config_id() {
    let (engine, _data) = engine_with_installed(&[], &["opencode"]).await;
    assert_eq!(
        engine.list_agents(),
        vec![crate::acp::orchestrator::AgentListing {
            agent_id: "acp-registry:opencode".to_string(),
            name: "opencode".to_string(),
            allowed: true,
            default_model: None,
        }]
    );
    let config = engine
        .resolve_agent("acp-registry:opencode")
        .expect("the listed key resolves");
    assert_eq!(config.config_id.as_deref(), Some("acp-registry:opencode"));
    assert_eq!(config.command, "/opt/opencode/bin/opencode");
}

/// Before the listing keyed installed agents by config id, an agent the
/// registry lacked had one row under its bare id, so its switch saved the
/// bare key. That block holds, also after a chat records the agent.
#[tokio::test]
async fn a_block_saved_under_an_installed_agents_bare_id_still_holds() {
    let (engine, data) =
        engine_with_saved_switches(&[], &["opencode"], &[("opencode", false)]).await;
    let blocked = vec![crate::acp::orchestrator::AgentListing {
        agent_id: "acp-registry:opencode".to_string(),
        name: "opencode".to_string(),
        allowed: false,
        default_model: None,
    }];
    assert_eq!(engine.list_agents(), blocked);

    crate::automation::agents::AgentRegistry::open(
        data.path().join(crate::automation::agents::FILE_NAME),
    )
    .record(&registry_agent("opencode", "OpenCode"));
    assert_eq!(
        engine.list_agents(),
        vec![crate::acp::orchestrator::AgentListing {
            name: "OpenCode".to_string(),
            ..blocked[0].clone()
        }]
    );
    let caller = crate::acp::orchestrator::CallerRef {
        agent: AgentId("agent-parent".to_string()),
        session: SessionId(CHAT.to_string()),
    };
    let start = StartRequest {
        agent: "opencode".to_string(),
        ..request("finish")
    };
    assert_eq!(
        engine.start(caller, start).await,
        Err(crate::acp::orchestrator::StartError::AgentNotAllowed(
            "acp-registry:opencode".to_string()
        ))
    );
}

/// A bare switch moves even when its agent is not installed at startup, so
/// installing the agent later cannot lift the block.
#[tokio::test]
async fn a_bare_block_moves_when_its_agent_is_not_installed_yet() {
    let (engine, _data) = engine_with_saved_switches(&[], &[], &[("opencode", false)]).await;
    assert_eq!(
        engine.settings_view().agents,
        [("acp-registry:opencode".to_string(), false)].into_iter().collect()
    );
}

/// A corrupt known-agents file reads as empty, which would make every saved
/// key look like a bare row; the switches stay as saved.
#[tokio::test]
async fn bare_switches_stay_when_the_registry_cannot_be_read() {
    let data = tempfile::tempdir().expect("data dir");
    std::fs::write(data.path().join(crate::automation::agents::FILE_NAME), b"{not json")
        .expect("registry");
    let mut saved = OrchestratorSettings::default();
    saved.agents.insert("my-agent".to_string(), false);
    crate::acp::orchestrator::settings::SettingsStore::open(data.path())
        .set(saved.clone())
        .expect("settings");
    let engine = OrchestratorEngine::new(
        Arc::new(crate::acp::manager::AcpManager::new(Vec::new())),
        data.path().to_path_buf(),
        None,
        Handle::current(),
    );
    assert_eq!(engine.settings_view().agents, saved.agents);
}

/// While an unreadable registry holds the move back, a bare block still
/// refuses its installed agent, in the listing and at start.
#[tokio::test]
async fn a_bare_block_holds_while_the_registry_cannot_be_read() {
    let data = tempfile::tempdir().expect("data dir");
    std::fs::write(data.path().join(crate::automation::agents::FILE_NAME), b"{not json")
        .expect("registry");
    let mut saved = OrchestratorSettings::default();
    saved.agents.insert("cursor".to_string(), false);
    crate::acp::orchestrator::settings::SettingsStore::open(data.path())
        .set(saved)
        .expect("settings");
    let (engine, _data) = engine_in(data, &["cursor"]).await;
    assert_eq!(
        engine.list_agents(),
        vec![crate::acp::orchestrator::AgentListing {
            agent_id: "acp-registry:cursor".to_string(),
            name: "cursor".to_string(),
            allowed: false,
            default_model: None,
        }]
    );
    let caller = crate::acp::orchestrator::CallerRef {
        agent: AgentId("agent-parent".to_string()),
        session: SessionId(CHAT.to_string()),
    };
    let start = StartRequest {
        agent: "cursor".to_string(),
        ..request("finish")
    };
    assert_eq!(
        engine.start(caller, start).await,
        Err(crate::acp::orchestrator::StartError::AgentNotAllowed(
            "acp-registry:cursor".to_string()
        ))
    );
}

/// An agent the registry knows had its own row next to the bare duplicate,
/// so a block saved on the duplicate never applied to it and is dropped.
#[tokio::test]
async fn a_bare_block_does_not_apply_to_an_agent_the_registry_knows() {
    let (engine, _data) = engine_with_saved_switches(
        &[registry_agent("cursor", "Cursor")],
        &["cursor"],
        &[("cursor", false)],
    )
    .await;
    assert_eq!(
        engine.list_agents(),
        vec![crate::acp::orchestrator::AgentListing {
            agent_id: "acp-registry:cursor".to_string(),
            name: "Cursor".to_string(),
            allowed: true,
            default_model: None,
        }]
    );
    assert_eq!(engine.settings_view().agents, Default::default());
}

#[tokio::test]
async fn a_bare_installed_id_starts_under_its_config_id() {
    let (engine, _data) =
        engine_with_installed(&[registry_agent("cursor", "Cursor")], &["cursor"]).await;
    let mut disallowed = OrchestratorSettings::default();
    disallowed
        .agents
        .insert("acp-registry:cursor".to_string(), false);
    engine.set_settings(disallowed).expect("settings");
    let caller = crate::acp::orchestrator::CallerRef {
        agent: AgentId("agent-parent".to_string()),
        session: SessionId(CHAT.to_string()),
    };
    let bare = StartRequest {
        agent: "cursor".to_string(),
        ..request("finish")
    };
    assert_eq!(
        engine.start(caller, bare).await,
        Err(crate::acp::orchestrator::StartError::AgentNotAllowed(
            "acp-registry:cursor".to_string()
        ))
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_start_without_a_model_asks_for_the_agents_default_model() {
    let Some(test) = engine_test("report-model") else {
        return;
    };
    let _serial = crate::acp::manager::real_loop_tests::TIMEOUT_TEST_LOCK
        .lock()
        .await;
    let engine = test.engine.clone();
    let caller = test.caller.clone();
    let mut settings = OrchestratorSettings::default();
    settings
        .models
        .insert("mock-sub".to_string(), "fast".to_string());
    engine.set_settings(settings).expect("settings");
    assert_eq!(
        engine.list_agents()[0].default_model.as_deref(),
        Some("fast")
    );

    let defaulted = engine
        .start(caller.clone(), request("report-model"))
        .await
        .expect("run starts");
    let settled = wait_settled(&engine, &caller, &defaulted.run).await;
    assert_eq!(settled.result.as_deref(), Some("model=fast"));
    assert_eq!(
        engine.ledger.lock().runs[&defaulted.run].model.as_deref(),
        Some("fast")
    );

    let explicit = StartRequest {
        model: Some("deep".to_string()),
        ..request("report-model")
    };
    let picked = engine
        .start(caller.clone(), explicit)
        .await
        .expect("run starts");
    let settled = wait_settled(&engine, &caller, &picked.run).await;
    assert_eq!(settled.result.as_deref(), Some("model=deep"));
}
