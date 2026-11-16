//! The MCP servers as `mcp_tool` nodes and agent nodes that list `other` see
//! them: the host's one list in its web store (see `web::mcp_registry`), the
//! same for every project, with the ids the one-time import dropped as
//! aliases of the server it kept.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use agent_client_protocol::schema::v1::{
    EnvVariable, HttpHeader, McpServer, McpServerHttp, McpServerSse, McpServerStdio,
};
use serde::Deserialize;
use serde_json::Value;

use super::McpServerConfig;
use crate::web::mcp_registry::{ALIASES_KEY, STORE_KEY};
use crate::web::store::WebStore;

/// The enabled MCP servers of a project id.
pub type ProjectMcpServers = Arc<dyn Fn(&str) -> Vec<McpServerEntry> + Send + Sync>;

/// An enabled server. `server_id` is the stored entry's host-assigned `id`;
/// `aliases` are other ids an `mcp_tool` node may name it by (see
/// [`find_server`]).
#[derive(Debug, Clone, PartialEq)]
pub struct McpServerEntry {
    pub server_id: String,
    pub name: String,
    pub config: McpServerConfig,
    pub aliases: Vec<String>,
}

impl McpServerEntry {
    /// The server as an agent's `session/new` takes it, the same shape a chat
    /// session gets. `None` for a stdio entry without a command, an http or
    /// sse entry without a url, or an unknown transport.
    pub fn acp_server(&self) -> Option<McpServer> {
        let config = &self.config;
        let headers = || {
            config
                .headers
                .iter()
                .map(|h| HttpHeader::new(&h.name, &h.value))
                .collect()
        };
        match config.r#type.as_deref() {
            None | Some("stdio") => Some(McpServer::Stdio(
                McpServerStdio::new(&self.name, config.command.as_deref()?)
                    .args(config.args.clone())
                    .env(
                        config
                            .env
                            .iter()
                            .map(|e| EnvVariable::new(&e.name, &e.value))
                            .collect(),
                    ),
            )),
            Some("http") => Some(McpServer::Http(
                McpServerHttp::new(&self.name, config.url.as_deref()?).headers(headers()),
            )),
            Some("sse") => Some(McpServer::Sse(
                McpServerSse::new(&self.name, config.url.as_deref()?).headers(headers()),
            )),
            Some(_) => None,
        }
    }
}

/// The server a node's `server_id` names: the entry with that id, else the
/// entry that holds it as an alias.
pub fn find_server<'a>(servers: &'a [McpServerEntry], id: &str) -> Option<&'a McpServerEntry> {
    servers
        .iter()
        .find(|s| s.server_id == id)
        .or_else(|| servers.iter().find(|s| s.aliases.iter().any(|a| a == id)))
}

/// The servers an agent node that lists `other` starts with: every one when
/// `scope` is `None`, else the ones its ids name (aliases included) in the
/// scope's order, each once. An id that names no server is dropped.
pub fn agent_servers<'a>(
    scope: Option<&[String]>,
    servers: &'a [McpServerEntry],
) -> Vec<&'a McpServerEntry> {
    let Some(ids) = scope else {
        return servers.iter().collect();
    };
    let mut picked: Vec<&McpServerEntry> = Vec::new();
    for server in ids.iter().filter_map(|id| find_server(servers, id)) {
        if !picked.iter().any(|p| p.server_id == server.server_id) {
            picked.push(server);
        }
    }
    picked
}

#[derive(Deserialize)]
struct StoredEntry {
    id: String,
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(flatten)]
    config: McpServerConfig,
}

/// The enabled, well-formed entries of a stored list, bare or in the
/// renderer's `{ _version, data }` envelope. The first entry wins a
/// duplicate id.
pub fn parse_registry(value: &Value) -> Vec<McpServerEntry> {
    let Some(items) = registry_items(value) else {
        log::warn!(
            "[Automation] the stored MCP registry is not a list; no MCP servers are available"
        );
        return Vec::new();
    };
    let mut entries: Vec<McpServerEntry> = Vec::new();
    let mut malformed = 0;
    for item in items {
        let Ok(stored) = StoredEntry::deserialize(item) else {
            malformed += 1;
            continue;
        };
        let (id, name) = (stored.id.trim(), stored.config.name.trim());
        if id.is_empty() || name.is_empty() {
            malformed += 1;
            continue;
        }
        if stored.enabled == Some(false) || entries.iter().any(|e| e.server_id == id) {
            continue;
        }
        entries.push(McpServerEntry {
            server_id: id.to_string(),
            name: name.to_string(),
            config: stored.config,
            aliases: Vec::new(),
        });
    }
    if malformed > 0 {
        log::debug!("[Automation] skipped {malformed} malformed MCP registry entries");
    }
    entries
}

/// The stored list, bare or in the `{ _version, data }` envelope; `None`
/// when `value` has neither shape.
fn registry_items(value: &Value) -> Option<&Vec<Value>> {
    match value {
        Value::Array(items) => Some(items),
        Value::Object(map) => match map.get("data") {
            Some(Value::Array(items)) => Some(items),
            _ => None,
        },
        _ => None,
    }
}

/// Gives each entry the ids that `aliases` (`{ droppedId: keptId }`, bare or
/// in the `{ _version, data }` envelope) maps to its id. An alias of an id
/// that is not in `entries` (a deleted or disabled server) is not attached,
/// and neither is one that an item of the stored `list` has as its id,
/// enabled or not: that id names its own entry, or nothing while disabled.
pub fn attach_aliases(entries: &mut [McpServerEntry], list: &Value, aliases: &Value) {
    let map = match aliases {
        Value::Object(map) => match map.get("data") {
            Some(Value::Object(data)) => data,
            _ => map,
        },
        _ => {
            log::warn!(
                "[Automation] the stored MCP server aliases are not an object; ignoring them"
            );
            return;
        }
    };
    let stored_ids: HashSet<&str> = registry_items(list)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("id")?.as_str())
        .map(str::trim)
        .collect();
    let index: HashMap<String, usize> = entries
        .iter()
        .enumerate()
        .map(|(i, e)| (e.server_id.clone(), i))
        .collect();
    for (alias, kept) in map {
        let Some(kept) = kept.as_str() else { continue };
        if stored_ids.contains(alias.as_str()) {
            continue;
        }
        if let Some(&i) = index.get(kept) {
            entries[i].aliases.push(alias.clone());
        }
    }
}

/// The host's one MCP server list, for every project, with its aliases. A
/// store with no list yet, a value without list shape, or a store that
/// cannot be read yields no servers; unreadable aliases yield none.
pub fn store_servers(store: Arc<WebStore>) -> ProjectMcpServers {
    Arc::new(move |_project_id| {
        let (list, mut entries) = match store.peek(STORE_KEY) {
            Ok(Some(value)) => {
                let entries = parse_registry(&value);
                (value, entries)
            }
            Ok(None) => return Vec::new(),
            Err(error) => {
                log::warn!("[Automation] MCP servers unreadable from the store: {error}");
                return Vec::new();
            }
        };
        match store.peek(ALIASES_KEY) {
            Ok(Some(aliases)) => attach_aliases(&mut entries, &list, &aliases),
            Ok(None) => {}
            Err(error) => {
                log::warn!("[Automation] MCP server aliases unreadable from the store: {error}");
            }
        }
        entries
    })
}
