//! Host-recorded model per session (CAP-3).
//!
//! `SessionPersistence` is the sole writer of the model fields on
//! `SessionMetadata` / `SessionIndexEntry`. The model is captured at creation
//! (registration), refreshed on `session/load` / `session/resume`
//! ([`SessionPersistence::record_session_model`]) and derived from every
//! durable `config_options_update` record by `append_record`
//! ([`snapshot_from_record`]). Host-internal: no command, no route.

use agent_client_protocol::schema::v1::SessionConfigOption;

use super::*;
use crate::acp::events::{models_from_config_options, SessionModelState};

/// Snapshot of the *current* model of a resolved model state. The name falls
/// back to the id when the agent lists no matching entry or an empty name.
pub(crate) fn snapshot_from_model_state(state: &SessionModelState) -> SessionModelSnapshot {
    let model_name = state
        .available_models
        .iter()
        .find(|model| model.model_id == state.current_model_id)
        .map(|model| model.name.trim())
        .filter(|name| !name.is_empty())
        .map_or_else(|| state.current_model_id.clone(), str::to_string);
    SessionModelSnapshot {
        model_id: state.current_model_id.clone(),
        model_name,
    }
}

/// Derive the model from a durable `config_options_update` record. `None`
/// for any other record type, unparseable options, or no Model option — the
/// caller then keeps the previous value.
pub(crate) fn snapshot_from_record(record: &PersistedEventRecord) -> Option<SessionModelSnapshot> {
    if record.type_ != "config_options_update" {
        return None;
    }
    let options = record.payload.get("configOptions")?.clone();
    let options: Vec<SessionConfigOption> = serde_json::from_value(options).ok()?;
    let state = models_from_config_options(Some(&options))?;
    Some(snapshot_from_model_state(&state))
}

/// Apply `snapshot` to `metadata`; returns whether anything changed.
pub(super) fn apply_snapshot(
    metadata: &mut SessionMetadata,
    snapshot: SessionModelSnapshot,
) -> bool {
    if metadata.model_id.as_deref() == Some(snapshot.model_id.as_str())
        && metadata.model_name.as_deref() == Some(snapshot.model_name.as_str())
    {
        return false;
    }
    metadata.model_id = Some(snapshot.model_id);
    metadata.model_name = Some(snapshot.model_name);
    true
}

impl SessionPersistence {
    /// Record the model a reopened (`session/load` / `session/resume`) session
    /// reports. No-op when the outcome advertises no models, the session is
    /// unknown, or the value is unchanged. The catalog is updated in memory
    /// and flushed through the session writer (metadata.json + index) so the
    /// value survives a restart.
    pub async fn record_session_model(&self, session_id: &str, models: Option<&SessionModelState>) {
        let Some(state) = models else {
            log::debug!(
                "[acp-history] model record skipped (no models) session={}",
                crate::logging::redact_session_id(session_id)
            );
            return;
        };
        let Some(entry) = self.inner.catalog.lock().get(session_id).cloned() else {
            log::debug!(
                "[acp-history] model record skipped (unknown session) session={}",
                crate::logging::redact_session_id(session_id)
            );
            return;
        };
        let changed = apply_snapshot(&mut entry.lock(), snapshot_from_model_state(state));
        if !changed {
            log::debug!(
                "[acp-history] model record unchanged session={}",
                crate::logging::redact_session_id(session_id)
            );
            return;
        }
        log::debug!(
            "[acp-history] model recorded on reopen session={}",
            crate::logging::redact_session_id(session_id)
        );
        if let Err(error) = self.flush_session(session_id).await {
            log::warn!(
                "[acp-history] model flush failed session={}: {error}",
                crate::logging::redact_session_id(session_id)
            );
        }
    }
}
