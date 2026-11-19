//! Tests for the per-run worktree: the snapshot (uncommitted changes
//! included, no working-tree mutation), the diff stat against it, and the
//! startup sweep. Each test builds a throwaway git repository.

use super::*;

use std::path::Path;
use std::process::Command;

use tempfile::TempDir;

fn git(repo: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .arg("-c")
        .arg("user.name=Test")
        .arg("-c")
        .arg("user.email=test@localhost.invalid")
        .args(args)
        .current_dir(repo)
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn write(repo: &Path, name: &str, text: &str) {
    std::fs::write(repo.join(name), text).expect("file writes");
}

fn commit(repo: &Path, message: &str) -> String {
    git(repo, &["add", "-A", "--", "."]);
    git(repo, &["commit", "-m", message]);
    git(repo, &["rev-parse", "HEAD"])
}

fn repo_with_commit() -> TempDir {
    let dir = TempDir::new().expect("temp dir");
    git(dir.path(), &["init", "--initial-branch=main"]);
    write(dir.path(), "a.txt", "first\n");
    commit(dir.path(), "initial");
    dir
}

#[tokio::test]
async fn snapshot_carries_uncommitted_changes_into_the_worktree() {
    let dir = repo_with_commit();
    let root = dir.path().to_string_lossy().into_owned();
    write(dir.path(), "a.txt", "first\nplus the parent's edit\n");
    write(dir.path(), "b.txt", "untracked\n");
    let run = RunId::mint();
    let prepared = prepare(&root, &run).await.expect("the worktree prepares");
    let workspace = prepared.workspace;
    assert_eq!(workspace.mode, SubagentWorkspaceMode::Worktree);
    assert_eq!(workspace.branch.as_deref(), Some(format!("troupe/sub/{}", run.0).as_str()));
    let path = workspace.path.expect("the worktree has a path");
    let base_commit = prepared.base_commit.expect("a repository with commits has a base");
    let worktree = Path::new(&path);
    assert!(worktree.join("b.txt").is_file(), "untracked files carry over");
    let a = std::fs::read_to_string(worktree.join("a.txt")).expect("a.txt carries over");
    assert!(a.contains("plus the parent's edit"));
    let parent_a = std::fs::read_to_string(dir.path().join("a.txt")).expect("the parent keeps its file");
    assert!(parent_a.contains("plus the parent's edit"));
    assert!(
        git(worktree, &["cat-file", "-p", &format!("{base_commit}^")]).contains("tree"),
        "the snapshot commit hangs off HEAD"
    );
    // The parent's edits are the base, not the child's work.
    let diff = diff_stat(&path, Some(&base_commit)).await;
    assert_eq!(diff.as_deref(), Some("0 files changed, +0 -0"));
}

#[tokio::test]
async fn a_force_added_ignored_file_carries_into_the_worktree() {
    let dir = repo_with_commit();
    write(dir.path(), ".gitignore", "*.log\n");
    commit(dir.path(), "ignore logs");
    write(dir.path(), "kept.log", "staged on purpose\n");
    git(dir.path(), &["add", "-f", "kept.log"]);
    let root = dir.path().to_string_lossy().into_owned();
    let prepared = prepare(&root, &RunId::mint()).await.expect("the worktree prepares");
    let path = prepared.workspace.path.expect("the worktree path");
    let kept = std::fs::read_to_string(Path::new(&path).join("kept.log"));
    assert_eq!(kept.ok().as_deref(), Some("staged on purpose\n"));
}

#[tokio::test]
async fn a_clean_tree_starts_on_head_itself() {
    let dir = repo_with_commit();
    let root = dir.path().to_string_lossy().into_owned();
    let head = git(dir.path(), &["rev-parse", "HEAD"]);
    let short = git(dir.path(), &["rev-parse", "--short", "HEAD"]);
    let prepared = prepare(&root, &RunId::mint()).await.expect("the worktree prepares");
    assert_eq!(prepared.base_commit.as_deref(), Some(head.as_str()));
    assert_eq!(prepared.workspace.base, Some(format!("main @ {short}")));
}

#[tokio::test]
async fn the_diff_stat_counts_committed_and_uncommitted_child_work() {
    let dir = repo_with_commit();
    let root = dir.path().to_string_lossy().into_owned();
    let run = RunId::mint();
    let prepared = prepare(&root, &run).await.expect("the worktree prepares");
    let path = prepared.workspace.path.expect("the worktree path");
    let base_commit = prepared.base_commit.expect("the base");
    let worktree = Path::new(&path);
    write(worktree, "a.txt", "the child's rewrite\n");
    write(worktree, "c.txt", "new file\n");
    git(worktree, &["add", "-A", "--", "."]);
    git(worktree, &["commit", "-m", "child work"]);
    write(worktree, "d.txt", "uncommitted\n");
    let diff = diff_stat(&path, Some(&base_commit)).await;
    assert_eq!(diff.as_deref(), Some("3 files changed, +3 -1"));
    assert!(
        git(worktree, &["status", "--porcelain"]).contains("?? d.txt"),
        "the diff stat leaves the child's index alone"
    );
    assert_eq!(diff_stat(&path, None).await, None);
}

#[tokio::test]
async fn a_directory_that_is_not_a_repository_is_refused() {
    let dir = TempDir::new().expect("temp dir");
    let root = dir.path().to_string_lossy().into_owned();
    let run = RunId::mint();
    let error = prepare(&root, &run).await.expect_err("not a repository");
    assert!(error.contains("worktree_failed"), "{error}");
}

#[tokio::test]
async fn a_repository_with_no_commits_prepares_with_no_base() {
    let dir = TempDir::new().expect("temp dir");
    git(dir.path(), &["init", "--initial-branch=main"]);
    write(dir.path(), "a.txt", "first\n");
    let root = dir.path().to_string_lossy().into_owned();
    let run = RunId::mint();
    let prepared = match prepare(&root, &run).await {
        Ok(prepared) => prepared,
        Err(error) => {
            // Older git cannot add a worktree from an unborn branch; the
            // agent falls back to the shared workspace.
            assert!(error.contains("worktree_failed"), "{error}");
            return;
        }
    };
    assert!(prepared.base_commit.is_none());
    assert!(prepared.workspace.base.is_none());
    let diff = diff_stat(prepared.workspace.path.as_deref().unwrap(), None).await;
    assert_eq!(diff, None);
}

#[cfg(unix)]
#[tokio::test]
async fn the_sweep_removes_aged_sub_worktrees_and_their_branches() {
    let dir = repo_with_commit();
    let root = dir.path().to_string_lossy().into_owned();
    let run = RunId::mint();
    let prepared = prepare(&root, &run).await.expect("the worktree prepares");
    let path = prepared.workspace.path.expect("the worktree path");
    let branch = prepared.workspace.branch.expect("the branch");
    age_tree(Path::new(&path));
    sweep_roots(vec![dir.path().to_path_buf()]).await;
    assert!(!Path::new(&path).exists(), "the aged worktree is removed");
    let branches = git(dir.path(), &["branch", "--list", &branch]);
    assert!(branches.is_empty(), "the branch is deleted: {branches}");
}

#[cfg(unix)]
#[tokio::test]
async fn the_sweep_keeps_fresh_sub_worktrees() {
    let dir = repo_with_commit();
    let root = dir.path().to_string_lossy().into_owned();
    let run = RunId::mint();
    let prepared = prepare(&root, &run).await.expect("the worktree prepares");
    let path = prepared.workspace.path.expect("the worktree path");
    sweep_roots(vec![dir.path().to_path_buf()]).await;
    assert!(Path::new(&path).exists(), "a fresh worktree survives the sweep");
}

#[tokio::test]
async fn discard_removes_an_unused_worktree_and_its_branch() {
    let dir = repo_with_commit();
    let root = dir.path().to_string_lossy().into_owned();
    let prepared = prepare(&root, &RunId::mint()).await.expect("the worktree prepares");
    let path = prepared.workspace.path.expect("the worktree path");
    let branch = prepared.workspace.branch.expect("the branch");
    discard(root, path.clone(), branch.clone()).await;
    assert!(!Path::new(&path).exists(), "the worktree is removed");
    assert!(git(dir.path(), &["branch", "--list", &branch]).is_empty());
}

/// Set every entry under `dir`, `dir` included, 8 days back.
#[cfg(unix)]
fn age_tree(dir: &Path) {
    let aged = std::time::SystemTime::now() - std::time::Duration::from_secs(8 * 24 * 60 * 60);
    let mut pending = vec![dir.to_path_buf()];
    while let Some(path) = pending.pop() {
        if path.symlink_metadata().expect("the entry stats").is_dir() {
            for entry in std::fs::read_dir(&path).expect("the directory reads") {
                pending.push(entry.expect("the entry reads").path());
            }
        }
        std::fs::File::open(&path)
            .and_then(|file| file.set_modified(aged))
            .expect("the mtime sets");
    }
}

#[cfg(unix)]
#[tokio::test]
async fn the_sweep_keeps_an_old_worktree_with_a_recent_edit_deep_inside() {
    let dir = repo_with_commit();
    let root = dir.path().to_string_lossy().into_owned();
    let prepared = prepare(&root, &RunId::mint()).await.expect("the worktree prepares");
    let path = prepared.workspace.path.expect("the worktree path");
    let worktree = Path::new(&path);
    std::fs::create_dir_all(worktree.join("src/deep")).expect("subfolders");
    write(worktree, "src/deep/edited.txt", "old\n");
    age_tree(worktree);
    // Editing a file deep in the tree leaves every directory's mtime old.
    write(worktree, "src/deep/edited.txt", "the child's recent edit\n");
    sweep_roots(vec![dir.path().to_path_buf()]).await;
    assert!(worktree.exists(), "a worktree edited recently survives the sweep");
}

#[cfg(unix)]
#[tokio::test]
async fn the_sweep_keeps_a_sub_worktree_outside_the_managed_directory() {
    let dir = repo_with_commit();
    let root = dir.path().to_string_lossy().into_owned();
    // With no `.termul/worktrees` at all the sweep skips the root, which
    // would pass this test without the location check.
    prepare(&root, &RunId::mint()).await.expect("the worktree prepares");
    let elsewhere = TempDir::new().expect("temp dir");
    let path = elsewhere.path().join("sub-x");
    let path_text = path.to_string_lossy().into_owned();
    git(
        dir.path(),
        &["worktree", "add", "-b", "troupe/sub/x", "--", path_text.as_str(), "HEAD"],
    );
    age_tree(&path);
    sweep_roots(vec![dir.path().to_path_buf()]).await;
    assert!(path.exists(), "a worktree outside .termul/worktrees survives the sweep");
    assert!(!git(dir.path(), &["branch", "--list", "troupe/sub/x"]).is_empty());
}
