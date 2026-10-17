use super::*;

fn git_available() -> bool {
    which_git().is_ok()
}

fn git_in(dir: &Path, args: &[&str]) -> String {
    let mut cmd = quiet_command(&which_git().expect("git"));
    cmd.args(args).current_dir(dir);
    let out = cmd.output().expect("run git");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A repo with one commit on `main` plus a linked worktree on `chat/ab12cd34`.
fn repo_with_chat_worktree() -> (tempfile::TempDir, std::path::PathBuf) {
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
    let entry = WorktreeManager::create(
        p.to_str().unwrap(),
        "ab12cd34",
        "chat/ab12cd34",
        true,
        Some("main"),
        None,
        None,
    )
    .expect("create worktree");
    let path = std::path::PathBuf::from(entry.path.trim_end_matches('/'));
    (project, path)
}

fn current_branch(worktree: &Path) -> String {
    git_in(worktree, &["symbolic-ref", "--short", "HEAD"])
}

#[test]
fn rename_branch_renames_the_worktree_branch() {
    if !git_available() {
        return;
    }
    let (_project, wt) = repo_with_chat_worktree();
    WorktreeManager::rename_branch(wt.to_str().unwrap(), "chat/ab12cd34", "chat/fix-login")
        .expect("rename");
    assert_eq!(current_branch(&wt), "chat/fix-login");
    let listed = WorktreeManager::list(wt.to_str().unwrap()).unwrap();
    assert!(listed.iter().any(|e| e.branch == "chat/fix-login"));
    assert!(!listed.iter().any(|e| e.branch == "chat/ab12cd34"));
}

#[test]
fn rename_branch_rejects_invalid_names() {
    if !git_available() {
        return;
    }
    let (_project, wt) = repo_with_chat_worktree();
    for bad in [
        "chat/has space",
        "chat/a..b",
        "chat/x.lock",
        "-evil",
        "",
        "chat/a~b",
    ] {
        let err = WorktreeManager::rename_branch(wt.to_str().unwrap(), "chat/ab12cd34", bad)
            .expect_err(bad);
        assert_eq!(err.error_code(), "INVALID_BRANCH_NAME", "{bad:?}");
    }
    assert_eq!(current_branch(&wt), "chat/ab12cd34");
}

#[test]
fn rename_branch_refuses_an_existing_target() {
    if !git_available() {
        return;
    }
    let (project, wt) = repo_with_chat_worktree();
    git_in(project.path(), &["branch", "chat/taken"]);
    let err = WorktreeManager::rename_branch(wt.to_str().unwrap(), "chat/ab12cd34", "chat/taken")
        .expect_err("exists");
    assert_eq!(err.error_code(), "BRANCH_EXISTS");
    assert_eq!(current_branch(&wt), "chat/ab12cd34");
}

#[test]
fn rename_branch_refuses_when_the_branch_changed() {
    if !git_available() {
        return;
    }
    let (_project, wt) = repo_with_chat_worktree();
    git_in(&wt, &["checkout", "-q", "-b", "chat/manual"]);
    let err = WorktreeManager::rename_branch(wt.to_str().unwrap(), "chat/ab12cd34", "chat/fix")
        .expect_err("changed");
    assert_eq!(err.error_code(), "BRANCH_CHANGED");
    assert_eq!(current_branch(&wt), "chat/manual");
}

#[test]
fn rename_branch_refuses_a_detached_head() {
    if !git_available() {
        return;
    }
    let (_project, wt) = repo_with_chat_worktree();
    git_in(&wt, &["checkout", "-q", "--detach"]);
    let err = WorktreeManager::rename_branch(wt.to_str().unwrap(), "chat/ab12cd34", "chat/fix")
        .expect_err("detached");
    assert_eq!(err.error_code(), "BRANCH_CHANGED");
}

#[test]
fn create_notes_only_new_chat_branches_for_the_creator_registry() {
    if !git_available() {
        return;
    }
    let (_project, wt) = repo_with_chat_worktree();
    let path = wt.to_str().unwrap();
    assert!(!take_launch_created(path, "chat/other"));
    assert!(take_launch_created(path, "chat/ab12cd34"));
    assert!(!take_launch_created(path, "chat/ab12cd34"));
}

#[test]
fn new_branch_error_codes_are_stable() {
    assert_eq!(
        WorktreeError::InvalidBranchName.error_code(),
        "INVALID_BRANCH_NAME"
    );
    assert_eq!(WorktreeError::BranchChanged.error_code(), "BRANCH_CHANGED");
    assert_eq!(WorktreeError::BranchExists.error_code(), "BRANCH_EXISTS");
    for error in [
        WorktreeError::InvalidBranchName,
        WorktreeError::BranchChanged,
        WorktreeError::BranchExists,
    ] {
        assert!(!error.to_string().is_empty());
    }
}
