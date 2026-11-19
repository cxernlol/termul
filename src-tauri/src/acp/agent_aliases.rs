//! Legacy ACP registry ids that name the same agent as a canonical id.
//!
//! `opencode-v2` was a separate opt-in while `opencode` was 1.x
//! (agentclientprotocol/registry#657). Both ids now ship the same OpenCode 2
//! binary. The registry keeps `opencode-v2` so old saved ids still resolve
//! (registry#764 names it "OpenCode (legacy ID)"). Troupe lists only `opencode`.
//!
//! Reuse, do not migrate. A saved config, chat, history session, or install
//! that still says `opencode-v2` resolves to OpenCode at read time. The files
//! on disk stay as they are. An `opencode` install wins when both installs
//! exist. When only `opencode-v2` is installed, that binary is the OpenCode
//! install.
//!
//! The map is `src/shared/acp-agent-aliases.json`. The renderer reads the same
//! file. Do not add a second id check beside this module.

use std::collections::HashMap;
use std::sync::LazyLock;

const ALIASES_JSON: &str = include_str!("../../../src/shared/acp-agent-aliases.json");

static ALIASES: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(ALIASES_JSON).expect("acp agent alias map is valid JSON")
});

/// The canonical registry id. Unknown ids return themselves.
pub(crate) fn canonical_agent_id(id: &str) -> &str {
    ALIASES.get(id).map(String::as_str).unwrap_or(id)
}

/// True when `id` is a legacy alias and must not be listed as its own agent.
pub(crate) fn is_legacy_agent_id(id: &str) -> bool {
    ALIASES.contains_key(id)
}

/// Legacy ids that resolve to `canonical`.
pub(crate) fn legacy_ids_for(canonical: &str) -> Vec<&str> {
    ALIASES
        .iter()
        .filter(|(_, mapped)| mapped == &canonical)
        .map(|(alias, _)| alias.as_str())
        .collect()
}

#[cfg(test)]
mod tests;
