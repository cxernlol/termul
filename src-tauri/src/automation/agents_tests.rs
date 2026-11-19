use std::collections::HashMap;

use super::agents::{agent_key, AgentRegistry, KnownAgent, FILE_NAME};
use crate::acp::config::AgentConfig;

fn config(config_id: Option<&str>, name: &str, command: &str) -> AgentConfig {
    AgentConfig {
        config_id: config_id.map(str::to_string),
        name: name.to_string(),
        command: command.to_string(),
        args: vec!["--acp".to_string()],
        env: HashMap::from([("TOKEN".to_string(), "t-1".to_string())]),
        allow_terminal: false,
    }
}

#[test]
fn records_survive_a_reload_and_the_view_hides_the_launch_command() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(FILE_NAME);
    let registry = AgentRegistry::open(path.clone());
    registry.record(&config(Some("claude"), "Claude Code", "/usr/bin/old"));
    registry.record(&config(Some("claude"), "Claude Code", "/usr/bin/claude"));
    registry.record(&config(None, "opencode", "opencode"));

    let reloaded = AgentRegistry::open(path);
    assert_eq!(
        reloaded.list(),
        vec![
            KnownAgent {
                agent_id: "claude".to_string(),
                name: "Claude Code".to_string()
            },
            KnownAgent {
                agent_id: "opencode".to_string(),
                name: "opencode".to_string()
            },
        ]
    );
    assert_eq!(
        reloaded.resolve("claude").unwrap().command,
        "/usr/bin/claude"
    );
    assert!(reloaded.resolve("Claude Code").is_none());
    assert_eq!(
        serde_json::to_value(reloaded.list()).unwrap(),
        serde_json::json!([
            { "agent_id": "claude", "name": "Claude Code" },
            { "agent_id": "opencode", "name": "opencode" }
        ])
    );
}

#[test]
fn a_blank_config_id_falls_back_to_the_name() {
    assert_eq!(agent_key(&config(Some("  "), "gemini", "gemini")), "gemini");
    assert_eq!(
        agent_key(&config(Some(" cfg-1 "), "gemini", "gemini")),
        "cfg-1"
    );
}

#[test]
fn a_corrupt_file_starts_empty_and_is_kept_aside() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(FILE_NAME);
    std::fs::write(&path, b"{not json").unwrap();
    let registry = AgentRegistry::open(path);
    assert!(registry.list().is_empty());
    registry.reload();
    assert_eq!(corrupt_backups(dir.path()), 1);
}

fn corrupt_backups(dir: &std::path::Path) -> usize {
    std::fs::read_dir(dir)
        .unwrap()
        .filter(|e| {
            e.as_ref()
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains(".corrupt-")
        })
        .count()
}

#[test]
fn a_reload_keeps_the_last_good_agents_and_backs_up_each_corrupt_file_once() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(FILE_NAME);
    AgentRegistry::open(path.clone()).record(&config(Some("claude"), "Claude Code", "claude"));
    let reader = AgentRegistry::open(path.clone());

    std::fs::write(&path, b"{not json").unwrap();
    reader.reload();
    reader.reload();
    assert_eq!(reader.resolve("claude").unwrap().command, "claude");
    assert_eq!(corrupt_backups(dir.path()), 1);

    std::fs::write(&path, b"{still not json").unwrap();
    reader.reload();
    assert_eq!(corrupt_backups(dir.path()), 2);

    std::fs::write(&path, br#"{"schema_version":1,"agents":{}}"#).unwrap();
    reader.reload();
    assert!(reader.list().is_empty());
}

#[cfg(unix)]
#[test]
fn the_registry_file_is_owner_only_because_env_can_hold_keys() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(FILE_NAME);
    AgentRegistry::open(path.clone()).record(&config(Some("claude"), "Claude Code", "claude"));
    let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
}
