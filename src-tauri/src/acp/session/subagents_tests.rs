use super::subagents::{dispatch_id_for, SubagentRoutes};
use super::DriverState;

#[test]
fn a_child_routes_to_its_chat_and_its_own_dispatch() {
    let mut routes = SubagentRoutes::default();
    let route = routes.register("chat-1", "agent-a").expect("route");
    assert_eq!(route.root_session_id, "chat-1");
    assert_eq!(route.dispatch_id, dispatch_id_for("agent-a"));
    assert_eq!(route.parent_dispatch_id, None);
    assert_eq!(routes.root_of("agent-a"), "chat-1");
    assert_eq!(routes.root_of("chat-1"), "chat-1");
}

#[test]
fn a_nested_child_routes_to_the_root_chat_under_its_parent_dispatch() {
    let mut routes = SubagentRoutes::default();
    routes.register("chat-1", "agent-a");
    let nested = routes.register("agent-a", "agent-b").expect("nested route");
    assert_eq!(nested.root_session_id, "chat-1");
    assert_eq!(nested.parent_session_id, "agent-a");
    assert_eq!(
        nested.parent_dispatch_id.as_deref(),
        Some(dispatch_id_for("agent-a").as_str())
    );
}

#[test]
fn re_registering_keeps_the_first_route_and_self_parents_are_rejected() {
    let mut routes = SubagentRoutes::default();
    routes.register("chat-1", "agent-a");
    let again = routes
        .register("chat-2", "agent-a")
        .expect("existing route");
    assert_eq!(again.root_session_id, "chat-1");
    assert!(routes.register("agent-x", "agent-x").is_none());
    assert!(routes.register("chat-1", "").is_none());
}

#[test]
fn closing_the_chat_forgets_its_children_only() {
    let mut state = DriverState::default();
    state.register_subagent("chat-1", "agent-a");
    state.register_subagent("agent-a", "agent-b");
    state.register_subagent("chat-2", "agent-c");
    state.remove_session_root("chat-1");
    assert!(state.subagent_route("agent-a").is_none());
    assert!(state.subagent_route("agent-b").is_none());
    assert_eq!(state.chat_session_for("agent-c"), "chat-2");
}

#[test]
fn an_ended_child_keeps_its_route() {
    let mut state = DriverState::default();
    state.register_subagent("chat-1", "agent-a");
    let ended = state.end_subagent("agent-a").expect("ended route");
    assert!(ended.ended);
    assert_eq!(state.chat_session_for("agent-a"), "chat-1");
    assert!(state.end_subagent("unknown").is_none());
}

#[test]
fn ending_an_ended_child_changes_nothing() {
    let mut state = DriverState::default();
    state.register_subagent("chat-1", "agent-a");
    assert!(state.end_subagent("agent-a").is_some());
    assert!(
        state.end_subagent("agent-a").is_none(),
        "a second end report is not a new end"
    );
    assert!(state.subagent_route("agent-a").is_some_and(|route| route.ended));
}

#[test]
fn a_full_table_evicts_an_ended_route_first() {
    let mut routes = SubagentRoutes::default();
    for i in 0..1024 {
        routes.register("chat-1", &format!("agent-{i}"));
    }
    routes.mark_ended("agent-7");
    routes.register("chat-1", "agent-new");
    assert_eq!(routes.len(), 1024);
    assert!(routes.route("agent-7").is_none());
    assert!(routes.route("agent-0").is_some());
    assert!(routes.route("agent-new").is_some());
}

fn origin(root: &str, parent: &str, parent_dispatch: Option<&str>) -> crate::acp::manager::ChildOrigin {
    crate::acp::manager::ChildOrigin {
        root_session_id: root.to_string(),
        parent_session_id: parent.to_string(),
        parent_dispatch_id: parent_dispatch.map(str::to_string),
        dispatch_id: "termul-subagent:sub-9f2c1a".to_string(),
        depth: 1,
    }
}

#[test]
fn a_seeded_child_routes_to_the_engine_supplied_chat() {
    let mut state = DriverState::default();
    let route = state.seed_child_route(&origin("chat-1", "chat-1", None), "sess-child");
    assert_eq!(route.root_session_id, "chat-1");
    assert_eq!(route.parent_session_id, "chat-1");
    assert_eq!(route.dispatch_id, "termul-subagent:sub-9f2c1a");
    assert_eq!(route.parent_dispatch_id, None);
    assert!(!route.ended);
    assert_eq!(state.chat_session_for("sess-child"), "chat-1");
    assert_eq!(state.chat_session_for("chat-1"), "chat-1");
}

#[test]
fn a_seeded_nested_child_carries_its_parents_dispatch() {
    let mut state = DriverState::default();
    let nested = state.seed_child_route(
        &origin("chat-1", "sess-parent", Some("termul-subagent:sub-parent1")),
        "sess-child",
    );
    assert_eq!(nested.root_session_id, "chat-1");
    assert_eq!(nested.parent_session_id, "sess-parent");
    assert_eq!(
        nested.parent_dispatch_id.as_deref(),
        Some("termul-subagent:sub-parent1")
    );
    // No parent walk: seeding never derives anything from sess-parent.
    assert!(state.subagent_route("sess-parent").is_none());
}

#[test]
fn a_repeated_seed_keeps_the_first_route() {
    let mut state = DriverState::default();
    state.seed_child_route(&origin("chat-1", "chat-1", None), "sess-child");
    let again = state.seed_child_route(&origin("chat-9", "chat-9", None), "sess-child");
    assert_eq!(again.root_session_id, "chat-1");
}

#[test]
fn an_orchestrated_child_works_for_its_chat_while_a_headless_session_stays_locked() {
    let mut state = DriverState::new();
    state.mark_ephemeral("oneshot".to_string());
    assert!(state.is_headless("oneshot"), "a one-shot session has no chat");

    state.mark_ephemeral("sess-child".to_string());
    state.seed_child_route(&origin("chat-1", "chat-1", None), "sess-child");
    assert!(
        !state.is_headless("sess-child"),
        "an orchestrated child reaches files and terminals for its chat"
    );
}

#[test]
fn an_orchestrated_child_keeps_its_own_root_mark_and_parked_prompts() {
    // The child's private connection: its chat is not a session here.
    let mut state = DriverState::new();
    state.set_session_root("sess-child".to_string(), "/repo/wt".into());
    state.mark_ephemeral("sess-child".to_string());
    state.seed_child_route(&origin("chat-1", "chat-1", None), "sess-child");
    assert_eq!(
        state.session_root("sess-child"),
        Some(std::path::PathBuf::from("/repo/wt")),
        "the child works in its own worktree"
    );
    assert!(state.is_ephemeral("sess-child"), "the child keeps its own mark");
    assert!(!state.is_headless("sess-child"));
    assert!(
        state.parked_for("sess-child", "chat-1"),
        "a prompt parked under the foreign chat is the child's"
    );
}

#[test]
fn a_native_child_uses_its_chats_root_and_never_drains_the_chat() {
    let mut state = DriverState::new();
    state.set_session_root("chat-1".to_string(), "/repo".into());
    state.register_subagent("chat-1", "sess-native");
    assert_eq!(
        state.session_root("sess-native"),
        Some(std::path::PathBuf::from("/repo"))
    );
    assert!(!state.parked_for("sess-native", "chat-1"));
    assert!(state.parked_for("chat-1", "chat-1"));
}
