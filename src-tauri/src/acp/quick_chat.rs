//! Host-owned folders for quick chats.
//!
//! A quick chat has no project. The client never chooses its directory. The
//! host mints an id and creates `~/.troupe/quick-chats/<id>`. List, resume,
//! and load accept that directory only after canonicalization, so `..` and a
//! symlink cannot leave the quick-chat root.

use std::path::{Component, Path, PathBuf};

use uuid::Uuid;

use crate::logging::redact_session_id;
use crate::path_validation::strip_verbatim_prefix;

/// Directory name under `~/.troupe`. Fixed for v1: there is no setting.
pub const QUICK_CHATS_DIR_NAME: &str = "quick-chats";

const TROUPE_DIR_NAME: &str = ".troupe";
const MAX_CHAT_ID_BYTES: usize = 80;

/// Why a client cwd is or is not a quick-chat folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ListingDecision {
    /// The path does not claim to be under the quick-chat root.
    NotQuick,
    /// The path is exactly one real chat folder inside the root.
    Locked(String),
    /// The path claims the quick-chat root but leaves it, or is not one chat folder.
    Rejected(String),
}

/// The host user's home directory. `HOME` on Unix, `USERPROFILE` on Windows.
#[must_use]
pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// `~/.troupe/quick-chats`. The directory may not exist yet.
pub fn quick_chats_root() -> Result<PathBuf, String> {
    #[cfg(test)]
    if let Some(path) = test_root::current() {
        return Ok(path);
    }
    let home = home_dir().ok_or_else(|| "quick chats need a home directory".to_string())?;
    Ok(home.join(TROUPE_DIR_NAME).join(QUICK_CHATS_DIR_NAME))
}

/// Tests set this so they do not write `~/.troupe/quick-chats` in the real home.
#[cfg(test)]
mod test_root {
    use std::path::PathBuf;
    use std::sync::Mutex;

    static GATE: Mutex<()> = Mutex::new(());
    static ROOT: Mutex<Option<PathBuf>> = Mutex::new(None);

    pub(super) fn current() -> Option<PathBuf> {
        ROOT.lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub(super) fn lock(path: PathBuf) -> std::sync::MutexGuard<'static, ()> {
        let gate = GATE.lock().unwrap_or_else(|error| error.into_inner());
        *ROOT.lock().unwrap_or_else(|error| error.into_inner()) = Some(path);
        gate
    }

    pub(super) fn clear() {
        *ROOT.lock().unwrap_or_else(|error| error.into_inner()) = None;
    }
}

/// Holds the process-wide test root until drop. Tests that create folders take one.
#[cfg(test)]
pub struct QuickChatRootGuard {
    _gate: std::sync::MutexGuard<'static, ()>,
}

#[cfg(test)]
pub fn set_quick_chat_root_for_test(path: impl Into<PathBuf>) -> QuickChatRootGuard {
    QuickChatRootGuard {
        _gate: test_root::lock(path.into()),
    }
}

#[cfg(test)]
impl Drop for QuickChatRootGuard {
    fn drop(&mut self) {
        test_root::clear();
    }
}

/// A new folder id. It is a single path segment, so it cannot climb out of the root.
#[must_use]
pub fn mint_chat_id() -> String {
    Uuid::new_v4().to_string()
}

/// `true` when `id` is one folder name: letters, digits, `-` and `_` only.
#[must_use]
pub fn chat_id_is_safe(id: &str) -> bool {
    let bytes = id.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= MAX_CHAT_ID_BYTES
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-' || *byte == b'_')
}

/// `true` when `path` is the quick-chat root or a path inside it.
///
/// Lexical only, so a missing folder still cannot be attributed to a project.
/// `..` is collapsed first: a climb out of the root is not a quick-chat path.
/// A Windows `\\?\` prefix is removed before the compare, so a canonical
/// spelling and the plain root name the same folder.
#[must_use]
pub fn is_quick_chat_path(path: &str) -> bool {
    let Ok(root) = quick_chats_root() else {
        return false;
    };
    path_is_inside(
        &plain_lexical(path),
        &plain_lexical(&root.to_string_lossy()),
    )
}

/// Create `~/.troupe/quick-chats/<id>` and return the id plus the canonical folder.
///
/// The id is minted here. Callers do not pass a client path.
pub fn prepare_new_chat_dir() -> Result<(String, PathBuf), String> {
    let id = mint_chat_id();
    let root = quick_chats_root()?;
    std::fs::create_dir_all(&root).map_err(|error| {
        log::warn!("[quick-chat] could not create the root: {error}");
        "could not create the quick chat root".to_string()
    })?;
    let dir = derive_chat_dir(&root, &id)?;
    if dir.exists() {
        return Err("quick chat folder already exists".to_string());
    }
    std::fs::create_dir(&dir).map_err(|error| {
        log::warn!(
            "[quick-chat] could not create folder chat_id={}: {error}",
            redact_session_id(&id)
        );
        "could not create the quick chat folder".to_string()
    })?;
    let locked = lock_existing_chat_dir(&root, &id)?;
    log::info!(
        "[quick-chat] folder created chat_id={}",
        redact_session_id(&id)
    );
    Ok((id, locked))
}

/// The canonical folder for `chat_id`, or an error when it is missing or escapes.
pub fn cwd_for_quick_session(chat_id: &str) -> Result<String, String> {
    let root = quick_chats_root()?;
    let locked = lock_existing_chat_dir(&root, chat_id)?;
    Ok(display_path(&locked))
}

/// Delete the chat folder. A symlink is removed as a link and its target is left in place.
/// A missing folder is success.
pub fn remove_chat_dir(chat_id: &str) -> Result<(), String> {
    if !chat_id_is_safe(chat_id) {
        return Err("quick chat id is not a single folder name".to_string());
    }
    let root = quick_chats_root()?;
    let dir = derive_chat_dir(&root, chat_id)?;
    let meta = match std::fs::symlink_metadata(&dir) {
        Ok(meta) => meta,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            log::warn!(
                "[quick-chat] could not read folder chat_id={}: {error}",
                redact_session_id(chat_id)
            );
            return Err("could not read the quick chat folder".to_string());
        }
    };
    if meta.file_type().is_symlink() {
        std::fs::remove_file(&dir).map_err(|error| {
            log::warn!(
                "[quick-chat] could not remove symlink chat_id={}: {error}",
                redact_session_id(chat_id)
            );
            "could not remove the quick chat folder".to_string()
        })?;
        log::info!(
            "[quick-chat] folder symlink removed chat_id={}",
            redact_session_id(chat_id)
        );
        return Ok(());
    }
    // A file (or anything that is not a directory) is left in place. The
    // session record can still be deleted. `remove_dir_all` is not used here.
    if !meta.is_dir() {
        log::warn!(
            "[quick-chat] folder is not a directory; leaving it chat_id={}",
            redact_session_id(chat_id)
        );
        return Ok(());
    }
    let locked = lock_existing_chat_dir(&root, chat_id)?;
    std::fs::remove_dir_all(&locked).map_err(|error| {
        log::warn!(
            "[quick-chat] could not delete folder chat_id={}: {error}",
            redact_session_id(chat_id)
        );
        "could not delete the quick chat folder".to_string()
    })?;
    log::info!(
        "[quick-chat] folder deleted chat_id={}",
        redact_session_id(chat_id)
    );
    Ok(())
}

/// When `canonical_cwd` is a real quick-chat folder, its id. Otherwise `None`.
#[must_use]
pub fn chat_id_of_canonical(canonical_cwd: &Path) -> Option<String> {
    let root = quick_chats_root().ok()?;
    let root = std::fs::canonicalize(&root).ok()?;
    let inside = canonical_cwd
        .parent()
        .is_some_and(|parent| same_path(&plain_path(parent), &plain_path(&root)));
    if !inside {
        return None;
    }
    let name = canonical_cwd.file_name()?.to_str()?;
    if !chat_id_is_safe(name) {
        return None;
    }
    let meta = std::fs::symlink_metadata(canonical_cwd).ok()?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return None;
    }
    Some(name.to_string())
}

/// Classify a client cwd for `list_sessions`.
///
/// A path that does not mention the quick-chat root is [`ListingDecision::NotQuick`].
/// A path that mentions it must be exactly one real chat folder, or it is rejected
/// on every carrier (desktop IPC and remote `/ws`).
#[must_use]
pub fn listing_decision(client_cwd: &str) -> ListingDecision {
    let Ok(root) = quick_chats_root() else {
        return ListingDecision::NotQuick;
    };
    let trimmed = client_cwd.trim();
    if trimmed.is_empty() || !claims_quick_root(&root, trimmed) {
        return ListingDecision::NotQuick;
    }
    let id = match chat_id_from_client_path(&root, trimmed) {
        Ok(id) => id,
        Err(message) => return ListingDecision::Rejected(message),
    };
    match lock_existing_chat_dir(&root, &id) {
        Ok(locked) => ListingDecision::Locked(display_path(&locked)),
        Err(message) => ListingDecision::Rejected(message),
    }
}

fn derive_chat_dir(root: &Path, chat_id: &str) -> Result<PathBuf, String> {
    if !chat_id_is_safe(chat_id) {
        return Err("quick chat id is not a single folder name".to_string());
    }
    let dir = root.join(chat_id);
    if dir.parent() != Some(root) {
        return Err("quick chat folder escapes its root".to_string());
    }
    Ok(dir)
}

fn lock_existing_chat_dir(root: &Path, chat_id: &str) -> Result<PathBuf, String> {
    let dir = derive_chat_dir(root, chat_id)?;
    let meta = std::fs::symlink_metadata(&dir).map_err(|_| {
        "quick chat folder must be an existing directory inside the quick chat root".to_string()
    })?;
    if meta.file_type().is_symlink() {
        return Err("quick chat folder must not be a symlink".to_string());
    }
    if !meta.is_dir() {
        return Err(
            "quick chat folder must be an existing directory inside the quick chat root"
                .to_string(),
        );
    }
    let canonical = std::fs::canonicalize(&dir).map_err(|_| {
        "quick chat folder must be an existing directory inside the quick chat root".to_string()
    })?;
    let root_canonical = std::fs::canonicalize(root).map_err(|_| {
        "quick chat folder must be an existing directory inside the quick chat root".to_string()
    })?;
    let inside = canonical
        .parent()
        .is_some_and(|parent| same_path(&plain_path(parent), &plain_path(&root_canonical)));
    if !inside {
        return Err("quick chat folder escapes its root".to_string());
    }
    Ok(canonical)
}

fn claims_quick_root(root: &Path, client_cwd: &str) -> bool {
    // The raw spelling still names the root when a later `..` climbs out.
    // That climb must be a rejection, not an unrelated folder.
    if claims_against(root, client_cwd) {
        return true;
    }
    // macOS canonicalizes `/var` to `/private/var`. Windows canonicalizes to
    // `\\?\C:\…`. A climb written on that spelling must still claim the root
    // even when the missing target cannot be canonicalized.
    let Ok(root_canonical) = std::fs::canonicalize(root) else {
        return false;
    };
    if claims_against(&root_canonical, client_cwd)
        || claims_against(&plain_path(&root_canonical), client_cwd)
    {
        return true;
    }
    let Ok(client_canonical) = std::fs::canonicalize(client_cwd) else {
        return false;
    };
    path_is_inside(&plain_path(&client_canonical), &plain_path(&root_canonical))
}

fn claims_against(root: &Path, client_cwd: &str) -> bool {
    let root_plain = host_spelling(&root.to_string_lossy());
    let client_plain = host_spelling(client_cwd);
    raw_claims_root(&client_plain, &root_plain)
        || path_is_inside(
            &plain_lexical(client_cwd),
            &plain_lexical(&root.to_string_lossy()),
        )
}

fn chat_id_from_client_path(root: &Path, client_cwd: &str) -> Result<String, String> {
    let normalized = plain_lexical(client_cwd);
    let root = plain_lexical(&root.to_string_lossy());
    let parent = normalized.parent().map(Path::to_path_buf);
    if parent
        .as_deref()
        .is_none_or(|parent| !same_path(parent, &root))
    {
        // The lexical parent missed. The canonical folder (symlink resolved,
        // the same spelling create stores) is still the chat.
        if let Ok(canonical) = std::fs::canonicalize(client_cwd) {
            if let Some(id) = chat_id_of_canonical(&canonical) {
                return Ok(id);
            }
        }
        return Err("quick chat folder escapes its root".to_string());
    }
    let name = normalized
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "quick chat id is not a single folder name".to_string())?;
    if !chat_id_is_safe(name) {
        return Err("quick chat id is not a single folder name".to_string());
    }
    Ok(name.to_string())
}

/// Drop a Windows `\\?\` prefix and use the host's separators.
///
/// `canonicalize` returns `\\?\C:\…`. `Path` keeps that prefix as its own
/// component, so it does not compare equal to `C:\…` even when both name
/// the same folder. On Unix the string is unchanged.
fn host_spelling(path: &str) -> String {
    crate::path_validation::client_path(path.trim())
}

fn plain_path(path: &Path) -> PathBuf {
    PathBuf::from(host_spelling(&path.to_string_lossy()))
}

fn plain_lexical(path: &str) -> PathBuf {
    let spelled = host_spelling(path);
    lexical_normalize(Path::new(&spelled))
}

fn same_path(left: &Path, right: &Path) -> bool {
    if cfg!(windows) {
        path_key(left) == path_key(right)
    } else {
        left == right
    }
}

fn path_is_inside(path: &Path, root: &Path) -> bool {
    if cfg!(windows) {
        let path = path_key(path);
        let root = path_key(root).trim_end_matches('/').to_string();
        path == root || path.starts_with(&(root + "/"))
    } else {
        path == root || path.starts_with(root)
    }
}

fn path_key(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

/// `true` when `client` is `root` or a path written under it, before `..` is collapsed.
fn raw_claims_root(client: &str, root: &str) -> bool {
    let mut client = client.replace('\\', "/");
    let mut root = root.replace('\\', "/");
    if cfg!(windows) {
        client = client.to_ascii_lowercase();
        root = root.to_ascii_lowercase();
    }
    let root = root.trim_end_matches('/');
    client == root || client.starts_with(&(root.to_string() + "/"))
}

fn lexical_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn display_path(path: &Path) -> String {
    strip_verbatim_prefix(&path.to_string_lossy()).into_owned()
}

#[cfg(test)]
#[path = "quick_chat_tests.rs"]
mod tests;
