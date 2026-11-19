//! The run state machine, the record derivation and the ledger's
//! invariants.

use std::sync::Arc;

use super::*;

fn child_run(body: RunBody) -> ChildRun {
    ChildRun {
        run: RunId("sub-9f2c1a".to_string()),
        root: "chat-1".to_string(),
        parent_agent: AgentId("agent-parent".to_string()),
        parent_run: None,
        depth: 1,
        identity: SubagentAgent {
            name: "Codex".to_string(),
            config_id: Some("acp-registry:codex-acp".to_string()),
            agent_id: "agent-child".to_string(),
        },
        title: "Codex".to_string(),
        task: "Run the test sweep and report failures.".to_string(),
        model: Some("gpt-5.5".to_string()),
        created_ms: 10,
        workspace: SubagentWorkspace {
            mode: SubagentWorkspaceMode::Worktree,
            path: Some("/repo/.termul/worktrees/sub-9f2c1a".to_string()),
            branch: Some("troupe/sub/sub-9f2c1a".to_string()),
            base: Some("main @ 42be01e, with uncommitted changes".to_string()),
            diff_stat: None,
        },
        base_commit: Some("snap-oid".to_string()),
        body,
        result: None,
        waiters: Vec::new(),
        capture: Arc::new(RunCapture::default()),
    }
}

#[test]
fn a_minted_run_id_has_the_wire_shape() {
    let run = RunId::mint();
    assert!(run.0.starts_with("sub-"));
    assert_eq!(run.0.len(), 16, "sub- plus 12 hex characters");
    assert!(run.0[4..].bytes().all(|byte| byte.is_ascii_hexdigit()));
    assert_eq!(run.dispatch_id(), format!("termul-subagent:{}", run.0));
}

#[test]
fn the_first_settle_wins() {
    let mut run = child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-child".to_string()),
        awaiting_permission: false,
    });
    assert!(run.settle(RunEnd::Completed, 40));
    assert!(!run.settle(RunEnd::Failed("late crash".to_string()), 50));
    assert_eq!(run.state(), RunState::Completed);
    assert_eq!(
        run.record().ended_at,
        Some(40),
        "the first settle's stamp is kept"
    );
}

#[test]
fn begin_stop_moves_a_live_run_to_stopping() {
    let mut run = child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-child".to_string()),
        awaiting_permission: false,
    });
    let (agent, session) = run.begin_stop(30).expect("cancel target");
    assert_eq!(agent.0, "agent-child");
    assert_eq!(session.0, "sess-child");
    assert!(matches!(run.body, RunBody::Stopping { since_ms: 30, .. }));
    assert!(run.begin_stop(31).is_none(), "a second stop is a no-op");
    assert!(run.is_live(), "stopping is still live until settle");
}

#[test]
fn begin_stop_of_a_spawning_run_has_no_target() {
    let mut run = child_run(RunBody::Spawning {
        child_agent: AgentId("agent-child".to_string()),
    });
    assert!(run.begin_stop(30).is_none());
}

#[test]
fn awaiting_permission_flips_once() {
    let mut run = child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-child".to_string()),
        awaiting_permission: false,
    });
    assert!(run.set_awaiting(true));
    assert_eq!(run.state(), RunState::RequiresAction);
    assert!(!run.set_awaiting(true), "the flip is reported once");
    assert!(run.set_awaiting(false));
    assert_eq!(run.state(), RunState::Running);
}

#[test]
fn the_derived_record_carries_the_orchestrated_shape() {
    let run = child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-child".to_string()),
        awaiting_permission: false,
    });
    let record = run.record();
    assert_eq!(record.id, "sub-9f2c1a");
    assert_eq!(record.root_session_id, "chat-1");
    assert_eq!(record.dispatch_tool_call_id, "termul-subagent:sub-9f2c1a");
    assert_eq!(record.source, SubagentSource::Orchestrated);
    assert!(record.background);
    assert_eq!(
        record.caps,
        SubagentCaps {
            stop: Some(SubagentStop::SessionCancel),
            transcript: SubagentTranscript::Live,
            live_progress: true,
            usage: true,
        }
    );
    assert_eq!(record.description.as_deref(), Some("Run the test sweep and report failures."));
    assert_eq!(record.prompt.as_deref(), Some("Run the test sweep and report failures."));
    assert_eq!(
        record.agent,
        Some(SubagentAgent {
            name: "Codex".to_string(),
            config_id: Some("acp-registry:codex-acp".to_string()),
            agent_id: "agent-child".to_string(),
        })
    );
    assert_eq!(record.workspace, Some(run.workspace.clone()));
    assert_eq!(record.state, SubagentState::Running);
    assert_eq!(record.started_at, Some(10));
    assert_eq!(record.ended_at, None);
}

#[test]
fn a_settled_record_carries_its_end() {
    let run = child_run(RunBody::Settled {
        end: RunEnd::Failed("boom".to_string()),
        at_ms: 40,
    });
    let record = run.record();
    assert_eq!(
        record.state,
        SubagentState::Idle {
            end: SubagentEnd {
                reason: SubagentEndReason::Failed,
                error: Some("boom".to_string()),
            }
        }
    );
    assert_eq!(record.ended_at, Some(40));
    let summary = run.summary();
    assert_eq!(summary.state, RunState::Failed);
    assert_eq!(summary.error.as_deref(), Some("boom"));
}

#[test]
fn the_capture_keeps_the_tail_of_the_text() {
    let capture = RunCapture::default();
    capture.note_chunk(&"a".repeat(100));
    capture.note_chunk(&"b".repeat(MAX_RESULT_CHARS));
    let text = capture.result_text();
    assert_eq!(text.chars().count(), MAX_RESULT_CHARS);
    assert!(text.chars().all(|char| char == 'b'), "the head is dropped");
}

#[test]
fn the_ledger_tracks_a_run_from_insert_until_eviction() {
    let mut ledger = RunLedger::new();
    let run = RunId("sub-9f2c1a".to_string());
    ledger.insert(child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-child".to_string()),
        awaiting_permission: false,
    }));
    assert!(ledger.by_root.contains_key("chat-1"));
    ledger
        .runs
        .get_mut(&run)
        .expect("the run")
        .settle(RunEnd::Completed, 40);
    assert!(
        ledger.by_root.contains_key("chat-1"),
        "a settled run stays until eviction"
    );
    ledger.remove(&run);
    assert!(!ledger.by_root.contains_key("chat-1"));
    assert!(ledger.runs.is_empty());
}

#[test]
fn at_most_64_settled_runs_are_kept_per_chat() {
    let mut ledger = RunLedger::new();
    for index in 0..=64 {
        let mut run = child_run(RunBody::Live {
            child_agent: AgentId("agent-child".to_string()),
            session: SessionId(format!("sess-{index}")),
            awaiting_permission: false,
        });
        run.run = RunId(format!("sub-{index:06x}"));
        run.body = RunBody::Settled {
            end: RunEnd::Completed,
            at_ms: 100 + index,
        };
        ledger.insert(run);
    }
    assert_eq!(ledger.runs.len(), 64, "the oldest settled run was evicted");
    assert!(
        ledger.runs.contains_key(&RunId("sub-000040".to_string())),
        "the newest settled runs stay"
    );
    assert!(
        !ledger.runs.contains_key(&RunId("sub-000000".to_string())),
        "the oldest settled run is gone"
    );
    assert_eq!(ledger.by_root["chat-1"].len(), 64);
}

#[test]
fn a_live_run_is_never_evicted() {
    let mut ledger = RunLedger::new();
    let mut live = child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-live".to_string()),
        awaiting_permission: false,
    });
    live.run = RunId("sub-000000".to_string());
    ledger.insert(live);
    for index in 1..=65 {
        let mut run = child_run(RunBody::Settled {
            end: RunEnd::Completed,
            at_ms: 100 + index,
        });
        run.run = RunId(format!("sub-{index:06x}"));
        ledger.insert(run);
    }
    assert!(
        ledger.runs.contains_key(&RunId("sub-000000".to_string())),
        "the live run is never the eviction victim"
    );
    let settled = ledger
        .by_root
        .get("chat-1")
        .map(|ids| {
            ids.iter()
                .filter(|id| !ledger.runs[*id].is_live())
                .count()
        })
        .unwrap_or(0);
    assert_eq!(settled, 64, "the settled cap holds with a live run present");
    assert_eq!(ledger.runs.len(), 65);
}

fn caller(agent: &str, session: &str) -> CallerRef {
    CallerRef {
        agent: AgentId(agent.to_string()),
        session: SessionId(session.to_string()),
    }
}

#[test]
fn a_run_is_found_by_its_child_session_and_agent() {
    let mut ledger = RunLedger::new();
    ledger.insert(child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-child".to_string()),
        awaiting_permission: false,
    }));
    assert_eq!(
        ledger
            .run_with_session(&caller("agent-child", "sess-child"))
            .expect("the run")
            .run
            .0,
        "sub-9f2c1a"
    );
    assert!(ledger
        .run_with_session(&caller("agent-child", "sess-other"))
        .is_none());
    assert!(
        ledger
            .run_with_session(&caller("agent-elsewhere", "sess-child"))
            .is_none(),
        "another agent reporting the same session id is not the run's child"
    );
}

#[test]
fn status_lists_live_runs_first_then_the_newest_settled() {
    let mut ledger = RunLedger::new();
    for (id, at_ms) in [("sub-000001", 50), ("sub-000002", 70)] {
        let mut run = child_run(RunBody::Settled {
            end: RunEnd::Completed,
            at_ms,
        });
        run.run = RunId(id.to_string());
        ledger.insert(run);
    }
    let mut live = child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-live".to_string()),
        awaiting_permission: false,
    });
    live.run = RunId("sub-000003".to_string());
    ledger.insert(live);
    let order: Vec<&str> = ledger
        .runs_of_root("chat-1")
        .into_iter()
        .map(|run| run.run.as_str())
        .collect();
    assert_eq!(order, vec!["sub-000003", "sub-000002", "sub-000001"]);
}

#[test]
fn eviction_drops_the_earliest_settled_not_the_earliest_inserted() {
    let mut ledger = RunLedger::new();
    for index in 0..=64u64 {
        let mut run = child_run(RunBody::Settled {
            end: RunEnd::Completed,
            // The first inserted run finished last.
            at_ms: if index == 0 { 1_000 } else { 100 + index },
        });
        run.run = RunId(format!("sub-{index:06x}"));
        ledger.insert(run);
    }
    assert!(
        ledger.runs.contains_key(&RunId("sub-000000".to_string())),
        "the most recently settled run stays"
    );
    assert!(
        !ledger.runs.contains_key(&RunId("sub-000001".to_string())),
        "the earliest settled run is evicted"
    );
}

#[test]
fn settling_a_live_run_then_evicting_holds_the_cap() {
    let mut ledger = RunLedger::new();
    let mut live = child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-live".to_string()),
        awaiting_permission: false,
    });
    live.run = RunId("sub-0000ff".to_string());
    ledger.insert(live);
    for index in 0..64u64 {
        let mut run = child_run(RunBody::Settled {
            end: RunEnd::Completed,
            at_ms: 100 + index,
        });
        run.run = RunId(format!("sub-{index:06x}"));
        ledger.insert(run);
    }
    let live = RunId("sub-0000ff".to_string());
    assert!(ledger.runs.get_mut(&live).expect("live").settle(RunEnd::Completed, 500));
    ledger.evict_settled("chat-1");
    assert_eq!(ledger.runs.len(), 64);
    assert!(ledger.runs.contains_key(&live), "the run that just settled stays");
    assert!(!ledger.runs.contains_key(&RunId("sub-000000".to_string())));
}

#[test]
fn live_runs_are_found_by_root_and_parent_agent() {
    let mut ledger = RunLedger::new();
    ledger.insert(child_run(RunBody::Live {
        child_agent: AgentId("agent-child".to_string()),
        session: SessionId("sess-child".to_string()),
        awaiting_permission: false,
    }));
    let mut other = child_run(RunBody::Settled {
        end: RunEnd::Completed,
        at_ms: 50,
    });
    other.run = RunId("sub-000002".to_string());
    other.root = "chat-2".to_string();
    ledger.insert(other);
    let agent = AgentId("agent-parent".to_string());
    assert_eq!(ledger.live_runs_of_agent(&agent).len(), 1);
    assert_eq!(ledger.live_runs_of_root("chat-1").len(), 1);
    assert!(ledger.live_runs_of_root("chat-2").is_empty());
}

#[test]
fn bounded_trims_and_cuts() {
    assert_eq!(bounded("  hello  ", 100), "hello");
    assert_eq!(bounded("abcdef", 3), "abc");
    assert_eq!(bounded("", 3), "");
}
