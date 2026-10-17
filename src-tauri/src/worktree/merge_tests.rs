use super::*;

fn git_in(dir: &Path, args: &[&str]) {
    let mut cmd = quiet_command(&which_git().expect("git"));
    cmd.args(args).current_dir(dir);
    let out = cmd.output().expect("run git");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

fn head(dir: &Path) -> String {
    let (stdout, _) = run_git(&["rev-parse", "HEAD"], dir.to_str()).expect("rev-parse");
    stdout.trim().to_string()
}

/// `main` and `topic` both change `a.txt`, so merging `topic` into `main`
/// stops on a conflict. Returns the repo with `main` checked out.
fn repo_with_diverged_topic() -> tempfile::TempDir {
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
    git_in(p, &["checkout", "-q", "-b", "topic"]);
    std::fs::write(p.join("a.txt"), "topic\n").unwrap();
    std::fs::write(p.join("b.txt"), "b\n").unwrap();
    git_in(p, &["add", "a.txt", "b.txt"]);
    git_in(p, &["commit", "-q", "-m", "topic"]);
    git_in(p, &["checkout", "-q", "main"]);
    project
}

fn commit_conflicting_main_change(repo: &Path) {
    std::fs::write(repo.join("a.txt"), "main\n").unwrap();
    git_in(repo, &["commit", "-q", "-am", "main change"]);
}

fn start_conflicted_merge(repo: &Path) {
    commit_conflicting_main_change(repo);
    let mut cmd = quiet_command(&which_git().expect("git"));
    cmd.args(["merge", "topic"]).current_dir(repo);
    let out = cmd.output().expect("run git");
    assert!(!out.status.success(), "the setup merge must conflict");
    assert!(repo.join(".git/MERGE_HEAD").exists());
}

fn porcelain_status(dir: &Path) -> String {
    let (stdout, _) = run_git(&["status", "--porcelain"], dir.to_str()).expect("status");
    stdout
}

#[test]
fn merge_execute_rejects_a_branch_that_looks_like_a_git_option() {
    if which_git().is_err() {
        return;
    }
    let project = repo_with_diverged_topic();
    let p = project.path();
    start_conflicted_merge(p);
    let before = head(p);
    for target in ["--abort", "-m x", "--quit", "-"] {
        let err = WorktreeManager::merge_execute(p.to_str().unwrap(), target)
            .expect_err("an option is not a branch");
        assert_eq!(err.error_code(), "INVALID_BRANCH_NAME", "target {target:?}");
    }
    assert!(
        p.join(".git/MERGE_HEAD").exists(),
        "the in-progress merge must survive"
    );
    assert_eq!(head(p), before);
}

#[test]
fn merge_preview_rejects_a_branch_that_looks_like_a_git_option() {
    if which_git().is_err() {
        return;
    }
    let project = repo_with_diverged_topic();
    let p = project.path();
    for target in ["--abort", "-m x", "--quit", ""] {
        let err = WorktreeManager::merge_preview(p.to_str().unwrap(), target)
            .expect_err("an option is not a branch");
        assert_eq!(err.error_code(), "INVALID_BRANCH_NAME", "target {target:?}");
    }
}

#[test]
fn merge_execute_still_merges_a_named_branch() {
    if which_git().is_err() {
        return;
    }
    let project = repo_with_diverged_topic();
    let p = project.path();
    git_in(p, &["branch", "chat/topic", "topic"]);
    WorktreeManager::merge_execute(p.to_str().unwrap(), "chat/topic")
        .expect("merge a normal branch");
    assert!(p.join("b.txt").exists());
}

#[test]
fn merge_preview_of_a_clean_merge_lists_the_incoming_changes_and_touches_nothing() {
    if which_git().is_err() {
        return;
    }
    let project = repo_with_diverged_topic();
    let p = project.path();
    std::fs::write(p.join("c.txt"), "c\n").unwrap();
    git_in(p, &["add", "c.txt"]);
    git_in(p, &["commit", "-q", "-m", "main adds c"]);
    let before = head(p);

    let preview = WorktreeManager::merge_preview(p.to_str().unwrap(), "topic")
        .expect("a clean merge previews");

    assert!(preview.conflict_files.is_empty());
    assert_eq!(preview.changed_files, vec!["a.txt", "b.txt"]);
    assert_eq!(preview.total_changes, 2);
    assert_eq!(preview.source_branch, "main");
    assert_eq!(preview.target_branch, "topic");
    assert_eq!(preview.detection_mode, "accurate");
    assert_eq!(head(p), before);
    assert_eq!(porcelain_status(p), "");
    assert_eq!(std::fs::read_to_string(p.join("a.txt")).unwrap(), "a\n");
    assert!(!p.join("b.txt").exists());
    assert!(!p.join(".git/MERGE_HEAD").exists());
}

#[test]
fn merge_preview_of_a_conflicting_merge_lists_the_conflicted_file_and_touches_nothing() {
    if which_git().is_err() {
        return;
    }
    let project = repo_with_diverged_topic();
    let p = project.path();
    commit_conflicting_main_change(p);
    let before = head(p);

    let preview = WorktreeManager::merge_preview(p.to_str().unwrap(), "topic")
        .expect("a conflicting merge previews");

    assert_eq!(preview.conflict_files.len(), 1);
    let conflict = &preview.conflict_files[0];
    assert_eq!(conflict.path, "a.txt");
    assert_eq!(conflict.severity, "high");
    assert_eq!(conflict.conflict_count, 1);
    assert!(!conflict.is_lock_file);
    assert!(preview.changed_files.contains(&"b.txt".to_string()));
    assert_eq!(preview.detection_mode, "accurate");
    assert_eq!(head(p), before);
    assert_eq!(porcelain_status(p), "");
    assert_eq!(std::fs::read_to_string(p.join("a.txt")).unwrap(), "main\n");
    assert!(!p.join(".git/MERGE_HEAD").exists());
}

#[test]
fn merge_preview_rejects_an_unknown_branch() {
    if which_git().is_err() {
        return;
    }
    let project = repo_with_diverged_topic();
    WorktreeManager::merge_preview(project.path().to_str().unwrap(), "no-such-branch")
        .expect_err("an unknown branch cannot be previewed");
}
