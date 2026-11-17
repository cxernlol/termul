use std::sync::Arc;
use std::time::Duration;

use crate::acp::config::{AgentId, SessionId};
use crate::acp::AcpManager;

const SETTLE: Duration = Duration::from_millis(200);

#[tokio::test]
async fn a_client_reopen_of_a_chat_waits_for_the_hosts_move_of_it() {
    let manager = Arc::new(AcpManager::new(vec![]));
    let client = AgentId("client".to_string());
    let _sent = manager.install_test_agent_with_resume(client.clone(), Default::default());
    let moving = manager
        .begin_host_move(&SessionId("s1".to_string()))
        .await;

    let reopen = tokio::spawn({
        let manager = Arc::clone(&manager);
        async move {
            manager
                .resume_session(
                    &client,
                    SessionId("s1".to_string()),
                    "/work".to_string(),
                    Vec::new(),
                    None,
                )
                .await
        }
    });
    tokio::time::sleep(SETTLE).await;
    assert!(!reopen.is_finished(), "the reopen ran during the host move");

    drop(moving);
    let reopened = tokio::time::timeout(Duration::from_secs(5), reopen)
        .await
        .expect("the reopen ran after the host move")
        .unwrap();
    assert!(reopened.is_ok(), "{reopened:?}");
}

#[tokio::test]
async fn a_reopen_of_another_chat_does_not_wait_for_a_host_move() {
    let manager = AcpManager::new(vec![]);
    let client = AgentId("client".to_string());
    let _sent = manager.install_test_agent_with_resume(client.clone(), Default::default());
    let _moving = manager
        .begin_host_move(&SessionId("s1".to_string()))
        .await;

    let reopened = tokio::time::timeout(
        Duration::from_secs(5),
        manager.resume_session(
            &client,
            SessionId("s2".to_string()),
            "/work".to_string(),
            Vec::new(),
            None,
        ),
    )
    .await
    .expect("another chat reopens during the move");
    assert!(reopened.is_ok(), "{reopened:?}");
}

#[tokio::test]
async fn an_agent_listing_waits_for_a_host_move() {
    let manager = Arc::new(AcpManager::new(vec![]));
    let moving = manager
        .begin_host_move(&SessionId("s1".to_string()))
        .await;

    let listing = tokio::spawn({
        let manager = Arc::clone(&manager);
        async move { manager.list_agent_summaries_with_ownership().await.len() }
    });
    tokio::time::sleep(SETTLE).await;
    assert!(!listing.is_finished(), "the listing ran during the host move");

    drop(moving);
    let listed = tokio::time::timeout(Duration::from_secs(5), listing)
        .await
        .expect("the listing ran after the host move")
        .unwrap();
    assert_eq!(listed, 0);
}
