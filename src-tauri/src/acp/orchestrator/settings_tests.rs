//! The settings store: defaults, persistence, corruption and validation.

use super::*;

fn dir() -> tempfile::TempDir {
    tempfile::tempdir().expect("tempdir")
}

#[test]
fn a_missing_file_loads_the_defaults() {
    let store = SettingsStore::open(dir().path());
    let settings = store.get();
    assert_eq!(
        settings,
        OrchestratorSettings {
            enabled: true,
            max_running: DEFAULT_MAX_RUNNING,
            max_depth: DEFAULT_MAX_DEPTH,
            agents: Default::default(),
        }
    );
}

#[test]
fn a_saved_settings_file_round_trips() {
    let dir = dir();
    let store = SettingsStore::open(dir.path());
    let saved = store
        .set(OrchestratorSettings {
            enabled: false,
            max_running: 2,
            max_depth: 3,
            agents: [("codex".to_string(), false)].into(),
        })
        .expect("saved");
    assert!(!saved.enabled);
    let reloaded = SettingsStore::open(dir.path()).get();
    assert_eq!(reloaded, saved);
}

#[test]
fn a_corrupt_file_is_backed_up_and_the_defaults_load() {
    let dir = dir();
    std::fs::write(dir.path().join(FILE_NAME), b"{not json").expect("write");
    let store = SettingsStore::open(dir.path());
    assert_eq!(store.get(), OrchestratorSettings::default());
    let backups = corrupt_backups(dir.path());
    assert_eq!(backups.len(), 1, "the corrupt file was kept aside");
    assert_eq!(std::fs::read(&backups[0]).expect("backup"), b"{not json");
}

fn corrupt_backups(dir: &Path) -> Vec<PathBuf> {
    let prefix = format!("{FILE_NAME}.corrupt-");
    std::fs::read_dir(dir)
        .expect("dir")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            name.starts_with(&prefix) && name.ends_with(".bak")
        })
        .collect()
}

#[test]
fn a_newer_file_loads_the_defaults_and_is_never_overwritten() {
    let dir = dir();
    let path = dir.path().join(FILE_NAME);
    let newer = br#"{"schema_version":2,"futureField":true}"#;
    std::fs::write(&path, newer).expect("write");
    let store = SettingsStore::open(dir.path());
    assert_eq!(store.get(), OrchestratorSettings::default());

    let error = store
        .set(OrchestratorSettings::default())
        .expect_err("a newer file is read-only");
    assert!(error.contains("newer Troupe"), "{error}");
    assert_eq!(std::fs::read(&path).expect("file"), newer);
    assert!(corrupt_backups(dir.path()).is_empty());
}

#[test]
fn concurrent_updates_keep_each_others_changes() {
    let dir = dir();
    let store = std::sync::Arc::new(SettingsStore::open(dir.path()));
    let writers: Vec<_> = (0..8)
        .map(|index| {
            let store = store.clone();
            std::thread::spawn(move || {
                store
                    .update(|settings| {
                        settings.agents.insert(format!("agent-{index}"), false);
                    })
                    .expect("saved");
            })
        })
        .collect();
    for writer in writers {
        writer.join().expect("writer");
    }
    let saved = SettingsStore::open(dir.path()).get();
    assert_eq!(saved.agents.len(), 8);
    assert_eq!(store.get(), saved);
}

#[test]
fn a_refused_update_leaves_the_settings_unchanged() {
    let dir = dir();
    let store = SettingsStore::open(dir.path());
    store
        .update(|settings| settings.max_depth = 3)
        .expect("saved");
    let error = store
        .update(|settings| {
            settings.enabled = false;
            settings.max_running = 0;
        })
        .expect_err("out of range");
    assert!(error.contains("max_running"), "{error}");
    let expected = OrchestratorSettings {
        max_depth: 3,
        ..OrchestratorSettings::default()
    };
    assert_eq!(store.get(), expected);
    assert_eq!(SettingsStore::open(dir.path()).get(), expected);
}

#[test]
fn an_in_memory_store_never_writes() {
    let store = SettingsStore::in_memory();
    store
        .set(OrchestratorSettings {
            enabled: true,
            max_running: 8,
            max_depth: 4,
            agents: Default::default(),
        })
        .expect("saved");
    assert_eq!(store.get().max_running, 8);
}

#[test]
fn set_validates_the_bounds() {
    let store = SettingsStore::in_memory();
    for max_running in [0, 9] {
        let error = store
            .set(OrchestratorSettings {
                max_running,
                ..OrchestratorSettings::default()
            })
            .expect_err("out of range");
        assert!(error.contains("max_running"), "{error}");
    }
    for max_depth in [0, 5] {
        let error = store
            .set(OrchestratorSettings {
                max_depth,
                ..OrchestratorSettings::default()
            })
            .expect_err("out of range");
        assert!(error.contains("max_depth"), "{error}");
    }
    let error = store
        .set(OrchestratorSettings {
            agents: [("  ".to_string(), true)].into(),
            ..OrchestratorSettings::default()
        })
        .expect_err("blank key");
    assert!(error.contains("blank"), "{error}");
    assert_eq!(store.get(), OrchestratorSettings::default());
}
