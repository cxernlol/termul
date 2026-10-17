use super::*;

fn wsl(share: &str, distro: &str, linux_path: &str) -> Option<WslPath> {
    Some(WslPath {
        share: share.to_string(),
        distro: distro.to_string(),
        linux_path: linux_path.to_string(),
    })
}

#[test]
fn parses_both_wsl_shares_and_their_spellings() {
    assert_eq!(
        parse_wsl_path(r"\\wsl.localhost\Ubuntu-24.04\home\me\repo"),
        wsl(
            r"\\wsl.localhost\Ubuntu-24.04",
            "Ubuntu-24.04",
            "/home/me/repo"
        )
    );
    assert_eq!(
        parse_wsl_path(r"\\wsl$\Debian\srv\my repo\"),
        wsl(r"\\wsl$\Debian", "Debian", "/srv/my repo")
    );
    assert_eq!(
        parse_wsl_path("//wsl.localhost/Ubuntu/home/me"),
        wsl(r"\\wsl.localhost\Ubuntu", "Ubuntu", "/home/me")
    );
    assert_eq!(
        parse_wsl_path(r"\\?\UNC\wsl.localhost\Ubuntu\home\me"),
        wsl(r"\\wsl.localhost\Ubuntu", "Ubuntu", "/home/me")
    );
    assert_eq!(
        parse_wsl_path(r"\\WSL.LOCALHOST\Ubuntu"),
        wsl(r"\\WSL.LOCALHOST\Ubuntu", "Ubuntu", "/")
    );
}

#[test]
fn other_paths_are_not_wsl() {
    for path in [
        r"C:\repo",
        r"\\?\C:\repo",
        r"\\server\share\repo",
        r"\\wsl.localhost",
        r"\\wsl.localhost\",
        "/home/me/repo",
        "",
    ] {
        assert_eq!(parse_wsl_path(path), None, "{path}");
    }
}

#[test]
fn git_runs_inside_the_distro_with_the_runner_env_forwarded() {
    let target = parse_wsl_path(r"\\wsl.localhost\Ubuntu-24.04\home\me\my repo").unwrap();
    let command = target.git_command();

    assert_eq!(command.get_program(), "wsl.exe");
    let args: Vec<_> = command.get_args().collect();
    assert_eq!(
        args,
        [
            "-d",
            "Ubuntu-24.04",
            "--exec",
            "git",
            "-C",
            "/home/me/my repo"
        ]
    );
    let env = |name: &str| {
        command
            .get_envs()
            .find(|(key, _)| *key == name)
            .and_then(|(_, value)| value)
            .unwrap()
    };
    assert_eq!(env("WSL_UTF8"), "1");
    let wslenv = env("WSLENV");
    assert!(
        wslenv
            .to_string_lossy()
            .ends_with("GIT_OPTIONAL_LOCKS:GIT_TERMINAL_PROMPT"),
        "{wslenv:?}"
    );
}

#[test]
fn wslenv_keeps_what_the_user_already_forwards() {
    assert_eq!(
        wslenv_with_git_vars(None),
        "GIT_OPTIONAL_LOCKS:GIT_TERMINAL_PROMPT"
    );
    assert_eq!(
        wslenv_with_git_vars(Some("")),
        "GIT_OPTIONAL_LOCKS:GIT_TERMINAL_PROMPT"
    );
    assert_eq!(
        wslenv_with_git_vars(Some("USERPROFILE/p")),
        "USERPROFILE/p:GIT_OPTIONAL_LOCKS:GIT_TERMINAL_PROMPT"
    );
}

#[test]
fn paths_git_prints_map_back_through_the_same_share() {
    let target = parse_wsl_path(r"\\wsl$\Ubuntu\home\me\repo\src").unwrap();
    assert_eq!(
        target.host_path("/home/me/repo"),
        PathBuf::from(r"\\wsl$\Ubuntu\home\me\repo")
    );
}

#[test]
fn only_windows_routes_git_into_wsl() {
    let target = wsl_target(r"\\wsl.localhost\Ubuntu\home\me\repo");
    assert_eq!(target.is_some(), cfg!(windows));
}
