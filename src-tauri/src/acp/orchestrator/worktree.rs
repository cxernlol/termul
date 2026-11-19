//! The per-run git worktree: a snapshot of the parent's current state
//! (including uncommitted changes) that the child works in, kept after
//! settle for review. The sweep removes abandoned worktrees at startup.

use std::path::{Path, PathBuf};

use tokio::runtime::Handle;

use crate::acp::orchestrator::run::RunId;
use crate::acp::subagents::{SubagentWorkspace, SubagentWorkspaceMode};
use crate::worktree::git::run_git_env_success;
use crate::worktree::WorktreeManager;

/// Worktrees whose directory stopped changing before this age are swept at
/// startup: every live run's directory changes while its child works, and
/// the children of a previous host life are dead.
const SWEEP_AGE: std::time::Duration = std::time::Duration::from_secs(7 * 24 * 60 * 60);

/// The result of preparing a run's workspace: the record the panel shows,
/// and the snapshot commit the diff stat is taken against (absent in a
/// repository with no commits).
#[derive(Debug)]
pub(crate) struct Prepared {
    pub(crate) workspace: SubagentWorkspace,
    pub(crate) base_commit: Option<String>,
}

/// Prepare the run's worktree under `root`: snapshot the parent's state
/// (uncommitted changes included) into a temporary-index commit, then
/// create the worktree on it. The directory is kept after settle for
/// review.
pub(crate) async fn prepare(root: &str, run: &RunId) -> Result<Prepared, String> {
    let root = root.to_string();
    let name = run.0.clone();
    let branch = format!("troupe/sub/{}", run.0);
    let run_log = crate::logging::redact_session_id(run.as_str());
    let moved_root = root.clone();
    let moved_name = name.clone();
    let moved_branch = branch.clone();
    let created = tokio::task::spawn_blocking(move || {
        let snapshot = snapshot_ref(&moved_root)?;
        let start_ref = snapshot.as_ref().map(|snap| snap.commit.clone());
        WorktreeManager::create(
            &moved_root,
            &moved_name,
            &moved_branch,
            true,
            start_ref.as_deref(),
            None,
            None,
        )
        .map_err(|error| format!("worktree_failed: {}", error.error_code()))
        .map(|entry| (entry, snapshot))
    })
    .await
    .map_err(|error| error.to_string())??;
    let (entry, snapshot) = created;
    let (base, base_commit) = match snapshot {
        Some(snapshot) => (Some(snapshot.base), Some(snapshot.commit)),
        None => (None, None),
    };
    log::info!(
        "[orchestrator] run {run_log} worktree {} on {}",
        crate::logging::redact_session_id(&name),
        base.as_deref().unwrap_or("the initial commit")
    );
    Ok(Prepared {
        workspace: SubagentWorkspace {
            mode: SubagentWorkspaceMode::Worktree,
            path: Some(entry.path),
            branch: Some(branch),
            base,
            diff_stat: None,
        },
        base_commit,
    })
}

/// The diff summary of a settled worktree run — every change against the
/// snapshot commit, committed, uncommitted and untracked — as
/// "N files changed, +X -Y". `None` when there is no base (a repository
/// with no commits at spawn) or git cannot produce one.
pub(crate) async fn diff_stat(path: &str, base: Option<&str>) -> Option<String> {
    let base = base?.to_string();
    let moved_path = path.to_string();
    let stat = tokio::task::spawn_blocking(move || {
        let tree = working_tree(&moved_path, "HEAD").ok()?;
        let numstat = run_git_env_success(
            &["diff", "--numstat", &base, &tree, "--"],
            Some(&moved_path),
            &[],
        )
        .ok()?;
        let mut files = 0u64;
        let mut insertions = 0u64;
        let mut deletions = 0u64;
        for line in numstat.lines() {
            let mut parts = line.split('\t');
            let (Some(added), Some(removed)) = (parts.next(), parts.next()) else {
                continue;
            };
            files += 1;
            if let Ok(added) = added.parse::<u64>() {
                insertions += added;
            }
            if let Ok(removed) = removed.parse::<u64>() {
                deletions += removed;
            }
        }
        Some(format!("{files} files changed, +{insertions} -{deletions}"))
    })
    .await
    .ok()
    .flatten();
    if stat.is_none() {
        log::debug!(
            "[orchestrator] no diff stat for the worktree of run {}",
            crate::logging::redact_session_id(path)
        );
    }
    stat
}

/// Remove `sub-*` worktrees older than [`SWEEP_AGE`] in each root's
/// `.termul/worktrees` directory, where [`prepare`] makes them, then delete
/// their `troupe/sub/*` branches. Best-effort: failures log and
/// continue. Runs at install time only; the ledger is empty then, so a
/// worktree's age alone decides.
pub(crate) fn sweep(handle: &Handle, roots: Vec<PathBuf>) {
    if roots.is_empty() {
        return;
    }
    handle.spawn(sweep_roots(roots));
}

/// The sweep body, awaited directly by the tests.
pub(crate) async fn sweep_roots(roots: Vec<PathBuf>) {
    tokio::task::spawn_blocking(move || {
        for root in roots {
            let root_text = root.to_string_lossy().into_owned();
            let Ok(managed) = std::fs::canonicalize(root.join(".termul").join("worktrees")) else {
                continue;
            };
            let listed = match WorktreeManager::list(&root_text) {
                Ok(entries) => entries,
                Err(error) => {
                    log::debug!(
                        "[orchestrator] sweep could not list worktrees under {} ({error})",
                        root.display()
                    );
                    continue;
                }
            };
            for entry in listed {
                if !entry.name.starts_with("sub-") || !entry.branch.starts_with("troupe/sub/") {
                    continue;
                }
                let in_managed = std::fs::canonicalize(&entry.path)
                    .is_ok_and(|path| path.parent() == Some(managed.as_path()));
                if !in_managed {
                    continue;
                }
                let cutoff = std::time::SystemTime::now()
                    .checked_sub(SWEEP_AGE)
                    .unwrap_or(std::time::UNIX_EPOCH);
                if touched_since(Path::new(&entry.path), cutoff) {
                    continue;
                }
                match remove_with_branch(&root_text, &entry.path, &entry.branch) {
                    Ok(()) => log::info!(
                        "[orchestrator] sweep removed the abandoned worktree {}",
                        crate::logging::redact_session_id(&entry.name)
                    ),
                    Err(error) => log::warn!(
                        "[orchestrator] sweep could not remove the worktree {} ({})",
                        crate::logging::redact_session_id(&entry.name),
                        error.error_code()
                    ),
                }
            }
        }
    })
    .await
    .ok();
}

/// Whether anything under `dir` (the directory itself included, `.git`
/// excluded) changed after `cutoff`. A directory's own mtime does not move
/// when a file deeper in it is edited, so the walk looks at every entry and
/// stops at the first recent one. An unreadable entry counts as recent: the
/// sweep never removes what it cannot judge.
fn touched_since(dir: &Path, cutoff: std::time::SystemTime) -> bool {
    let recent = |path: &Path| {
        std::fs::symlink_metadata(path)
            .and_then(|meta| meta.modified())
            .map_or(true, |modified| modified > cutoff)
    };
    if recent(dir) {
        return true;
    }
    let mut pending = vec![dir.to_path_buf()];
    while let Some(current) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else {
            return true;
        };
        for entry in entries {
            let Ok(entry) = entry else {
                return true;
            };
            if entry.file_name() == ".git" {
                continue;
            }
            let path = entry.path();
            if recent(&path) {
                return true;
            }
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => pending.push(path),
                Ok(_) => {}
                Err(_) => return true,
            }
        }
    }
    false
}

/// Remove the worktree of a run whose task never started, and its branch.
/// Best-effort: a failure logs.
pub(crate) async fn discard(root: String, path: String, branch: String) {
    let removed = tokio::task::spawn_blocking(move || remove_with_branch(&root, &path, &branch)).await;
    match removed {
        Ok(Ok(())) => {}
        Ok(Err(error)) => log::warn!(
            "[orchestrator] could not remove an unused subagent worktree ({})",
            error.error_code()
        ),
        Err(error) => log::warn!("[orchestrator] worktree removal task failed: {error}"),
    }
}

fn remove_with_branch(
    root: &str,
    path: &str,
    branch: &str,
) -> Result<(), crate::worktree::WorktreeError> {
    WorktreeManager::remove(root, path, true)
        .and_then(|()| WorktreeManager::delete_branch(root, branch))
}

/// One snapshot: the commit the worktree starts from, and the human label
/// the panel shows ("main @ 42be01e, with uncommitted changes").
struct Snapshot {
    commit: String,
    base: String,
}

/// Snapshot the working state at `root` — HEAD plus uncommitted changes —
/// as a commit without touching the working tree or the real index: the
/// [`working_tree`], committed with `commit-tree -p <head>`. The short id,
/// the clean-tree check and the parent all use the one captured `head`, so
/// a HEAD that moves mid-capture cannot pair one commit with another's
/// tree. `None` in a repository with no commits yet (the worktree then
/// starts empty; there is no base to name). The snapshot
/// commit carries the host's identity, never the user's: the user did not
/// make it.
fn snapshot_ref(root: &str) -> Result<Option<Snapshot>, String> {
    let head = match run_git_env_success(&["rev-parse", "--verify", "HEAD"], Some(root), &[]) {
        Ok(head) => head,
        Err(_) => return Ok(None),
    };
    let short = run_git_env_success(&["rev-parse", "--short", &head], Some(root), &[])
        .unwrap_or_else(|_| head.chars().take(7).collect());
    let branch = run_git_env_success(&["rev-parse", "--abbrev-ref", "HEAD"], Some(root), &[])
        .unwrap_or_else(|_| "HEAD".to_string());
    let failure = |step: &str, error: String| format!("snapshot_failed at {step}: {error}");
    let tree = working_tree(root, &head)?;
    let branch_label = if branch == "HEAD" { short.clone() } else { branch };
    let head_tree = run_git_env_success(
        &["rev-parse", &format!("{head}^{{tree}}")],
        Some(root),
        &[],
    )
    .map_err(|error| failure("rev-parse", error))?;
    if tree == head_tree {
        return Ok(Some(Snapshot {
            commit: head,
            base: format!("{branch_label} @ {short}"),
        }));
    }
    let commit = run_git_env_success(
        &[
            "-c",
            "user.name=Troupe",
            "-c",
            "user.email=troupe@localhost.invalid",
            "commit-tree",
            &tree,
            "-p",
            &head,
            "-m",
            "troupe subagent snapshot",
        ],
        Some(root),
        &[],
    )
    .map_err(|error| failure("commit-tree", error))?;
    if commit.is_empty() {
        return Err(failure("commit-tree", "no commit id".to_string()));
    }
    Ok(Some(Snapshot {
        commit,
        base: format!("{branch_label} @ {short}, with uncommitted changes"),
    }))
}

/// The tree of everything in the working directory at `dir` — the index
/// plus unstaged and untracked (not ignored) changes — written through a
/// temporary index, so neither the working tree nor the real index changes.
/// The temporary index starts as a copy of the real one, so a file tracked
/// only there (a force-added ignored file) stays, and `add -A` reuses its
/// stat cache instead of hashing every file; with no real index it starts
/// from `seed`.
fn working_tree(dir: &str, seed: &str) -> Result<String, String> {
    let index = format!(
        "{}/troupe-subagent-index-{}",
        std::env::temp_dir().to_string_lossy(),
        uuid::Uuid::new_v4().simple()
    );
    let _cleanup = RemoveOnDrop(&index);
    let env: [(&str, &str); 1] = [("GIT_INDEX_FILE", index.as_str())];
    let failure = |step: &str, error: String| format!("snapshot_failed at {step}: {error}");
    let copied = run_git_env_success(&["rev-parse", "--absolute-git-dir"], Some(dir), &[])
        .is_ok_and(|git_dir| std::fs::copy(Path::new(&git_dir).join("index"), &index).is_ok());
    if !copied {
        run_git_env_success(&["read-tree", seed], Some(dir), &env)
            .map_err(|error| failure("read-tree", error))?;
    }
    run_git_env_success(&["add", "-A", "--", "."], Some(dir), &env)
        .map_err(|error| failure("add", error))?;
    run_git_env_success(&["write-tree"], Some(dir), &env).map_err(|error| failure("write-tree", error))
}

/// Deletes the temporary index file however the snapshot exits.
struct RemoveOnDrop<'a>(&'a str);

impl Drop for RemoveOnDrop<'_> {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(self.0);
    }
}

#[cfg(test)]
#[path = "worktree_tests.rs"]
mod worktree_tests;
