//! Host-side creator detection for `chat/<id>` worktrees (story 16, CAP-5).
//!
//! Both create paths (the `worktree_create` Tauri command and the
//! `/worktree/create` web route) funnel through [`WorktreeManager::create`],
//! and the very next `new_session` registration carries the same worktree
//! path. `create` notes `(canonical path key -> branch, Instant)` here and the
//! session registration consumes the note ONCE ([`take_launch_created`]), so
//! only the chat that created the worktree is ever treated as its creator: a
//! model-switch session, a retry of an already-registered worktree, or a later
//! chat in the same worktree never matches. No renderer flag, no wire change.
//!
//! The registry is process-global and mutex-guarded; entries expire after
//! [`LAUNCH_NOTE_TTL`] and are pruned on every access, so a worktree that was
//! created but never launched cannot leak a note forever.

use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

/// How long a creation note stays claimable.
pub(super) const LAUNCH_NOTE_TTL: Duration = Duration::from_secs(30 * 60);

/// Branch prefix that marks a launcher-created chat worktree.
const CHAT_BRANCH_PREFIX: &str = "chat/";

/// Canonical comparison key for a worktree path: verbatim prefix stripped,
/// `\` -> `/`, trailing `/` trimmed, case-folded for Windows drive/UNC paths.
/// Mirrors the renderer's `worktreeKey` so host and renderer agree on identity.
#[must_use]
pub fn worktree_path_key(path: &str) -> String {
    let stripped = crate::path_validation::strip_verbatim_prefix(path.trim());
    let mut normalized = stripped.replace('\\', "/");
    while normalized.len() > 1 && normalized.ends_with('/') {
        normalized.pop();
    }
    let bytes = normalized.as_bytes();
    let is_windows_path = normalized.starts_with("//")
        || (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':');
    if is_windows_path {
        normalized.to_lowercase()
    } else {
        normalized
    }
}

#[derive(Default)]
pub(super) struct LaunchRegistry {
    notes: HashMap<String, (String, Instant)>,
}

impl LaunchRegistry {
    fn prune(&mut self, now: Instant) {
        self.notes
            .retain(|_, (_, noted_at)| now.saturating_duration_since(*noted_at) <= LAUNCH_NOTE_TTL);
    }

    /// Record a creation. Non-`chat/` branches are never noted.
    pub(super) fn note_at(&mut self, path: &str, branch: &str, now: Instant) {
        self.prune(now);
        if !branch.starts_with(CHAT_BRANCH_PREFIX) {
            return;
        }
        self.notes
            .insert(worktree_path_key(path), (branch.to_string(), now));
    }

    /// Consume a creation note. True only when a fresh note exists for the
    /// path AND its branch matches; a mismatching branch leaves the note in
    /// place (it still belongs to the real creator).
    pub(super) fn take_at(&mut self, path: &str, branch: &str, now: Instant) -> bool {
        self.prune(now);
        let key = worktree_path_key(path);
        let matches = self
            .notes
            .get(&key)
            .is_some_and(|(noted_branch, _)| noted_branch == branch);
        if matches {
            self.notes.remove(&key);
        }
        matches
    }
}

static REGISTRY: LazyLock<Mutex<LaunchRegistry>> =
    LazyLock::new(|| Mutex::new(LaunchRegistry::default()));

/// Note that `WorktreeManager::create` just made `branch` at `path` as a NEW
/// branch (only `chat/`-prefixed branches are recorded).
pub(super) fn note_launch_created(path: &str, branch: &str) {
    REGISTRY.lock().note_at(path, branch, Instant::now());
}

/// Consume-once: did the worktree at `path` get created on `branch` by a
/// launcher create that no session has claimed yet?
#[must_use]
pub fn take_launch_created(path: &str, branch: &str) -> bool {
    REGISTRY.lock().take_at(path, branch, Instant::now())
}
