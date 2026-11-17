use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use agent_client_protocol::schema::v1::{ContentBlock, TextContent};
use serde_json::Value;

use super::super::{ClaudeLimitHandle, CLAUDE_CONFIG_ID, SCHEDULE_FILE};
use super::{Schedule, Supervisor};
use crate::acp::claude_agent::ClaudeLaunchAuth;
use crate::acp::config::{AgentConfig, AgentId, SessionId};
use crate::acp::manager::{AgentLaunch, FakeTurn};
use crate::acp::AcpManager;
use crate::web::sink::{AcpEvent, EventSink};
use crate::web::WsRelaySink;

#[derive(Default)]
struct Recorded(parking_lot::Mutex<Vec<Value>>);

impl EventSink for Recorded {
    fn emit(&self, event: &AcpEvent) {
        if event.type_ == "acp:claude_limit_action" {
            self.0.lock().push(event.payload.clone());
        }
    }
}

struct Host {
    _dir: tempfile::TempDir,
    path: std::path::PathBuf,
    acp: Arc<AcpManager>,
    handle: ClaudeLimitHandle,
    actions: Arc<Recorded>,
}

fn start() -> Host {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(SCHEDULE_FILE);
    let actions = Arc::new(Recorded::default());
    let relay = Arc::new(WsRelaySink::new());
    let (handle, inbox) = ClaudeLimitHandle::channel();
    let acp = Arc::new(AcpManager::new(vec![
        relay.clone(),
        handle.sink(),
        actions.clone(),
    ]));
    acp.set_claude_limit(handle.clone());
    tokio::spawn(
        Supervisor::new(
            acp.clone(),
            relay,
            Schedule::load(Some(path.clone())),
            Duration::ZERO,
            inbox.clock,
        )
        .run(inbox.rx),
    );
    Host {
        _dir: dir,
        path,
        acp,
        handle,
        actions,
    }
}

fn launch(config_id: &str, claude: ClaudeLaunchAuth) -> AgentLaunch {
    AgentLaunch {
        config: AgentConfig {
            config_id: Some(config_id.to_string()),
            name: "agent".to_string(),
            command: "node".to_string(),
            args: Vec::new(),
            env: HashMap::new(),
            allow_terminal: false,
        },
        project_id: Some("proj-1".to_string()),
        claude,
    }
}

fn work() -> AgentLaunch {
    launch(CLAUDE_CONFIG_ID, ClaudeLaunchAuth::Account("work".to_string()))
}

fn in_an_hour() -> Option<SystemTime> {
    let at = SystemTime::UNIX_EPOCH
        + Duration::from_secs(
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + 3600,
        );
    Some(at)
}

fn scheduled(path: &Path) -> Vec<String> {
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    let file: Value = serde_json::from_slice(&bytes).unwrap();
    file["resumes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["sessionId"].as_str().unwrap().to_string())
        .collect()
}

async fn until(what: &str, done: impl Fn() -> bool) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    while !done() {
        assert!(tokio::time::Instant::now() < deadline, "never saw: {what}");
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

fn cancelled(session: &str) -> Value {
    serde_json::json!({
        "sessionId": session,
        "projectId": "proj-1",
        "action": "resume_cancelled",
    })
}

#[tokio::test]
async fn a_turn_of_the_chat_cancels_its_scheduled_resume() {
    let host = start();
    let agent = AgentId("agent-1".to_string());
    host.acp
        .install_test_agent_with_turns(agent.clone(), ["s1".to_string()].into(), Vec::new(), false);
    host.acp.record_launch_for_test(&agent, "s1", work());
    host.handle
        .set_resume(SessionId("s1".to_string()), in_an_hour())
        .await
        .unwrap();
    assert_eq!(scheduled(&host.path), vec!["s1".to_string()]);

    let content = vec![ContentBlock::Text(TextContent::new("go on"))];
    let started = host
        .acp
        .start_prompt(
            &agent,
            SessionId("s1".to_string()),
            content,
            None,
            Some(Box::new(|| {})),
        )
        .await
        .unwrap();
    let _ = host.acp.wait_prompt(started).await;

    until("the resume dropped", || scheduled(&host.path).is_empty()).await;
    until("resume_cancelled", || {
        host.actions.0.lock().last() == Some(&cancelled("s1"))
    })
    .await;
}

#[tokio::test]
async fn set_resume_refuses_a_chat_without_a_managed_claude_account() {
    let host = start();
    let cases = [
        ("codex", launch("acp-registry:codex-acp", ClaudeLaunchAuth::Unmanaged)),
        ("api-key", launch(CLAUDE_CONFIG_ID, ClaudeLaunchAuth::Fixed)),
        (
            "other-config",
            launch("custom:claude", ClaudeLaunchAuth::Account("work".to_string())),
        ),
    ];
    for (session, launch) in cases {
        let agent = AgentId(format!("agent-{session}"));
        host.acp
            .install_test_agent_with_sessions(agent.clone(), [session.to_string()].into());
        host.acp.record_launch_for_test(&agent, session, launch);
        assert_eq!(
            host.handle
                .set_resume(SessionId(session.to_string()), in_an_hour())
                .await,
            Err("This chat does not run on a Claude account Troupe manages.".to_string()),
            "{session}"
        );
    }
    assert_eq!(scheduled(&host.path), Vec::<String>::new());
    assert_eq!(host.acp.list_agents().len(), 3);
}

#[tokio::test]
async fn closing_a_chat_drops_its_scheduled_resume() {
    let host = start();
    let agent = AgentId("agent-1".to_string());
    host.acp
        .install_test_agent_with_closable_sessions(agent.clone(), vec!["s1".to_string()], true);
    host.acp.record_launch_for_test(&agent, "s1", work());
    host.handle
        .set_resume(SessionId("s1".to_string()), in_an_hour())
        .await
        .unwrap();

    host.acp
        .close_session(&agent, SessionId("s1".to_string()))
        .await
        .unwrap();

    until("the resume dropped", || scheduled(&host.path).is_empty()).await;
    until("resume_cancelled", || {
        host.actions.0.lock().last() == Some(&cancelled("s1"))
    })
    .await;
    assert!(host
        .acp
        .launch_recipe(&SessionId("s1".to_string()))
        .is_none());
}

#[tokio::test]
async fn a_due_resume_leaves_alone_a_turn_that_started_after_it_was_taken() {
    let dir = tempfile::tempdir().unwrap();
    let actions = Arc::new(Recorded::default());
    let relay = Arc::new(WsRelaySink::new());
    let (handle, inbox) = ClaudeLimitHandle::channel();
    let acp = Arc::new(AcpManager::new(vec![
        relay.clone(),
        handle.sink(),
        actions.clone(),
    ]));
    acp.set_claude_limit(handle);
    let agent = AgentId("agent-b".to_string());
    let (release, release_rx) = tokio::sync::oneshot::channel();
    let (entered, entered_rx) = tokio::sync::oneshot::channel();
    acp.install_test_agent_with_turns(
        agent.clone(),
        ["b".to_string()].into(),
        vec![FakeTurn::Hold {
            release: release_rx,
            entered,
        }],
        false,
    );
    acp.record_launch_for_test(&agent, "b", work());
    let mut supervisor = Supervisor::new(
        acp.clone(),
        relay,
        Schedule::load(Some(dir.path().join(SCHEDULE_FILE))),
        Duration::ZERO,
        inbox.clock,
    );
    let chat = SessionId("b".to_string());
    supervisor
        .set_resume(&chat, Some(SystemTime::now()))
        .unwrap();
    let due = supervisor.schedule.take_next_due(i64::MAX).unwrap();

    let content = vec![ContentBlock::Text(TextContent::new("a new question"))];
    let started = acp
        .start_prompt(&agent, chat.clone(), content, None, Some(Box::new(|| {})))
        .await
        .unwrap();
    entered_rx.await.unwrap();
    supervisor.resume(due).await;

    assert!(acp.is_turn_active(&agent, chat.clone()).await.unwrap());
    assert_eq!(actions.0.lock().last(), Some(&cancelled("b")));
    let _ = release.send(());
    let _ = acp.wait_prompt(started).await;
}
