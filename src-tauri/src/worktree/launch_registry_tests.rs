use std::time::{Duration, Instant};

use super::launch_registry::{LaunchRegistry, LAUNCH_NOTE_TTL};
use super::*;

#[test]
fn take_is_consume_once_and_requires_matching_branch() {
    let mut registry = LaunchRegistry::default();
    let now = Instant::now();
    registry.note_at("/p/.termul/worktrees/ab12cd34/", "chat/ab12cd34", now);

    // A different branch never claims the note (and does not burn it).
    assert!(!registry.take_at("/p/.termul/worktrees/ab12cd34", "chat/other", now));
    assert!(registry.take_at("/p/.termul/worktrees/ab12cd34", "chat/ab12cd34", now));
    assert!(!registry.take_at("/p/.termul/worktrees/ab12cd34", "chat/ab12cd34", now));
}

#[test]
fn notes_expire_after_the_ttl() {
    let mut registry = LaunchRegistry::default();
    let now = Instant::now();
    registry.note_at("/p/wt", "chat/x", now);
    let stale = now + LAUNCH_NOTE_TTL + Duration::from_secs(1);
    assert!(!registry.take_at("/p/wt", "chat/x", stale));

    registry.note_at("/p/wt", "chat/x", now);
    let fresh = now + LAUNCH_NOTE_TTL - Duration::from_secs(1);
    assert!(registry.take_at("/p/wt", "chat/x", fresh));
}

#[test]
fn stale_entries_are_pruned_on_access() {
    let mut registry = LaunchRegistry::default();
    let now = Instant::now();
    registry.note_at("/p/old", "chat/old", now);
    let later = now + LAUNCH_NOTE_TTL + Duration::from_secs(5);
    registry.note_at("/p/new", "chat/new", later);
    assert!(!registry.take_at("/p/old", "chat/old", later));
    assert!(registry.take_at("/p/new", "chat/new", later));
}

#[test]
fn non_chat_branches_are_never_noted() {
    let mut registry = LaunchRegistry::default();
    let now = Instant::now();
    registry.note_at("/p/wt", "feature/login", now);
    assert!(!registry.take_at("/p/wt", "feature/login", now));
}

#[test]
fn path_forms_resolve_to_the_same_note() {
    let mut registry = LaunchRegistry::default();
    let now = Instant::now();
    registry.note_at(r"E:\proj\.termul\worktrees\ab12\", "chat/ab12", now);
    assert!(registry.take_at(r"\\?\e:\proj\.termul\worktrees\ab12", "chat/ab12", now));

    registry.note_at("E:/proj/.termul/worktrees/ab12/", "chat/ab12", now);
    assert!(registry.take_at(r"E:\PROJ\.termul\worktrees\ab12", "chat/ab12", now));
}

#[test]
fn worktree_path_key_normalizes_separators_prefix_and_case() {
    assert_eq!(
        worktree_path_key(r"\\?\C:\Repo\.termul\worktrees\X\"),
        "c:/repo/.termul/worktrees/x"
    );
    assert_eq!(
        worktree_path_key("/home/u/Repo/.termul/worktrees/X/"),
        "/home/u/Repo/.termul/worktrees/X"
    );
    assert_eq!(worktree_path_key("/"), "/");
}

#[test]
fn global_registry_round_trip_uses_take_once() {
    let path = format!("/tmp/termul-launch-registry-{}", std::process::id());
    launch_registry::note_launch_created(&path, "chat/zz99");
    assert!(take_launch_created(&path, "chat/zz99"));
    assert!(!take_launch_created(&path, "chat/zz99"));
}
