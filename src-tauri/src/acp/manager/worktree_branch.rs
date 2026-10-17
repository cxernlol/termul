//! Worktree branch rename (story 16, CAP-5): the one host function every
//! caller goes through.
//!
//! [`rename_and_record`] renames through `WorktreeManager`, rewrites
//! `worktree_branch` for every session on that worktree (the host
//! `SessionPersistence` is the only writer, AD-10) and fans an agent-level
//! `worktree_branch_renamed` event out to every sink (AD-11). Callers: the MCP
//! `set_session_title` path ([`auto_rename_for_session`], source `auto`), the
//! Tauri command and the write-gated web route (by hand, source `user`, via
//! `AcpManager::rename_worktree_branch`).
//!
//! Logging: outcome logs carry stable codes and counts only. Branch names come
//! from prompts, so they are logged at `debug` and never above; prompt text is
//! never logged.

use super::*;
use crate::acp::events::WorktreeBranchRenamedEvent;
use crate::acp::session_persistence::WorktreeBranchSource;
use crate::worktree::{WorktreeError, WorktreeManager};

/// Longest accepted slug (the part after `chat/`).
const BRANCH_SLUG_MAX_LEN: usize = 48;
/// Namespace every agent-named branch lives in.
const CHAT_BRANCH_PREFIX: &str = "chat/";

/// Why [`rename_and_record`] failed. `Worktree` carries the git-side refusal
/// (`INVALID_BRANCH_NAME`, `BRANCH_EXISTS`, `BRANCH_CHANGED`, ...);
/// `Persistence` means git renamed the branch but a session record could not
/// be rewritten (the event is still emitted so clients reconcile).
#[derive(Debug, Clone)]
pub enum RenameBranchError {
    Worktree(WorktreeError),
    Persistence(String),
}

impl RenameBranchError {
    /// Stable code for IPC bodies and outcome logs.
    #[must_use]
    pub fn error_code(&self) -> &str {
        match self {
            Self::Worktree(error) => error.error_code(),
            Self::Persistence(_) => "SESSION_PERSIST_FAILED",
        }
    }
}

impl std::fmt::Display for RenameBranchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Worktree(error) => write!(f, "{error}"),
            Self::Persistence(_) => write!(
                f,
                "The branch was renamed but saving it to the chat history failed."
            ),
        }
    }
}

impl From<WorktreeError> for RenameBranchError {
    fn from(error: WorktreeError) -> Self {
        Self::Worktree(error)
    }
}

/// Validate an agent-supplied slug and return the target branch
/// `chat/<slug>`: trim + lowercase, then `^[a-z0-9]+(-[a-z0-9]+)*$`, length
/// `1..=48`. `None` for anything else.
#[must_use]
pub(crate) fn slug_to_branch(raw: &str) -> Option<String> {
    let slug = raw.trim().to_lowercase();
    let valid = !slug.is_empty()
        && slug.len() <= BRANCH_SLUG_MAX_LEN
        && slug.split('-').all(|segment| {
            !segment.is_empty()
                && segment
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        });
    valid.then(|| format!("{CHAT_BRANCH_PREFIX}{slug}"))
}

/// Rename `old` to `new` in the worktree at `worktree_path`, record it on every
/// session of that worktree and announce it to every sink.
///
/// `persistence` is `None` only for live-only managers (no durable index to
/// rewrite); the rename and the event still happen. On success exactly one
/// agent-level event is emitted; on a git refusal none.
pub(crate) async fn rename_and_record(
    persistence: Option<&SessionPersistence>,
    sinks: &[Arc<dyn EventSink>],
    worktree_path: &str,
    old: &str,
    new: &str,
    source: WorktreeBranchSource,
) -> Result<(), RenameBranchError> {
    let git_path = worktree_path.to_string();
    let git_old = old.to_string();
    let git_new = new.to_string();
    let git_result = tokio::task::spawn_blocking(move || {
        WorktreeManager::rename_branch(&git_path, &git_old, &git_new)
    })
    .await
    .map_err(|error| RenameBranchError::Worktree(WorktreeError::IoError(error.to_string())))?;
    git_result?;

    let record_result = match persistence {
        Some(persistence) => persistence
            .rename_worktree_branch(worktree_path, new, source == WorktreeBranchSource::User)
            .await
            .map_err(|error| RenameBranchError::Persistence(error.to_string())),
        None => Ok(0),
    };

    // The git branch changed even if a session record could not be rewritten,
    // so clients must still learn about it.
    let event = WorktreeBranchRenamedEvent {
        worktree_path: worktree_path.to_string(),
        old_branch: old.to_string(),
        new_branch: new.to_string(),
    };
    events::fan_out(sinks, None, events::EVENT_WORKTREE_BRANCH_RENAMED, &event);

    match &record_result {
        Ok(sessions) => log::info!(
            "[worktree-rename] renamed source={} sessions={sessions}",
            source_label(source)
        ),
        Err(error) => log::warn!(
            "[worktree-rename] renamed but record failed source={} code={}",
            source_label(source),
            error.error_code()
        ),
    }
    log::debug!(
        "[worktree-rename] branch names old={old:?} new={new:?} worktree={worktree_path:?}"
    );
    record_result.map(|_| ())
}

fn source_label(source: WorktreeBranchSource) -> &'static str {
    match source {
        WorktreeBranchSource::Auto => "auto",
        WorktreeBranchSource::User => "user",
    }
}

/// The MCP `set_session_title` auto rename. The caller invokes it ONCE per
/// session (first call only) independent of the title outcome. It renames only
/// when this session created the worktree, the branch source is still `auto`
/// and the worktree is still on its launch branch; any refusal keeps the
/// branch, emits nothing and logs exactly one warning (no branch names).
pub(crate) async fn auto_rename_for_session(
    persistence: &SessionPersistence,
    sinks: &[Arc<dyn EventSink>],
    session_id: &str,
    raw_slug: Option<&str>,
) {
    use crate::acp::session_persistence::AutoRenameRefusal;

    let redacted = crate::logging::redact_session_id(session_id);
    let target = match persistence.worktree_branch_guard(session_id) {
        Ok(target) => target,
        Err(refusal) => {
            // A chat with no worktree (or one that did not create its
            // worktree and supplied no slug) has nothing to rename: that is
            // the common case, not a failure worth a warning.
            let quiet = match refusal {
                AutoRenameRefusal::NoWorktree => true,
                AutoRenameRefusal::NotCreator => raw_slug.is_none(),
                AutoRenameRefusal::SourceUser | AutoRenameRefusal::NoLaunchBranch => false,
            };
            if quiet {
                log::debug!(
                    "[worktree-rename] auto rename skipped session={redacted} reason={}",
                    refusal.code()
                );
            } else {
                log::warn!(
                    "[worktree-rename] auto rename skipped session={redacted} reason={}",
                    refusal.code()
                );
            }
            return;
        }
    };
    let Some(new_branch) = raw_slug.and_then(slug_to_branch) else {
        log::warn!("[worktree-rename] auto rename skipped session={redacted} reason=invalid_slug");
        return;
    };
    if let Err(error) = rename_and_record(
        Some(persistence),
        sinks,
        &target.worktree_path,
        &target.launch_branch,
        &new_branch,
        WorktreeBranchSource::Auto,
    )
    .await
    {
        // A persistence failure was already warned by `rename_and_record`;
        // keep the first-call path at exactly one warning.
        if !matches!(error, RenameBranchError::Persistence(_)) {
            log::warn!(
                "[worktree-rename] auto rename failed session={redacted} code={}",
                error.error_code()
            );
        }
    }
}
