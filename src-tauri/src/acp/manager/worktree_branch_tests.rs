use std::path::Path;
use std::process::Command;

use super::*;
use crate::acp::session_persistence::WorktreeBranchSource;

#[derive(Default)]
struct RecordingSink {
    seen: Mutex<Vec<crate::web::sink::AcpEvent>>,
}

impl EventSink for RecordingSink {
    fn emit(&self, event: &crate::web::sink::AcpEvent) {
        self.seen.lock().push(event.clone());
    }
}

impl RecordingSink {
    fn renamed(&self) -> Vec<crate::web::sink::AcpEvent> {
        self.seen
            .lock()
            .iter()
            .filter(|event| event.type_ == events::EVENT_WORKTREE_BRANCH_RENAMED)
            .cloned()
            .collect()
    }
}

fn git_available() -> bool {
    Command::new("git").arg("--version").output().is_ok()
}

fn git_in(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .expect("run git");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn branch_of(worktree: &Path) -> String {
    git_in(worktree, &["symbolic-ref", "--short", "HEAD"])
}

struct Fixture {
    _project: tempfile::TempDir,
    store: tempfile::TempDir,
    persistence: Arc<SessionPersistence>,
    sink: Arc<RecordingSink>,
    sinks: Vec<Arc<dyn EventSink>>,
    worktree: PathBuf,
    project_path: PathBuf,
}

/// A real repo with a `chat/ab12cd34` worktree and a creator session `s1`
/// plus a later non-creator chat `s2` on the same worktree.
async fn fixture() -> Fixture {
    let project = tempfile::tempdir().unwrap();
    let p = project.path();
    git_in(p, &["init", "--quiet"]);
    git_in(p, &["config", "user.email", "t@t.test"]);
    git_in(p, &["config", "user.name", "t"]);
    git_in(p, &["config", "commit.gpgsign", "false"]);
    git_in(p, &["checkout", "-q", "-b", "main"]);
    std::fs::write(p.join("a.txt"), "a\n").unwrap();
    git_in(p, &["add", "a.txt"]);
    git_in(p, &["commit", "-q", "-m", "init"]);
    let entry = crate::worktree::WorktreeManager::create(
        p.to_str().unwrap(),
        "ab12cd34",
        "chat/ab12cd34",
        true,
        Some("main"),
        None,
        None,
    )
    .expect("create worktree");
    let worktree = PathBuf::from(entry.path.trim_end_matches('/'));

    let store = tempfile::tempdir().unwrap();
    let persistence = SessionPersistence::open(store.path().join("store"))
        .await
        .unwrap();
    for (id, created) in [("s1", true), ("s2", false)] {
        persistence
            .register_session(SessionRegistration {
                session_id: id.to_string(),
                stable_agent_namespace: Some("config:one".to_string()),
                runtime_agent_id: Some("runtime-1".to_string()),
                project_id: Some("project-1".to_string()),
                cwd: worktree.clone(),
                worktree_path: Some(entry.path.clone()),
                worktree_branch: Some("chat/ab12cd34".to_string()),
                worktree_created: created,
                ..Default::default()
            })
            .await
            .unwrap();
    }
    let sink = Arc::new(RecordingSink::default());
    let sinks: Vec<Arc<dyn EventSink>> = vec![sink.clone()];
    Fixture {
        project_path: p.to_path_buf(),
        _project: project,
        store,
        persistence,
        sink,
        sinks,
        worktree,
    }
}

impl Fixture {
    fn branch_of_session(&self, id: &str) -> Option<String> {
        self.persistence.metadata(id).unwrap().worktree_branch
    }

    fn assert_untouched(&self) {
        assert_eq!(
            branch_of(&self.worktree),
            self.branch_of_session("s1").unwrap()
        );
        assert!(self.sink.renamed().is_empty(), "no event on refusal");
    }
}

#[test]
fn slug_validation_trims_lowercases_and_enforces_kebab_case() {
    assert_eq!(
        slug_to_branch("fix-login").as_deref(),
        Some("chat/fix-login")
    );
    assert_eq!(
        slug_to_branch("  FIX-Login ").as_deref(),
        Some("chat/fix-login")
    );
    assert_eq!(slug_to_branch("a").as_deref(), Some("chat/a"));
    assert_eq!(slug_to_branch("v2-api-3").as_deref(), Some("chat/v2-api-3"));
    let max = "a".repeat(48);
    assert_eq!(slug_to_branch(&max), Some(format!("chat/{max}")));
    for bad in [
        "",
        "   ",
        "Fix Login",
        "a--b",
        "-a",
        "a-",
        "a_b",
        "a/b",
        "chat/x",
        "../x",
        "caf\u{e9}",
        &"a".repeat(49),
        &"a".repeat(60),
    ] {
        assert_eq!(slug_to_branch(bad), None, "{bad:?}");
    }
}

#[tokio::test]
async fn auto_rename_renames_branch_rewrites_sessions_and_emits_one_event() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some("Fix-Login")).await;

    assert_eq!(branch_of(&fx.worktree), "chat/fix-login");
    assert_eq!(
        fx.branch_of_session("s1").as_deref(),
        Some("chat/fix-login")
    );
    assert_eq!(
        fx.branch_of_session("s2").as_deref(),
        Some("chat/fix-login")
    );
    // Auto rename keeps the source `auto` (the launch-branch guard blocks a
    // second one).
    assert_eq!(
        fx.persistence
            .metadata("s1")
            .unwrap()
            .worktree_branch_source,
        Some(WorktreeBranchSource::Auto)
    );
    let events = fx.sink.renamed();
    assert_eq!(events.len(), 1, "exactly one event");
    assert!(events[0].sid.is_none(), "agent-level event");
    assert_eq!(events[0].payload["oldBranch"], "chat/ab12cd34");
    assert_eq!(events[0].payload["newBranch"], "chat/fix-login");
    assert!(events[0].payload["worktreePath"].as_str().is_some());
}

#[tokio::test]
async fn second_auto_rename_is_blocked_by_the_launch_branch_guard() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some("first")).await;
    // A resumed session starts with an empty in-memory first-call set; the
    // persisted launch branch no longer matches the worktree's branch.
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some("second")).await;
    assert_eq!(branch_of(&fx.worktree), "chat/first");
    assert_eq!(fx.sink.renamed().len(), 1);
}

#[tokio::test]
async fn auto_rename_refuses_missing_or_invalid_slug() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    for slug in [None, Some("Fix Login"), Some(""), Some("a--b")] {
        auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", slug).await;
    }
    let sixty = "a".repeat(60);
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some(&sixty)).await;
    fx.assert_untouched();
    assert_eq!(branch_of(&fx.worktree), "chat/ab12cd34");
}

#[tokio::test]
async fn auto_rename_refuses_a_session_that_did_not_create_the_worktree() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s2", Some("fix-login")).await;
    auto_rename_for_session(&fx.persistence, &fx.sinks, "missing", Some("fix-login")).await;
    fx.assert_untouched();
    assert_eq!(branch_of(&fx.worktree), "chat/ab12cd34");
}

#[tokio::test]
async fn auto_rename_refuses_when_source_is_user() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    fx.persistence
        .rename_worktree_branch(fx.worktree.to_str().unwrap(), "chat/ab12cd34", true)
        .await
        .unwrap();
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some("fix-login")).await;
    fx.assert_untouched();
    assert_eq!(branch_of(&fx.worktree), "chat/ab12cd34");
}

#[tokio::test]
async fn auto_rename_refuses_an_existing_target_branch() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    git_in(&fx.project_path, &["branch", "chat/fix-login"]);
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some("fix-login")).await;
    fx.assert_untouched();
    assert_eq!(branch_of(&fx.worktree), "chat/ab12cd34");
}

#[tokio::test]
async fn auto_rename_refuses_when_the_branch_changed_or_head_is_detached() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    git_in(&fx.worktree, &["checkout", "-q", "-b", "chat/manual"]);
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some("fix-login")).await;
    assert_eq!(branch_of(&fx.worktree), "chat/manual");
    assert!(fx.sink.renamed().is_empty());

    git_in(&fx.worktree, &["checkout", "-q", "--detach"]);
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some("fix-login")).await;
    assert!(fx.sink.renamed().is_empty());
    assert_eq!(fx.branch_of_session("s1").as_deref(), Some("chat/ab12cd34"));
}

#[tokio::test]
async fn manager_rename_by_hand_flips_source_and_emits_through_manager_sinks() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    let sink = Arc::new(RecordingSink::default());
    let manager = AcpManager::with_persistence(vec![sink.clone()], Arc::clone(&fx.persistence));
    manager
        .rename_worktree_branch(
            fx.worktree.to_str().unwrap(),
            "chat/ab12cd34",
            "chat/by-hand",
        )
        .await
        .expect("rename");

    assert_eq!(branch_of(&fx.worktree), "chat/by-hand");
    assert_eq!(fx.branch_of_session("s1").as_deref(), Some("chat/by-hand"));
    assert_eq!(fx.branch_of_session("s2").as_deref(), Some("chat/by-hand"));
    assert_eq!(
        fx.persistence
            .metadata("s1")
            .unwrap()
            .worktree_branch_source,
        Some(WorktreeBranchSource::User)
    );
    assert_eq!(
        fx.persistence
            .metadata("s2")
            .unwrap()
            .worktree_branch_source,
        None
    );
    assert_eq!(sink.renamed().len(), 1);
    // Auto rename is now refused for the creator.
    auto_rename_for_session(&fx.persistence, &fx.sinks, "s1", Some("later")).await;
    assert_eq!(branch_of(&fx.worktree), "chat/by-hand");
    let _ = &fx.store;
}

#[tokio::test]
async fn manager_rename_error_carries_the_worktree_code_and_emits_nothing() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    let sink = Arc::new(RecordingSink::default());
    let manager = AcpManager::with_persistence(vec![sink.clone()], Arc::clone(&fx.persistence));
    let path = fx.worktree.to_str().unwrap();
    let invalid = manager
        .rename_worktree_branch(path, "chat/ab12cd34", "bad name")
        .await
        .expect_err("invalid");
    assert_eq!(invalid.error_code(), "INVALID_BRANCH_NAME");
    let stale = manager
        .rename_worktree_branch(path, "chat/not-current", "chat/x")
        .await
        .expect_err("changed");
    assert_eq!(stale.error_code(), "BRANCH_CHANGED");
    git_in(&fx.project_path, &["branch", "chat/taken"]);
    let exists = manager
        .rename_worktree_branch(path, "chat/ab12cd34", "chat/taken")
        .await
        .expect_err("exists");
    assert_eq!(exists.error_code(), "BRANCH_EXISTS");
    assert!(sink.renamed().is_empty());
    assert_eq!(branch_of(&fx.worktree), "chat/ab12cd34");
}

#[tokio::test]
async fn rename_without_persistence_still_renames_and_emits() {
    if !git_available() {
        return;
    }
    let fx = fixture().await;
    let sink = Arc::new(RecordingSink::default());
    let sinks: Vec<Arc<dyn EventSink>> = vec![sink.clone()];
    rename_and_record(
        None,
        &sinks,
        fx.worktree.to_str().unwrap(),
        "chat/ab12cd34",
        "chat/live-only",
        WorktreeBranchSource::User,
    )
    .await
    .expect("rename");
    assert_eq!(branch_of(&fx.worktree), "chat/live-only");
    assert_eq!(sink.renamed().len(), 1);
}
