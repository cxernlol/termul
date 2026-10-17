//! Projects inside a WSL distro, opened on Windows through
//! `\\wsl.localhost\<distro>\…` or `\\wsl$\<distro>\…`. Windows git refuses
//! those repositories ("detected dubious ownership") and, when allowed, walks
//! the working tree over the 9P share, so git runs inside the distro instead:
//! `wsl.exe -d <distro> --exec git -C <linux path> …`.

use std::path::PathBuf;
use std::process::Command;

use super::resolve::backend_command;

/// Starting a stopped distro took 5-7s here, and 11s with the WSL VM also
/// stopped. Killing `wsl.exe` before then aborts the start, so the 2s
/// status-poll timeout alone would never let a stopped distro come up.
pub(super) const WSL_START_TIMEOUT_MS: u64 = 15_000;

/// The variables the git runners set that must reach git inside the distro.
const FORWARDED_ENV: &str = "GIT_OPTIONAL_LOCKS:GIT_TERMINAL_PROMPT";

#[derive(Debug, PartialEq, Eq)]
pub(super) struct WslPath {
    /// `\\wsl.localhost\<distro>` or `\\wsl$\<distro>`, as the path named it.
    share: String,
    distro: String,
    linux_path: String,
}

/// `path` as a location inside a WSL distro, or `None` for any other path.
pub(super) fn parse_wsl_path(path: &str) -> Option<WslPath> {
    let path = crate::path_validation::strip_verbatim_prefix(path);
    let rest = path
        .strip_prefix(r"\\")
        .or_else(|| path.strip_prefix("//"))?;
    let mut parts = rest.split(['\\', '/']).filter(|part| !part.is_empty());
    let host = parts.next()?;
    if !host.eq_ignore_ascii_case("wsl.localhost") && !host.eq_ignore_ascii_case("wsl$") {
        return None;
    }
    let distro = parts.next()?;
    Some(WslPath {
        share: format!(r"\\{host}\{distro}"),
        distro: distro.to_string(),
        linux_path: format!("/{}", parts.collect::<Vec<_>>().join("/")),
    })
}

/// The WSL location git should run in for `cwd`; only Windows has them.
pub(super) fn wsl_target(cwd: &str) -> Option<WslPath> {
    if cfg!(windows) {
        parse_wsl_path(cwd)
    } else {
        None
    }
}

impl WslPath {
    /// `git -C <linux path>` inside the distro, ready for git's arguments.
    pub(super) fn git_command(&self) -> Command {
        let mut command = backend_command("wsl.exe");
        command
            .args(["-d", &self.distro, "--exec", "git", "-C", &self.linux_path])
            // wsl.exe writes its own errors (an unknown distro) as UTF-16 otherwise.
            .env("WSL_UTF8", "1")
            .env(
                "WSLENV",
                wslenv_with_git_vars(std::env::var("WSLENV").ok().as_deref()),
            );
        command
    }

    /// The Windows path of an absolute path that git printed inside the distro.
    pub(super) fn host_path(&self, linux_path: &str) -> PathBuf {
        PathBuf::from(format!("{}{}", self.share, linux_path.replace('/', r"\")))
    }
}

fn wslenv_with_git_vars(existing: Option<&str>) -> String {
    match existing {
        Some(existing) if !existing.is_empty() => format!("{existing}:{FORWARDED_ENV}"),
        _ => FORWARDED_ENV.to_string(),
    }
}

#[cfg(test)]
#[path = "wsl_tests.rs"]
mod tests;
