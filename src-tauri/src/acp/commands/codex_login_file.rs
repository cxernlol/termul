//! Codex login state from the account's `auth.json`, for a host without the
//! `codex` CLI on PATH (the Codex agent can run as `npx codex-acp`, which
//! brings its own Codex). Only whether a login is there is read: token and
//! key values are never logged, copied or returned.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use super::CodexLoginProbe;

const AUTH_FILE: &str = "auth.json";

/// One info log per process when the probe first falls back to the file.
static FALLBACK_LOGGED: AtomicBool = AtomicBool::new(false);

/// The Codex home the CLI would use: the account home, else `CODEX_HOME`,
/// else `~/.codex`.
fn codex_home_dir(codex_home: Option<&str>) -> Option<PathBuf> {
    let explicit = codex_home
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    // An account home is always absolute (the store builds it). A relative
    // one is not this account's file: never fall back to `~/.codex` for it.
    if let Some(dir) = explicit {
        return dir.is_absolute().then_some(dir);
    }
    std::env::var("CODEX_HOME")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .or_else(|| std::env::home_dir().map(|home| home.join(".codex")))
}

/// Login state from the auth file contents, as `codex login status` reports
/// it: a ChatGPT login (a non-empty access or refresh token) or a stored API
/// key is signed in.
pub(crate) fn login_from_auth_json(contents: &str) -> CodexLoginProbe {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(contents) else {
        log::warn!("[acp] codex auth file is not valid JSON");
        return CodexLoginProbe::Unavailable;
    };
    let has_token = |key: &str| {
        value
            .get("tokens")
            .and_then(|tokens| tokens.get(key))
            .and_then(serde_json::Value::as_str)
            .is_some_and(|token| !token.trim().is_empty())
    };
    let has_api_key = value
        .get("OPENAI_API_KEY")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|key| !key.trim().is_empty());
    if has_token("refresh_token") || has_token("access_token") || has_api_key {
        CodexLoginProbe::SignedIn
    } else {
        CodexLoginProbe::SignedOut
    }
}

fn login_from_dir(dir: &Path) -> CodexLoginProbe {
    match std::fs::read_to_string(dir.join(AUTH_FILE)) {
        Ok(contents) => login_from_auth_json(&contents),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => CodexLoginProbe::SignedOut,
        Err(error) => {
            log::warn!(
                "[acp] codex auth file could not be read: {:?}",
                error.kind()
            );
            CodexLoginProbe::Unavailable
        }
    }
}

/// The login state when `codex login status` cannot run because the CLI is
/// not installed.
pub(crate) fn codex_login_from_file(codex_home: Option<&str>) -> CodexLoginProbe {
    if !FALLBACK_LOGGED.swap(true, Ordering::Relaxed) {
        log::info!("[acp] codex CLI not found; reading the Codex login file instead");
    }
    match codex_home_dir(codex_home) {
        Some(dir) => login_from_dir(&dir),
        None => CodexLoginProbe::Unavailable,
    }
}

#[cfg(test)]
#[path = "codex_login_file_tests.rs"]
mod tests;
