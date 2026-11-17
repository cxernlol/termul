use std::collections::BTreeMap;
use std::sync::Arc;

use serde_json::Value;

use super::{
    install, AccountChoice, StartChatRequest, StartedChat, WorkerChatError, WorkerChats,
    MAX_LIVE_CHILDREN,
};
use crate::acp::claude_limit::real_loop_tests::{
    actions, has_config_dir_chunk, now_secs, texts, Host, OpenChat, PROJECT,
};
use crate::acp::claude_limit::{switch_notice, AccountRef};
use crate::acp::config::SessionId;
use crate::acp::host_mcp::read_chat::{chat_from_records, render_page, Names};
use crate::web::project_registry::ProjectRegistry;

const UNIQUE_IDS: [(&str, &str); 1] = [("MOCK_SESSION_IDS", "unique")];

async fn start_host(usage: &[(&'static str, f64)]) -> Option<(Host, Arc<WorkerChats>)> {
    let host = Host::start(usage, "Work").await?;
    let chats = install(&host.acp, &host.relay, &tokio::runtime::Handle::current());
    Some((host, chats))
}

fn request(caller: &SessionId, prompt: &str) -> StartChatRequest {
    StartChatRequest {
        caller: caller.clone(),
        prompt: prompt.to_string(),
        title: None,
        account: AccountChoice::Auto,
    }
}

fn account(host: &Host, name: &'static str) -> AccountRef {
    AccountRef {
        id: host.accounts[name].clone(),
        name: name.to_string(),
    }
}

fn config_dir_chunk(host: &Host, name: &str) -> String {
    let dir = host.state().join("claude-accounts").join(&host.accounts[name]);
    format!("config_dir={}", dir.display())
}

async fn turn_ended(host: &Host, chat: &SessionId, prompts: usize) -> Vec<(String, Value)> {
    host.log_until(chat, |records| {
        records
            .iter()
            .filter(|(kind, _)| kind == "prompt_complete")
            .count()
            >= prompts
    })
    .await
}

async fn kill_all(host: &Host) {
    for agent in host.acp.list_agents() {
        let _ = host.acp.kill(&agent).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_worker_chat_starts_on_the_account_with_most_room_and_answers_with_no_client() {
    let Some((host, chats)) =
        start_host(&[("default", 90.0), ("Work", 50.0), ("Spare", 10.0)]).await
    else {
        return;
    };
    let OpenChat {
        session_id: caller, ..
    } = host.open_chat_with(&UNIQUE_IDS).await;

    let started = chats
        .start(StartChatRequest {
            title: Some("Backend owner".to_string()),
            ..request(&caller, "Troupe worker: build the API")
        })
        .await
        .expect("the worker chat starts");

    assert_eq!(
        started,
        StartedChat {
            chat_id: started.chat_id.clone(),
            account: Some(account(&host, "Spare")),
            note: None,
        }
    );
    let child = SessionId(started.chat_id.clone());
    assert_ne!(child, caller);
    let snapshot = host.acp.claude_agent().accounts_snapshot().await.unwrap();
    assert_eq!(
        snapshot.chat_profiles,
        BTreeMap::from([(child.0.clone(), host.accounts["Spare"].clone())])
    );
    let records = host.log_until(&child, has_config_dir_chunk).await;
    assert_eq!(texts(&records, "user_prompt"), vec!["Troupe worker: build the API"]);
    assert_eq!(
        texts(&records, "message_chunk"),
        vec![config_dir_chunk(&host, "Spare").as_str()]
    );
    let metadata = host.persistence.metadata(&child.0).unwrap();
    assert_eq!(metadata.started_by.as_deref(), Some(caller.0.as_str()));
    assert_eq!(metadata.project_id.as_deref(), Some(PROJECT));
    assert_eq!(metadata.title.as_deref(), Some("Backend owner"));
    let listed = host
        .persistence
        .list_sessions()
        .into_iter()
        .find(|entry| entry.session_id == child.0)
        .expect("the worker chat is in the chat list");
    assert_eq!(listed.started_by.as_deref(), Some(caller.0.as_str()));

    let persisted = host.persistence.replay_after(&child.0, 0).unwrap();
    let page = render_page(
        &chat_from_records(
            &metadata,
            &persisted,
            Names {
                project: None,
                agent: None,
            },
        ),
        None,
        None,
    );
    assert!(
        page.text.contains(&config_dir_chunk(&host, "Spare")),
        "read_chat shows the worker's answer: {}",
        page.text
    );
    kill_all(&host).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn send_to_chat_reaches_only_an_idle_worker_of_its_caller() {
    let Some((host, chats)) =
        start_host(&[("default", 90.0), ("Work", 50.0), ("Spare", 10.0)]).await
    else {
        return;
    };
    let OpenChat {
        session_id: caller, ..
    } = host.open_chat_with(&UNIQUE_IDS).await;
    let child = SessionId(
        chats
            .start(request(&caller, "Troupe worker: first task"))
            .await
            .unwrap()
            .chat_id,
    );
    turn_ended(&host, &child, 1).await;

    chats
        .send(caller.clone(), child.clone(), "pid".to_string())
        .await
        .expect("an idle worker takes a follow-up");
    let records = turn_ended(&host, &child, 2).await;
    assert_eq!(
        texts(&records, "user_prompt"),
        vec!["Troupe worker: first task", "pid"]
    );
    assert!(texts(&records, "message_chunk")
        .iter()
        .any(|text| text.starts_with("pid=")));

    chats
        .send(caller.clone(), child.clone(), "hang".to_string())
        .await
        .unwrap();
    assert_eq!(
        chats
            .send(caller.clone(), child.clone(), "pid".to_string())
            .await,
        Err(WorkerChatError::Busy(child.0.clone()))
    );
    assert_eq!(
        chats
            .send(child.clone(), caller.clone(), "pid".to_string())
            .await,
        Err(WorkerChatError::NotYourChat(caller.0.clone()))
    );
    kill_all(&host).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn start_chat_refuses_past_the_cap_a_worker_caller_and_a_chat_without_a_recipe() {
    let Some((host, chats)) =
        start_host(&[("default", 90.0), ("Work", 50.0), ("Spare", 10.0)]).await
    else {
        return;
    };
    let OpenChat {
        session_id: caller, ..
    } = host.open_chat_with(&UNIQUE_IDS).await;

    let mut started = Vec::new();
    for n in 0..MAX_LIVE_CHILDREN {
        let chat = chats
            .start(request(&caller, &format!("Troupe worker {n}")))
            .await
            .expect("a worker under the cap starts");
        started.push(SessionId(chat.chat_id));
    }
    assert_eq!(
        chats.start(request(&caller, "Troupe one too many")).await,
        Err(WorkerChatError::CapReached)
    );
    assert_eq!(host.acp.list_agents().len(), MAX_LIVE_CHILDREN + 1);

    assert_eq!(
        chats.start(request(&started[0], "Troupe grandchild")).await,
        Err(WorkerChatError::Grandchild)
    );
    assert_eq!(
        chats
            .start(request(&SessionId("no-such-chat".to_string()), "Troupe orphan"))
            .await,
        Err(WorkerChatError::NoRecipe)
    );

    let first_agent = host.acp.launch_recipe(&started[0]).unwrap().agent_id;
    host.acp.kill(&first_agent).await.unwrap();
    chats
        .start(request(&caller, "Troupe replacement"))
        .await
        .expect("a stopped worker frees its place");
    kill_all(&host).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_worker_chat_at_its_limit_moves_to_the_next_account_with_room() {
    let Some((host, chats)) =
        start_host(&[("default", 90.0), ("Work", 50.0), ("Spare", 10.0)]).await
    else {
        return;
    };
    let OpenChat {
        session_id: caller, ..
    } = host.open_chat_with(&UNIQUE_IDS).await;
    let child = SessionId(
        chats
            .start(request(&caller, "Troupe worker: long task"))
            .await
            .unwrap()
            .chat_id,
    );
    turn_ended(&host, &child, 1).await;
    let spare_agent = host.acp.launch_recipe(&child).unwrap().agent_id;

    let resets_at = now_secs() + 3600;
    chats
        .send(caller.clone(), child.clone(), format!("limit:{resets_at}"))
        .await
        .unwrap();
    let records = host
        .log_until(&child, |records| !actions(records).is_empty()
            && texts(records, "message_chunk").len() == 2)
        .await;

    let (work, spare) = (account(&host, "Work"), account(&host, "Spare"));
    let new_agent = host.acp.launch_recipe(&child).unwrap().agent_id;
    assert_ne!(new_agent, spare_agent);
    assert_eq!(
        actions(&records),
        vec![serde_json::json!({
            "sessionId": child.0,
            "projectId": PROJECT,
            "action": "switched",
            "from": spare,
            "to": work,
            "fromAgentId": spare_agent.0,
            "newAgentId": new_agent.0,
        })]
    );
    assert_eq!(
        texts(&records, "message_chunk"),
        vec![
            config_dir_chunk(&host, "Spare").as_str(),
            config_dir_chunk(&host, "Work").as_str()
        ]
    );
    assert_eq!(
        texts(&records, "user_prompt").last().copied(),
        Some(switch_notice("Spare", "Work", "5-hour").as_str())
    );
    let snapshot = host.acp.claude_agent().accounts_snapshot().await.unwrap();
    assert_eq!(snapshot.chat_profiles.get(&child.0), Some(&work.id));
    kill_all(&host).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_worker_chat_whose_project_is_archived_while_it_starts_is_stopped() {
    let Some((host, chats)) =
        start_host(&[("default", 90.0), ("Work", 50.0), ("Spare", 10.0)]).await
    else {
        return;
    };
    let cwd = host.cwd();
    let registry = ProjectRegistry::with_roots_for_test(&[(PROJECT, std::path::Path::new(&cwd))]);
    chats.set_registry_for_test(Arc::clone(&registry));
    let OpenChat {
        agent_id: caller_agent,
        session_id: caller,
    } = host
        .open_chat_with(&[UNIQUE_IDS[0], ("MOCK_SESSION_NEW_DELAY", "2")])
        .await;

    let starting = {
        let (chats, request) = (Arc::clone(&chats), request(&caller, "Troupe worker: late"));
        tokio::spawn(async move { chats.start(request).await })
    };
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
    while host.acp.list_agents().len() < 2 {
        assert!(tokio::time::Instant::now() < deadline, "the worker agent never started");
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let mut project = registry
        .snapshot()
        .projects
        .into_iter()
        .find(|project| project.id == PROJECT)
        .unwrap();
    project.is_archived = true;
    registry.upsert(project);

    assert_eq!(starting.await.unwrap(), Err(WorkerChatError::ProjectBusy));
    assert_eq!(host.acp.list_agents(), vec![caller_agent]);
    kill_all(&host).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_worker_whose_agent_still_runs_a_turn_is_busy_for_send_to_chat() {
    let Some((host, chats)) =
        start_host(&[("default", 90.0), ("Work", 50.0), ("Spare", 10.0)]).await
    else {
        return;
    };
    let OpenChat {
        session_id: caller, ..
    } = host.open_chat_with(&UNIQUE_IDS).await;
    let child = SessionId(
        chats
            .start(request(&caller, "Troupe worker: first task"))
            .await
            .unwrap()
            .chat_id,
    );
    turn_ended(&host, &child, 1).await;
    let child_agent = host.acp.launch_recipe(&child).unwrap().agent_id;
    let _unclaimed_turn = host
        .acp
        .start_prompt(
            &child_agent,
            child.clone(),
            vec![agent_client_protocol::schema::v1::ContentBlock::Text(
                agent_client_protocol::schema::v1::TextContent::new("hang"),
            )],
            None,
            None,
        )
        .await
        .unwrap();

    assert_eq!(
        chats.send(caller.clone(), child.clone(), "pid".to_string()).await,
        Err(WorkerChatError::Busy(child.0.clone()))
    );
    kill_all(&host).await;
}
