// --- issue #842: shutdown writes interrupted prompt_complete markers -------

/// A turn that was still open at shutdown (user_prompt with no matching
/// prompt_complete) gains a synthetic terminal marker with
/// stopReason "interrupted"; an already-completed turn does not.
#[tokio::test]
async fn shutdown_marks_open_turn_with_interrupted_prompt_complete() {
    let root = temp_dir("interrupted-marker");
    let (persistence, metadata) = registered(&root).await;

    // Turn 1 completes normally.
    let mut prompt1 = record(1, "user_prompt");
    prompt1.payload = json!({"sessionId":"session-1","turnId":"turn-1","content":[]});
    let mut complete1 = record(2, "prompt_complete");
    complete1.payload =
        json!({"sessionId":"session-1","turnId":"turn-1","stopReason":"end_turn"});
    // Turn 2 is still mid-flight when SIGTERM lands.
    let mut prompt2 = record(3, "user_prompt");
    prompt2.payload = json!({"sessionId":"session-1","turnId":"turn-2","content":[]});
    let mut chunk = record(4, "message_chunk");
    chunk.payload = json!({"sessionId":"session-1","role":"assistant","content":[{"type":"text","text":"partial"}]});
    for mut rec in [prompt1, complete1, prompt2, chunk] {
        rec.recorded_at = now_millis();
        persistence.enqueue_event(rec).unwrap();
    }
    persistence.flush_session("session-1").await.unwrap();

    persistence.shutdown().await.unwrap();

    let records = persistence.replay_after("session-1", 0).unwrap();
    let marker = records
        .iter()
        .rev()
        .find(|r| r.type_ == "prompt_complete")
        .expect("interrupted marker appended");
    assert_eq!(marker.payload["stopReason"], "interrupted");
    assert_eq!(marker.payload["turnId"], "turn-2");
    assert_eq!(marker.seq, 5);

    // Reopen: the marker is durable and only ONE marker exists (turn-1's
    // real completion is untouched).
    let reopened = SessionPersistence::open(root.join("store")).await.unwrap();
    let replayed = reopened.replay_after("session-1", 0).unwrap();
    assert_eq!(
        replayed
            .iter()
            .filter(|r| r.type_ == "prompt_complete")
            .count(),
        2
    );
    assert_eq!(
        replayed
            .iter()
            .filter(|r| r.payload.get("stopReason") == Some(&json!("interrupted")))
            .count(),
        1
    );
    reopened.shutdown().await.unwrap();
    assert_eq!(metadata.session_id, "session-1");
    let _ = fs::remove_dir_all(root);
}

/// Every turn already completed → shutdown appends NO marker.
#[tokio::test]
async fn shutdown_appends_no_marker_when_turns_completed() {
    let root = temp_dir("interrupted-none");
    let (persistence, _metadata) = registered(&root).await;

    let mut prompt = record(1, "user_prompt");
    prompt.payload = json!({"sessionId":"session-1","turnId":"turn-1","content":[]});
    let mut complete = record(2, "prompt_complete");
    complete.payload =
        json!({"sessionId":"session-1","turnId":"turn-1","stopReason":"end_turn"});
    persistence.enqueue_event(prompt).unwrap();
    persistence.flush_session("session-1").await.unwrap();
    persistence.enqueue_event(complete).unwrap();

    persistence.shutdown().await.unwrap();

    let records = persistence.replay_after("session-1", 0).unwrap();
    assert_eq!(records.len(), 2);
    assert!(records.iter().all(|r| r.payload
        .get("stopReason")
        .is_none_or(|s| s == "end_turn")));
    let _ = fs::remove_dir_all(root);
}

/// A legacy (pre-turn-id) prompt is closed by any later completion; an open
/// legacy prompt still gains the interrupted marker with no turnId field.
#[tokio::test]
async fn shutdown_marks_legacy_open_turn_without_turn_id() {
    let root = temp_dir("interrupted-legacy");
    let (persistence, _metadata) = registered(&root).await;

    let mut prompt = record(1, "user_prompt");
    prompt.payload = json!({"sessionId":"session-1","content":[]});
    persistence.enqueue_event(prompt).unwrap();
    persistence.flush_session("session-1").await.unwrap();

    persistence.shutdown().await.unwrap();

    let records = persistence.replay_after("session-1", 0).unwrap();
    let marker = records
        .iter()
        .rev()
        .find(|r| r.type_ == "prompt_complete")
        .expect("legacy open turn gains a marker");
    assert_eq!(marker.payload["stopReason"], "interrupted");
    assert!(marker.payload.get("turnId").is_none());
    let _ = fs::remove_dir_all(root);

// --- Issue #844c: messageCount consistency (index == payload fold) -----------

/// The index's `message_count` and `get_session_payload`'s materialized
/// `messages.len()` must agree for the SAME session. The fold counts only
/// bubble-opening records (`user_prompt` + role-changing/stream-starting
/// `message_chunk`s), never metadata events (usage/plan/mode updates).
#[tokio::test]
async fn message_count_agrees_between_index_and_payload() {
    let root = temp_dir("count-agree");
    let (persistence, _metadata) = registered(&root).await;
    let agent_chunk = json!({"role": "agent", "content": {"type": "text", "text": "hi"}});
    for (seq, payload) in [
        (1u64, json!({"content": [{"type": "text", "text": "hi"}]})),
        (2, agent_chunk.clone()),
        (3, agent_chunk.clone()), // coalesces into seq-2's run → no new bubble
        (4, json!({})),           // usage_update → transparent
        (5, json!({})),           // plan_update → transparent
        (6, agent_chunk.clone()), // same open agent run → coalesces
        (7, json!({})),           // prompt_complete
        (8, agent_chunk.clone()), // new run after completion → opens
    ] {
        let type_ = match seq {
            1 => "user_prompt",
            4 => "usage_update",
            5 => "plan_update",
            7 => "prompt_complete",
            _ => "message_chunk",
        };
        persistence
            .enqueue_event(record_with_payload(seq, type_, payload))
            .unwrap();
    }
    persistence.flush_session("session-1").await.unwrap();

    // Index metadata (list_persisted_sessions source).
    let index_entry = persistence
        .list_sessions()
        .into_iter()
        .find(|entry| entry.session_id == "session-1")
        .unwrap();
    // Payload materialization (get_session_payload source).
    let payload = persistence.session_payload_async("session-1").await.unwrap();
    assert_eq!(
        index_entry.message_count, payload.metadata.message_count,
        "index messageCount must equal the payload's materialized count"
    );
    // The expected fold: user_prompt(1) + agent run(2..3..6) + post-complete
    // agent run(8) = 3 bubbles. Old counting (every non-tool record) would
    // have reported 6.
    assert_eq!(payload.messages.len(), 3);
    assert_eq!(index_entry.message_count, 3);
    let _ = fs::remove_dir_all(root);
}

/// A `message_chunk` run split by a `tool_call` (in tool-calls.jsonl, a
/// different FILE) opens a fresh bubble — the incremental writer must fold
/// across the two logs' interleaved seq order, not per-file order.
#[tokio::test]
async fn message_count_splits_runs_across_tool_calls_and_completion() {
    let root = temp_dir("count-split");
    let (persistence, _metadata) = registered(&root).await;
    let agent_chunk = json!({"role": "agent", "content": {"type": "text", "text": "hi"}});
    for (seq, type_, payload) in [
        (1u64, "user_prompt", json!({"content": [{"type": "text", "text": "hi"}]})),
        (2, "message_chunk", agent_chunk.clone()),
        (3, "tool_call", json!({})),     // tool-calls.jsonl; closes the seq-2 run
        (4, "message_chunk", agent_chunk.clone()), // new run after the tool
        (5, "prompt_complete", json!({})),
        (6, "message_chunk", agent_chunk.clone()), // new run after completion
    ] {
        persistence
            .enqueue_event(record_with_payload(seq, type_, payload))
            .unwrap();
    }
    persistence.flush_session("session-1").await.unwrap();
    let payload = persistence.session_payload_async("session-1").await.unwrap();
    let index_entry = persistence
        .list_sessions()
        .into_iter()
        .find(|entry| entry.session_id == "session-1")
        .unwrap();
    // user(1) + run(2) + run(4) + run(6) = 4.
    assert_eq!(payload.messages.len(), 4);
    assert_eq!(index_entry.message_count, 4);
    let _ = fs::remove_dir_all(root);
}

/// Issue #844c heal: an OLD session (pre-feature metadata with the legacy
/// count and NO `fold_open_role`) converges to the new semantics the first
/// time a writer is installed (reopen/restart) — the JSONL recount rewrites
/// both `message_count` and `fold_open_role` durably.
#[tokio::test]
async fn legacy_session_message_count_heals_on_reopen() {
    let root = temp_dir("count-heal");
    let (persistence, metadata) = registered(&root).await;
    // Old-semantics record mix: the legacy counter counted all 6 non-tool
    // records; the fold counts 3.
    let agent_chunk = json!({"role": "agent", "content": {"type": "text", "text": "hi"}});
    for (seq, type_, payload) in [
        (1u64, "user_prompt", json!({"content": [{"type": "text", "text": "hi"}]})),
        (2, "message_chunk", agent_chunk.clone()),
        (3, "message_chunk", agent_chunk.clone()),
        (4, "usage_update", json!({})),
        (5, "message_chunk", agent_chunk.clone()),
        (6, "prompt_complete", json!({})),
    ] {
        persistence
            .enqueue_event(record_with_payload(seq, type_, payload))
            .unwrap();
    }
    persistence.flush_session("session-1").await.unwrap();
    persistence.shutdown().await.unwrap();

    // Simulate the pre-feature on-disk state: strip `foldOpenRole` and inflate
    // `messageCount` to the legacy rule's value (every non-tool record).
    let session_dir = persistence.session_dir(&metadata.storage_key).unwrap();
    let metadata_path = session_dir.join(METADATA_FILE);
    let mut legacy: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&metadata_path).unwrap()).unwrap();
    legacy
        .as_object_mut()
        .unwrap()
        .remove("foldOpenRole");
    legacy["messageCount"] = serde_json::json!(6);
    fs::write(&metadata_path, serde_json::to_vec_pretty(&legacy).unwrap()).unwrap();

    // Reopen: the writer install runs the versioned heal.
    let reopened = SessionPersistence::open(root.join("store")).await.unwrap();
    reopened
        .reopen_writer("session-1")
        .await
        .unwrap();
    let healed = reopened.metadata("session-1").unwrap();
    assert_eq!(
        healed.message_count, 2,
        "legacy count converges to the fold semantics (user + one coalesced run)"
    );
    // The healed state also carries the post-fold open role (the seq-6
    // prompt_complete closed the run → None).
    assert_eq!(healed.fold_open_role, None);
    // And the index entry agrees.
    let index_entry = reopened
        .list_sessions()
        .into_iter()
        .find(|entry| entry.session_id == "session-1")
        .unwrap();
    assert_eq!(index_entry.message_count, 2);
    let _ = fs::remove_dir_all(root);
}

/// A mid-stream restart (writer reinstalled while an agent run is OPEN) must
/// not double-count the resumed run: the heal restores `fold_open_role` from
/// the records, so the next same-role chunk coalesces instead of opening a
/// second bubble.
#[tokio::test]
async fn mid_stream_restart_does_not_double_count_the_open_run() {
    let root = temp_dir("count-midstream");
    let (persistence, metadata) = registered(&root).await;
    for (seq, type_, payload) in [
        (
            1u64,
            "user_prompt",
            json!({"content": [{"type": "text", "text": "hi"}]}),
        ),
        (2, "message_chunk", json!({"role": "agent", "content": {"type": "text", "text": "hi"}})),
    ] {
        persistence
            .enqueue_event(record_with_payload(seq, type_, payload))
            .unwrap();
    }
    persistence.flush_session("session-1").await.unwrap();
    // Persist the open run's fold state durably (the writer already tracked
    // it; flush makes it disk-visible).
    let mid = persistence.metadata("session-1").unwrap();
    assert_eq!(mid.message_count, 2);
    assert_eq!(mid.fold_open_role.as_deref(), Some("agent"));
    persistence.shutdown().await.unwrap();

    // Simulate the restart: strip `foldOpenRole` from the on-disk metadata so
    // the reopen heal must reconstruct it from the records.
    let session_dir = persistence.session_dir(&metadata.storage_key).unwrap();
    let metadata_path = session_dir.join(METADATA_FILE);
    let mut stripped: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&metadata_path).unwrap()).unwrap();
    stripped
        .as_object_mut()
        .unwrap()
        .remove("foldOpenRole");
    fs::write(&metadata_path, serde_json::to_vec_pretty(&stripped).unwrap()).unwrap();

    let reopened = SessionPersistence::open(root.join("store")).await.unwrap();
    reopened.reopen_writer("session-1").await.unwrap();
    // The resumed stream continues the SAME run: seq 3 must coalesce, not
    // open a second bubble.
    reopened
        .enqueue_event(record_with_payload(
            3,
            "message_chunk",
            json!({"role": "agent", "content": {"type": "text", "text": "more"}}),
        ))
        .unwrap();
    reopened.flush_session("session-1").await.unwrap();
    let healed = reopened.metadata("session-1").unwrap();
    assert_eq!(
        healed.message_count, 2,
        "the resumed chunk coalesces into the open run (no double count)"
    );
    let payload = reopened.session_payload_async("session-1").await.unwrap();
    assert_eq!(payload.messages.len(), 2);
    assert_eq!(payload.metadata.message_count, 2);
    let _ = fs::remove_dir_all(root);
}

/// The pure fold step: the shared counting rule behind the writer, the heal,
/// and the salvage recount.
#[test]
fn fold_step_counts_bubble_openers_only() {
    let state = FoldState::default();
    // user_prompt always opens.
    let (s1, opens) = fold_step(state, "user_prompt", &json!({}));
    assert!(opens);
    assert_eq!(s1.open_role, None);
    // First agent chunk opens; same-role coalesces.
    let chunk = json!({"role": "agent", "content": {"type": "text", "text": "a"}});
    let (s2, opens2) = fold_step(s1, "message_chunk", &chunk);
    assert!(opens2);
    assert_eq!(s2.open_role, Some("agent"));
    let (s3, opens3) = fold_step(s2, "message_chunk", &chunk);
    assert!(!opens3);
    // Role change opens.
    let thought = json!({"role": "thought", "content": {"type": "text", "text": "t"}});
    let (_s4, opens4) = fold_step(s3, "message_chunk", &thought);
    assert!(opens4);
    // Null-content and empty-text chunks never open.
    let (_s5, opens5) = fold_step(s1, "message_chunk", &json!({"role": "agent"}));
    assert!(!opens5);
    let (_s6, opens6) = fold_step(
        s1,
        "message_chunk",
        &json!({"role": "agent", "content": {"type": "text", "text": ""}}),
    );
    assert!(!opens6);
    // Tool/complete/switch close the run without counting.
    for boundary in ["tool_call", "prompt_complete", "agent_switch"] {
        let (s, opens) = fold_step(s2, boundary, &json!({}));
        assert!(!opens);
        assert_eq!(s.open_role, None);
    }
    // Transparent metadata events.
    for transparent in ["usage_update", "plan_update", "mode_update", "session_info_update"] {
        let (s, opens) = fold_step(s2, transparent, &json!({}));
        assert!(!opens);
        assert_eq!(s.open_role, s2.open_role);
    }
}

/// #844c helper: a record with an explicit payload (the default `record()`
/// helper bakes the `user_prompt` array-content shape, which is wrong for
/// `message_chunk` — its durable wire shape is `role` + a single content
/// object).
fn record_with_payload(seq: u64, type_: &str, payload: Value) -> PersistedEventRecord {
    PersistedEventRecord {
        schema_version: SESSION_SCHEMA_VERSION,
        session_id: "session-1".to_string(),
        seq,
        type_: type_.to_string(),
        recorded_at: now_millis(),
        payload,
    }

}
