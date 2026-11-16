//! `answer_mcp_install` uses the host-ticket approver: a web client must have
//! passed the token gate and be subscribed to the install's session. The
//! desktop channel is not an approver. The first answer wins.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;

use super::tests::{route, test_env, test_outbound};
use super::*;
use crate::acp::host_mcp::mcp_install::McpInstallDecision;
use crate::web::auth::{WebAuth, WebAuthToken};

const SESSION: &str = "sess-mcp";

fn gate() -> Arc<WebAuth> {
    Arc::new(WebAuth::new(
        WebAuthToken::new("s3cret-token").expect("non-empty"),
    ))
}

fn env(
    acp: &Arc<AcpManager>,
    relay: &Arc<WsRelaySink>,
    registry: &Arc<ProjectRegistry>,
    carrier: Carrier,
    token: bool,
    sessions: &[&str],
) -> HandlerEnv {
    let (tx, _rx) = test_outbound();
    let subscriptions = Arc::new(Subscriptions::default());
    for session_id in sessions {
        subscriptions.replace(session_id, &[], ClientId::new());
    }
    HandlerEnv {
        carrier,
        web_auth: token.then(gate),
        ..test_env(acp, relay, registry, &tx, &subscriptions)
    }
}

fn frame(request_id: &str, session_id: &str, decision: &str) -> String {
    json!({
        "id": "r1",
        "type": "answer_mcp_install",
        "payload": { "requestId": request_id, "sessionId": session_id, "decision": decision }
    })
    .to_string()
}

fn err_code(reply: &WsReply) -> String {
    reply
        .err
        .as_ref()
        .map(|error| error.code.to_string())
        .unwrap_or_default()
}

#[tokio::test]
async fn only_an_authorized_subscriber_can_answer_and_the_first_answer_wins() {
    let relay = Arc::new(WsRelaySink::new());
    let acp = Arc::new(AcpManager::new(vec![]));
    let registry = Arc::new(ProjectRegistry::new());
    let server = acp.host_plan_server_for_tests();
    server.set_mcp_install_answer_floor_for_tests(std::time::Duration::from_secs(60));
    let mut waiting = server.park_mcp_install_for_tests("mcp-1", SESSION);

    for (carrier, token, sessions) in [
        (Carrier::Ws, false, vec![SESSION]),
        (Carrier::Ws, true, vec![]),
        (Carrier::Ipc, false, vec![SESSION]),
    ] {
        let reply = route(
            &frame("mcp-1", SESSION, "decline"),
            &env(&acp, &relay, &registry, carrier, token, &sessions),
        )
        .await;
        assert_eq!(
            err_code(&reply),
            "permission_denied",
            "{carrier:?} token={token} sessions={sessions:?}"
        );
    }
    assert!(
        waiting.try_recv().is_err(),
        "a refused answer must not reach the install"
    );

    let mut other = server.park_mcp_install_for_tests("mcp-2", SESSION);
    let reply = route(
        &frame("mcp-2", "other-session", "decline"),
        &env(
            &acp,
            &relay,
            &registry,
            Carrier::Ws,
            true,
            &[SESSION, "other-session"],
        ),
    )
    .await;
    assert_eq!(err_code(&reply), "permission_denied");
    assert!(other.try_recv().is_err(), "a session mismatch leaves the install open");

    let reply = route(
        &frame("mcp-1", SESSION, "decline"),
        &env(&acp, &relay, &registry, Carrier::Ws, true, &[SESSION]),
    )
    .await;
    assert_eq!(err_code(&reply), "rate_limited");
    assert!(
        waiting.try_recv().is_err(),
        "an early answer leaves the install open"
    );
    server.set_mcp_install_answer_floor_for_tests(std::time::Duration::ZERO);
    let reply = route(
        &frame("mcp-1", SESSION, "decline"),
        &env(&acp, &relay, &registry, Carrier::Ws, true, &[SESSION]),
    )
    .await;
    assert!(reply.ok, "the subscribed client was refused");
    assert!(matches!(
        waiting.try_recv().unwrap(),
        McpInstallDecision::Decline
    ));

    let reply = route(
        &frame("mcp-1", SESSION, "decline"),
        &env(&acp, &relay, &registry, Carrier::Ws, true, &[SESSION]),
    )
    .await;
    assert_eq!(err_code(&reply), "already_resolved");

    let reply = route(
        &frame("mcp-missing", SESSION, "decline"),
        &env(&acp, &relay, &registry, Carrier::Ws, true, &[SESSION]),
    )
    .await;
    assert_eq!(err_code(&reply), "stale");
}
