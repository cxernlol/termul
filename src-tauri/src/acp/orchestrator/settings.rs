//! The orchestrator's settings: host-side truth, one atomic JSON file in
//! the data dir, plus the view/input pair the WS routes read and write.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::acp::atomic_file;

pub const FILE_NAME: &str = "subagent-settings.json";
const SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_MAX_RUNNING: u32 = 4;
pub const DEFAULT_MAX_DEPTH: u8 = 2;

/// Bound validation, shared by `set_settings` and the WS route.
pub const MAX_RUNNING_BOUNDS: (u32, u32) = (1, 8);
pub const MAX_DEPTH_BOUNDS: (u8, u8) = (1, 4);

/// The orchestrator settings. `agents` maps a launch key to whether it is
/// allowed; an absent key is allowed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrchestratorSettings {
    pub enabled: bool,
    pub max_running: u32,
    /// 1 = no nesting.
    pub max_depth: u8,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub agents: BTreeMap<String, bool>,
}

impl Default for OrchestratorSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            max_running: DEFAULT_MAX_RUNNING,
            max_depth: DEFAULT_MAX_DEPTH,
            agents: BTreeMap::new(),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct SettingsFile {
    schema_version: u32,
    #[serde(flatten)]
    settings: OrchestratorSettings,
}

/// The write input: a full replacement, validated and persisted atomically.
pub type SettingsInput = OrchestratorSettings;

/// Read before the payload, so a newer file whose payload no longer decodes
/// is not mistaken for a corrupt one.
#[derive(Deserialize)]
struct SchemaPeek {
    schema_version: u32,
}

pub(crate) struct SettingsStore {
    path: Option<PathBuf>,
    /// The schema of a file written by a newer host. Its settings stay the
    /// in-memory defaults and every write is refused, so the file survives.
    newer_schema: Option<u32>,
    /// Held across read, merge, validate, persist and store, so concurrent
    /// updates never lose each other's fields. Readers take only `settings`.
    writer: Mutex<()>,
    settings: Mutex<OrchestratorSettings>,
}

impl SettingsStore {
    /// Loads `<data_dir>/subagent-settings.json`. A missing file is the
    /// defaults; a corrupt one is copied aside and the defaults load, so a
    /// corrupt file never blocks the feature. A file from a newer host loads
    /// the defaults read-only.
    pub(crate) fn open(data_dir: &Path) -> Self {
        let path = data_dir.join(FILE_NAME);
        let mut newer_schema = None;
        let settings = match std::fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice::<SchemaPeek>(&bytes) {
                Ok(peek) if peek.schema_version > SCHEMA_VERSION => {
                    log::warn!(
                        "[orchestrator] settings schema {} is newer than {}; defaults loaded \
                         and saving is off",
                        peek.schema_version,
                        SCHEMA_VERSION
                    );
                    newer_schema = Some(peek.schema_version);
                    OrchestratorSettings::default()
                }
                _ => match serde_json::from_slice::<SettingsFile>(&bytes) {
                    Ok(file) => file.settings,
                    Err(error) => {
                        let backup = atomic_file::backup_corrupt(&path, &bytes);
                        log::warn!(
                            "[orchestrator] settings file is corrupt ({error}); defaults loaded \
                             (backup: {})",
                            backup.is_ok()
                        );
                        OrchestratorSettings::default()
                    }
                },
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                OrchestratorSettings::default()
            }
            Err(error) => {
                log::warn!("[orchestrator] settings file unreadable: {error}");
                OrchestratorSettings::default()
            }
        };
        Self {
            path: Some(path),
            newer_schema,
            writer: Mutex::new(()),
            settings: Mutex::new(settings),
        }
    }

    /// In-memory settings (tests).
    #[cfg(test)]
    pub(crate) fn in_memory() -> Self {
        Self {
            path: None,
            newer_schema: None,
            writer: Mutex::new(()),
            settings: Mutex::new(OrchestratorSettings::default()),
        }
    }

    pub(crate) fn get(&self) -> OrchestratorSettings {
        self.settings.lock().clone()
    }

    /// Validate and persist a full replacement.
    pub(crate) fn set(&self, input: SettingsInput) -> Result<OrchestratorSettings, String> {
        self.update(|settings| *settings = input)
    }

    /// Apply `edit` to the current settings, then validate and persist the
    /// result as one write. A refused edit leaves the settings unchanged.
    pub(crate) fn update(
        &self,
        edit: impl FnOnce(&mut OrchestratorSettings),
    ) -> Result<OrchestratorSettings, String> {
        let _writer = self.writer.lock();
        if let Some(found) = self.newer_schema {
            return Err(format!(
                "the sub-agent settings were saved by a newer Troupe (schema {found}, this build \
                 understands {SCHEMA_VERSION}); upgrade Troupe to change them"
            ));
        }
        let mut next = self.get();
        edit(&mut next);
        let next = validate(next)?;
        if let Some(path) = &self.path {
            persist(path, &next)?;
        }
        *self.settings.lock() = next.clone();
        Ok(next)
    }
}

fn validate(input: OrchestratorSettings) -> Result<OrchestratorSettings, String> {
    if !(MAX_RUNNING_BOUNDS.0..=MAX_RUNNING_BOUNDS.1).contains(&input.max_running) {
        return Err(format!(
            "max_running must be between {} and {}",
            MAX_RUNNING_BOUNDS.0, MAX_RUNNING_BOUNDS.1
        ));
    }
    if !(MAX_DEPTH_BOUNDS.0..=MAX_DEPTH_BOUNDS.1).contains(&input.max_depth) {
        return Err(format!(
            "max_depth must be between {} and {}",
            MAX_DEPTH_BOUNDS.0, MAX_DEPTH_BOUNDS.1
        ));
    }
    if input.agents.keys().any(|key| key.trim().is_empty()) {
        return Err("an agent allow key must not be blank".to_string());
    }
    Ok(OrchestratorSettings {
        agents: input
            .agents
            .into_iter()
            .map(|(key, allowed)| (key.trim().to_string(), allowed))
            .collect(),
        ..input
    })
}

fn persist(path: &Path, settings: &OrchestratorSettings) -> Result<(), String> {
    let file = SettingsFile {
        schema_version: SCHEMA_VERSION,
        settings: settings.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&file)
        .map_err(|error| format!("settings could not be saved: {error}"))?;
    match atomic_file::replace_private(path, &bytes) {
        Ok(()) => log::info!("[orchestrator] settings saved"),
        // The rename landed and only the directory sync failed: the file
        // holds the new settings, so memory must too.
        Err(error) if std::fs::read(path).is_ok_and(|on_disk| on_disk == bytes) => {
            log::warn!("[orchestrator] settings saved, durability unconfirmed: {error}");
        }
        Err(error) => {
            log::warn!("[orchestrator] settings could not be saved: {error}");
            return Err(format!("settings could not be saved: {error}"));
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "settings_tests.rs"]
mod settings_tests;
