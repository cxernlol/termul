use super::*;

/// `git merge-tree` prints its usage and exits 129 when it does not know `--write-tree`.
const MERGE_TREE_USAGE_EXIT_CODE: i32 = 129;

fn is_object_id(s: &str) -> bool {
    matches!(s.len(), 40 | 64) && s.bytes().all(|b| b.is_ascii_hexdigit())
}

impl WorktreeManager {
    /// Preview merging `target_branch` into the worktree's current branch with
    /// `git merge-tree --write-tree`, which needs Git 2.38 or newer. It computes the
    /// merge in the object database, so the working tree, the index and `HEAD`
    /// stay untouched.
    pub fn merge_preview(
        worktree_path: &str,
        target_branch: &str,
    ) -> Result<MergePreview, WorktreeError> {
        ensure_valid_branch_name(target_branch, worktree_path)?;
        let current_branch = Self::get_current_branch(worktree_path)?;

        let output = run_git_output(
            &[
                "merge-tree",
                "--write-tree",
                "--name-only",
                "-z",
                "--",
                "HEAD",
                target_branch,
            ],
            Some(worktree_path),
        )?;
        if output.code == Some(MERGE_TREE_USAGE_EXIT_CODE) {
            return Err(WorktreeError::GitError(
                "Merge preview needs Git 2.38 or newer. Update Git to preview a merge.".to_string(),
            ));
        }
        let mut fields = output.stdout.split('\0');
        let tree = fields.next().unwrap_or_default();
        let merged = matches!(output.code, Some(0..=1)) && is_object_id(tree);
        if !merged {
            return Err(parse_git_stderr(&output.stderr));
        }
        let conflict_paths: Vec<&str> = if output.code == Some(1) {
            fields.take_while(|path| !path.is_empty()).collect()
        } else {
            Vec::new()
        };

        let (changed, _) = run_git(
            &["diff", "--name-only", "-z", "HEAD", tree, "--"],
            Some(worktree_path),
        )?;
        let changed_files: Vec<String> = changed
            .split('\0')
            .filter(|path| !path.is_empty())
            .map(str::to_string)
            .collect();

        let conflict_files: Vec<ConflictFile> = conflict_paths
            .into_iter()
            .map(|path| Self::conflict_file_from_merged_tree(worktree_path, tree, path))
            .collect();

        Ok(MergePreview {
            direction: format!("{} → {}", current_branch, target_branch),
            source_branch: current_branch,
            target_branch: target_branch.to_string(),
            conflict_files,
            total_changes: changed_files.len(),
            changed_files,
            detection_mode: "accurate".to_string(),
        })
    }

    /// Execute a merge from the worktree's current branch to target_branch.
    pub fn merge_execute(
        worktree_path: &str,
        target_branch: &str,
    ) -> Result<String, WorktreeError> {
        ensure_valid_branch_name(target_branch, worktree_path)?;
        let (stdout, _) = run_git(&["merge", "--", target_branch], Some(worktree_path))
            .map_err(|_| WorktreeError::MergeFailed)?;
        Ok(stdout.trim().to_string())
    }

    /// Get the current branch name of a git repo.
    fn get_current_branch(worktree_path: &str) -> Result<String, WorktreeError> {
        let (stdout, _) = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], Some(worktree_path))?;
        Ok(stdout.trim().to_string())
    }

    /// Get the branch name of a worktree by reading its git HEAD.
    pub(super) fn get_worktree_branch(worktree_path: &str) -> Result<String, WorktreeError> {
        let (stdout, _) = run_git(&["rev-parse", "--abbrev-ref", "HEAD"], Some(worktree_path))?;
        let branch = stdout.trim().to_string();
        if branch == "HEAD" {
            Err(WorktreeError::BranchNotFound)
        } else {
            Ok(branch)
        }
    }

    /// Describe one conflicted path using the content `merge-tree` wrote for it,
    /// conflict markers included. A path with no such blob (modify/delete) counts as
    /// one conflict.
    fn conflict_file_from_merged_tree(worktree_path: &str, tree: &str, path: &str) -> ConflictFile {
        let is_lock =
            path.ends_with(".lock") || path.contains("package-lock") || path.contains("yarn.lock");
        let content = run_git(
            &["cat-file", "blob", &format!("{tree}:{path}")],
            Some(worktree_path),
        )
        .map(|(stdout, _)| stdout)
        .unwrap_or_default();
        let conflict_count = Self::count_conflict_blocks(&content).max(1);

        ConflictFile {
            path: path.to_string(),
            severity: if is_lock {
                "low".to_string()
            } else {
                "high".to_string()
            },
            conflict_count,
            is_lock_file: is_lock,
        }
    }

    /// Count the conflict blocks in file content with conflict markers.
    pub(super) fn count_conflict_blocks(content: &str) -> usize {
        let lines: Vec<&str> = content.lines().collect();
        let mut count = 0;
        let mut i = 0;

        while i < lines.len() {
            if lines[i].starts_with("<<<<<<<") {
                count += 1;
                i += 1;
                while i < lines.len()
                    && !lines[i].starts_with("|||||||")
                    && !lines[i].starts_with("=======")
                {
                    i += 1;
                }
                if i < lines.len() && lines[i].starts_with("|||||||") {
                    i += 1;
                    while i < lines.len() && !lines[i].starts_with("=======") {
                        i += 1;
                    }
                }
                if i < lines.len() && lines[i].starts_with("=======") {
                    i += 1;
                }
                while i < lines.len() && !lines[i].starts_with(">>>>>>>") {
                    i += 1;
                }
            }
            i += 1;
        }

        count
    }
}
