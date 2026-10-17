#![allow(clippy::unwrap_used, clippy::expect_used)]
//! `fetch_acp_registry_snapshot` answers with what the desktop
//! `acp_fetch_registry_snapshot` command returns from the same host service.

use super::tests::{route, test_env, test_outbound};
use super::*;
use crate::acp::AcpCatalogService;
use crate::acp_registry_snapshot::{
    AcpRegistrySnapshot, AcpRegistrySnapshotAgent, ResolvedSnapshot, SnapshotFetchOutcome,
};

fn temp_root(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "termul-ws-registry-{label}-{}",
        uuid::Uuid::new_v4()
    ))
}

fn stale_cache_snapshot() -> ResolvedSnapshot {
    ResolvedSnapshot {
        snapshot: AcpRegistrySnapshot {
            agents: vec![AcpRegistrySnapshotAgent {
                id: "a".to_string(),
                name: "A".to_string(),
                version: "1.0.0".to_string(),
                description: String::new(),
                distribution: json!({}),
            }],
            source: "cache".to_string(),
            fetched_at: Some("2026-10-15T12:00:00+00:00".to_string()),
        },
        outcome: SnapshotFetchOutcome::StaleAfterFailure,
        persisted: true,
    }
}

async fn send(text: &str, catalog: Option<Arc<AcpCatalogService>>) -> WsReply {
    let relay = Arc::new(WsRelaySink::new());
    let acp = Arc::new(AcpManager::new(vec![]));
    let (tx, _rx) = test_outbound();
    let subs = Arc::new(Subscriptions::default());
    let registry = Arc::new(ProjectRegistry::new());
    route(
        text,
        &HandlerEnv {
            acp_catalog: catalog,
            ..test_env(&acp, &relay, &registry, &tx, &subs)
        },
    )
    .await
}

#[tokio::test]
async fn both_reasons_force_a_registry_fetch_and_return_the_desktop_snapshot() {
    let root = temp_root("forced");
    let forced = Arc::new(parking_lot::Mutex::new(Vec::new()));
    let seen = Arc::clone(&forced);
    let catalog = AcpCatalogService::with_snapshot_fetcher(
        root.join("catalog"),
        Arc::new(move |_, force_refresh| {
            seen.lock().push(force_refresh);
            Box::pin(async { Ok(stale_cache_snapshot()) })
        }),
    );

    let manual = send(
        r#"{"id":"r1","type":"fetch_acp_registry_snapshot","payload":{"reason":"manual"}}"#,
        Some(Arc::clone(&catalog)),
    )
    .await;
    let background = send(
        r#"{"id":"r2","type":"fetch_acp_registry_snapshot","payload":{"reason":"background"}}"#,
        Some(Arc::clone(&catalog)),
    )
    .await;
    let desktop = catalog.fetch_registry_snapshot(true).await.unwrap();

    let expected = json!({
        "agents": [{ "id": "a", "name": "A", "version": "1.0.0", "description": "", "distribution": {} }],
        "source": "cache",
        "fetchedAt": "2026-10-15T12:00:00+00:00"
    });
    assert!(manual.ok && background.ok);
    assert_eq!(manual.payload, Some(expected.clone()));
    assert_eq!(background.payload, Some(expected.clone()));
    assert_eq!(serde_json::to_value(&desktop).unwrap(), expected);
    assert_eq!(*forced.lock(), vec![true, true, true]);
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test]
async fn a_failed_fetch_with_no_cache_answers_registry_fetch_failed() {
    let root = temp_root("failed");
    let catalog = AcpCatalogService::with_snapshot_fetcher(
        root.join("catalog"),
        Arc::new(|_, _| {
            Box::pin(async { Err("ACP registry request failed: timeout".to_string()) })
        }),
    );

    let reply = send(
        r#"{"id":"r1","type":"fetch_acp_registry_snapshot","payload":{"reason":"manual"}}"#,
        Some(catalog),
    )
    .await;

    assert!(!reply.ok);
    let err = reply.err.unwrap();
    assert_eq!(err.code, "REGISTRY_FETCH_FAILED");
    assert_eq!(err.message, "ACP registry request failed: timeout");
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test]
async fn an_unknown_reason_is_a_validation_error() {
    let root = temp_root("invalid");
    let catalog = AcpCatalogService::with_snapshot_fetcher(
        root.join("catalog"),
        Arc::new(|_, _| Box::pin(async { Ok(stale_cache_snapshot()) })),
    );

    let reply = send(
        r#"{"id":"r1","type":"fetch_acp_registry_snapshot","payload":{"reason":"sometimes"}}"#,
        Some(catalog),
    )
    .await;

    assert_eq!(reply.err.unwrap().code, "VALIDATION_ERROR");
    let _ = std::fs::remove_dir_all(root);
}

#[tokio::test]
async fn a_host_without_a_catalog_store_answers_unavailable() {
    let reply = send(
        r#"{"id":"r1","type":"fetch_acp_registry_snapshot","payload":{"reason":"manual"}}"#,
        None,
    )
    .await;

    assert_eq!(reply.err.unwrap().code, "ACP_CATALOG_UNAVAILABLE");
}
