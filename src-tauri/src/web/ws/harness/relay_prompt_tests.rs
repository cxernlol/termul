//! AD-16 prompt-turn and fake-agent cases driven through the fault carrier:
//! the production `run_relay` loop, a fake agent that reproduces the real
//! command loop's failure replies, and wire faults (lost replies, lost echoes,
//! abrupt resets). These run in plain `cargo test`.

use agent_client_protocol::schema::v1::StopReason;
use axum::extract::ws::Message;
use tokio::sync::oneshot;

use super::*;
use crate::acp::manager::{FakeAuth, FakeTurn};

fn text_contains(message: &Message, needle: &str) -> bool {
    matches!(message, Message::Text(text) if text.contains(needle))
}

fn hold_host() -> (Host, oneshot::Sender<()>, oneshot::Receiver<()>) {
    let (release_tx, release_rx) = oneshot::channel();
    let (entered_tx, entered_rx) = oneshot::channel();
    let host = Host::new(|acp, sessions| {
        acp.install_test_agent_with_turns(
            AgentId(AGENT.to_string()),
            sessions,
            vec![FakeTurn::Hold {
                release: release_rx,
                entered: entered_tx,
            }],
            false,
        );
    });
    (host, release_tx, entered_rx)
}

fn receipt(reply: &Value) -> &Value {
    assert_eq!(reply["ok"], true, "expected an ok reply: {reply}");
    &reply["payload"]["receipt"]
}

/// Drop AFTER the echo: the client saw its `user_prompt` echo, then the turn's
/// final reply is lost on the wire. A same-`turnId` resend — while the turn is
/// still running and again after it completed — is a receipt, never
/// `rate_limited`, and never re-runs the prompt.
#[tokio::test(start_paused = true)]
async fn lost_reply_after_echo_then_resend_same_turn_id_is_a_receipt() {
    let (host, release, entered) = hold_host();
    let mut conn = host.connect();
    conn.authenticate().await;
    conn.subscribe("sub").await;

    conn.send_prompt_request("p1", "turn-1");
    entered.await.expect("turn entered the fake agent");
    conn.peer.wait_event("user_prompt").await;

    // The resend while the turn is in flight (the reply was "lost").
    let in_flight = conn
        .request("p1-resend-live", "send_prompt", prompt_payload("turn-1"))
        .await;
    assert_eq!(receipt(&in_flight), "in_progress", "{in_flight}");

    // Now the real reply gets lost on the wire.
    conn.peer
        .drop_outbound_where(|m| text_contains(m, "\"id\":\"p1\""));
    release.send(()).expect("release the held turn");
    conn.peer.wait_event("prompt_complete").await;
    Conn::settle().await;
    assert_eq!(conn.peer.dropped_frames(), 1, "the final reply was lost");
    conn.peer.clear_drop_filter();

    let after = conn
        .request("p1-resend-done", "send_prompt", prompt_payload("turn-1"))
        .await;
    assert_eq!(receipt(&after), "accepted", "{after}");

    conn.peer.read_for(Duration::from_secs(1)).await;
    assert_eq!(conn.peer.events_of("user_prompt").len(), 1, "never re-ran");
    assert_eq!(conn.peer.events_of("prompt_complete").len(), 1);
}

/// Drop BEFORE the echo: every frame towards the client is lost, then the
/// connection resets. The client reconnects, replays from its cursor (the echo
/// is durable in the log, delivered exactly once), and its same-`turnId`
/// resend is a receipt.
#[tokio::test(start_paused = true)]
async fn lost_echo_then_reset_and_resend_on_a_new_connection_is_a_receipt() {
    let (host, release, entered) = hold_host();
    let mut first = host.connect();
    first.authenticate().await;
    first.subscribe("sub").await;

    first.peer.drop_outbound_where(|_| true);
    first.send_prompt_request("p1", "turn-1");
    entered.await.expect("turn entered the fake agent");
    Conn::settle().await;
    assert!(first.peer.dropped_frames() >= 1, "the echo was lost");
    assert!(first.peer.events_of("user_prompt").is_empty());
    first.peer.reset();
    tokio::time::timeout(Duration::from_secs(5), first.task)
        .await
        .expect("relay ends on the reset")
        .expect("relay task did not panic");

    let mut second = host.connect();
    second.authenticate().await;
    let sub = second
        .request(
            "sub2",
            "subscribe",
            json!({"sessionId": SESSION, "lastSeq": 0}),
        )
        .await;
    assert_eq!(sub["ok"], true, "{sub}");
    assert!(sub["payload"]["replayed"].as_u64().unwrap() >= 1, "{sub}");

    let live = second
        .request("p1-resend", "send_prompt", prompt_payload("turn-1"))
        .await;
    assert_eq!(receipt(&live), "in_progress", "{live}");

    release.send(()).expect("release the held turn");
    second.peer.wait_event("prompt_complete").await;
    let done = second
        .request("p1-resend-done", "send_prompt", prompt_payload("turn-1"))
        .await;
    assert_eq!(receipt(&done), "accepted", "{done}");

    second.peer.read_for(Duration::from_secs(1)).await;
    assert_eq!(
        second.peer.events_of("user_prompt").len(),
        1,
        "the replayed echo is delivered exactly once, not re-run"
    );
    assert_eq!(second.peer.events_of("prompt_complete").len(), 1);
}

/// The agent's single-flight rejection reaches the wire as `rate_limited` and
/// the rejected prompt leaves no `user_prompt` record: only the accepted turn
/// was ever published.
#[tokio::test(start_paused = true)]
async fn rejected_send_prompt_is_rate_limited_and_leaves_no_user_prompt() {
    let (host, release, entered) = hold_host();
    let mut conn = host.connect();
    conn.authenticate().await;
    conn.subscribe("sub").await;

    conn.send_prompt_request("p1", "turn-1");
    entered.await.expect("turn entered the fake agent");
    conn.peer.wait_event("user_prompt").await;

    let rejected = conn
        .request("p2", "send_prompt", prompt_payload("turn-2"))
        .await;
    assert_eq!(rejected["ok"], false, "{rejected}");
    assert_eq!(rejected["err"]["code"], "rate_limited", "{rejected}");
    conn.peer.read_for(Duration::from_secs(1)).await;
    assert_eq!(
        conn.peer.events_of("user_prompt").len(),
        1,
        "the rejected prompt must not be published as a user_prompt"
    );

    // The rejection released nothing it did not own: after the held turn
    // ends, the next distinct prompt is accepted and published.
    release.send(()).expect("release the held turn");
    let stop = conn.peer.wait_reply("p1").await;
    assert_eq!(stop["payload"], "end_turn", "{stop}");
    conn.send_prompt_request("p3", "turn-3");
    conn.peer.wait_reply("p3").await;
    assert_eq!(conn.peer.events_of("user_prompt").len(), 2);
}

/// Error, timeout, crash and cancel turns each leave exactly one
/// `prompt_complete` with the matching stop reason — and the caller always
/// gets a terminal reply instead of hanging.
#[tokio::test(start_paused = true)]
async fn failed_turns_leave_exactly_one_prompt_complete() {
    let cases: Vec<(FakeTurn, &str, bool)> = vec![
        (FakeTurn::Fail("rpc failed".to_string()), "error", false),
        (FakeTurn::Timeout, "timeout", false),
        (FakeTurn::Crash, "crashed", false),
        (FakeTurn::Stop(StopReason::Cancelled), "cancelled", true),
    ];
    for (turn, stop_reason, reply_ok) in cases {
        let host = Host::new(|acp, sessions| {
            acp.install_test_agent_with_turns(
                AgentId(AGENT.to_string()),
                sessions,
                vec![turn],
                false,
            );
        });
        let mut conn = host.connect();
        conn.authenticate().await;
        conn.subscribe("sub").await;

        conn.send_prompt_request("p1", "turn-1");
        let reply = conn.peer.wait_reply("p1").await;
        assert_eq!(reply["ok"], reply_ok, "{stop_reason}: {reply}");

        conn.peer.read_for(Duration::from_secs(1)).await;
        let completes = conn.peer.events_of("prompt_complete");
        assert_eq!(completes.len(), 1, "{stop_reason}: {completes:?}");
        assert_eq!(completes[0]["payload"]["stopReason"], stop_reason);
        assert_eq!(completes[0]["payload"]["turnId"], "turn-1");
        // No open turn: the single-flight claim is gone, so the next prompt
        // is admitted.
        let next = conn
            .request("p2", "send_prompt", prompt_payload("turn-2"))
            .await;
        assert_eq!(next["ok"], true, "{stop_reason}: {next}");
    }
}

/// The fake's `Authenticate` follows the real arm: it runs off the command
/// loop, and its failure and crash outcomes reach the wire as the handler's
/// `AUTHENTICATE_FAILED` error (never a hang, never a blanket OK).
#[tokio::test(start_paused = true)]
async fn fake_agent_authenticate_outcomes_reach_the_wire() {
    let host = Host::new(|acp, sessions| {
        acp.install_test_agent_with_scripts(
            AgentId(AGENT.to_string()),
            sessions,
            Vec::new(),
            false,
            vec![
                FakeAuth::fail_after(Duration::from_secs(2), "login refused"),
                FakeAuth::crash_after(Duration::from_secs(2)),
                FakeAuth::ok_after(Duration::from_secs(5)),
            ],
        );
    });
    let mut conn = host.connect();
    conn.authenticate().await;
    let payload = json!({"agentId": AGENT, "methodId": "oauth"});

    let failed = conn
        .request("a1", "authenticate_agent", payload.clone())
        .await;
    assert_eq!(failed["ok"], false, "{failed}");
    assert_eq!(failed["err"]["code"], "AUTHENTICATE_FAILED", "{failed}");
    assert_eq!(failed["err"]["message"], "login refused");

    let crashed = conn
        .request("a2", "authenticate_agent", payload.clone())
        .await;
    assert_eq!(crashed["err"]["code"], "AUTHENTICATE_FAILED", "{crashed}");
    assert_eq!(crashed["err"]["message"], "agent thread dropped the reply");

    let started = tokio::time::Instant::now();
    let slow = conn.request("a3", "authenticate_agent", payload).await;
    assert_eq!(slow["ok"], true, "{slow}");
    assert!(
        started.elapsed() >= Duration::from_secs(5),
        "the handler was slow"
    );
}

fn prompt_payload(turn_id: &str) -> Value {
    json!({
        "agentId": AGENT,
        "sessionId": SESSION,
        "text": "hello",
        "turnId": turn_id,
    })
}
