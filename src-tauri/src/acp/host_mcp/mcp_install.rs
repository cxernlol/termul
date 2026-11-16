//! `mcp_install`: the agent asks Troupe to install an MCP server. The user
//! approves in the chat card. Secret field values are collected there and
//! never returned to the agent, written to a log, or put on an event.

use std::collections::BTreeMap;
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::mcp_catalog::{
    CommitRequest, CommitResult, ConsentView, FormReply, FormRequest, McpCatalogError,
    McpCatalogReason, McpCatalogService, PlanCaller, PlanChoice, PlanReply, PlanRequest,
    PlanSource, ResolvedConfig, ResolvedSecret, Runner, RunnerAvailability, SecretSlot,
};
use crate::web::mcp_registry::STORE_KEY;
use crate::web::store::{unix_ms, WebStore};

/// What the agent must do before it calls the tool. The card, not the agent,
/// collects secrets.
pub const MCP_INSTALL_DESCRIPTION: &str = "Install an MCP server the user asked for. You resolve the link first. Troupe installs only a source it already accepts, and only after the user approves on a card in the chat.\n\nRead the page or the JSON with your own tools, then call this once:\n- Catalog: `{ \"source\": { \"kind\": \"catalog\", \"name\": \"io.github.org/server\", \"version\": \"1.2.3\" } }`. `name` and `version` are the official registry name and version (registry.modelcontextprotocol.io or the server's registry page). Optional `choice` is `{ \"kind\": \"remote\" | \"package\", \"index\": 0 }` when the page lists more than one install option. Omit `choice` for the default option.\n- Import: `{ \"source\": { \"kind\": \"import\", \"json\": \"<mcpServers JSON or one server object>\", \"server\": \"<key>\" } }`. `server` picks the entry when the JSON has more than one. The JSON is the launch config (command, args, url), not an API key.\n\nDo not put API keys, tokens, or other secrets in this call. The user types those on the approval card. They never come back to you.\n\nWait for the JSON result. `declined` means the user said no; do not install again unless they ask. `unsupported` carries the host reason; explain it. `already_exists` means that server is already installed; do not add another. `installed` carries `nextSteps`. Tell the user each one: OAuth sign-in, a missing runtime (npx, uvx, docker, or dotnet), and that a new chat is needed. This chat does not gain the new tools until a new chat starts. `attached` is always false for now.";

/// Arguments of the `mcp_install` tool. Only `catalog` and `import`.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpInstallToolInput {
    /// A catalog item or an `mcpServers` JSON blob. No secrets.
    pub source: McpInstallToolSource,
    /// Which catalog option to install. Omit for the item's default option.
    #[serde(default)]
    pub choice: Option<PlanChoice>,
}

/// The two sources the chat install accepts.
#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum McpInstallToolSource {
    Catalog {
        name: String,
        version: String,
    },
    Import {
        json: String,
        #[serde(default)]
        server: Option<String>,
    },
}

impl McpInstallToolInput {
    #[must_use]
    pub fn into_form_request(self) -> FormRequest {
        FormRequest {
            source: match self.source {
                McpInstallToolSource::Catalog { name, version } => {
                    PlanSource::Catalog { name, version }
                }
                McpInstallToolSource::Import { json, server } => {
                    PlanSource::Import { json, server }
                }
            },
            choice: self.choice,
        }
    }
}

/// What the user did on the card. Debug output counts the maps and never
/// prints their values.
pub enum McpInstallDecision {
    Decline,
    /// The turn ended or the agent cancelled the call.
    Cancelled,
    Preview {
        inputs: BTreeMap<String, String>,
    },
    Approve {
        inputs: BTreeMap<String, String>,
        secret_values: BTreeMap<String, String>,
        /// The plan id on the card the user approved.
        plan_id: String,
        /// The launch digest on that same card.
        launch_digest: String,
    },
}

/// Why an answer was not delivered to the parked install.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpInstallAnswerError {
    /// No install is waiting under this id.
    NotFound,
    /// This id was already answered or cancelled.
    AlreadyResolved,
    /// The answer names a different session from the parked install.
    SessionMismatch,
    /// The answer arrived before the same floor host tickets use.
    TooEarly,
}

impl std::fmt::Debug for McpInstallDecision {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Decline => f.write_str("Decline"),
            Self::Cancelled => f.write_str("Cancelled"),
            Self::Preview { inputs } => write!(f, "Preview {{ inputs: {} }}", inputs.len()),
            Self::Approve {
                inputs,
                secret_values,
                plan_id: _,
                launch_digest: _,
            } => write!(
                f,
                "Approve {{ inputs: {}, secrets: {} }}",
                inputs.len(),
                secret_values.len()
            ),
        }
    }
}

/// A server already in the host list. No env or header values.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ListedServer {
    pub id: String,
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub catalog_name: Option<String>,
}

/// Command and args, or a remote URL. Env and header values are not part of
/// the identity (the same rule as the settings install).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LaunchKey {
    Stdio { command: String, args: Vec<String> },
    Remote { transport: String, url: String },
}

impl LaunchKey {
    pub(crate) fn from_config(config: &ResolvedConfig) -> Self {
        match config {
            ResolvedConfig::Stdio { command, args, .. } => Self::Stdio {
                command: command.clone(),
                args: args.clone(),
            },
            ResolvedConfig::Http { url, .. } => Self::Remote {
                transport: "http".to_string(),
                url: url.clone(),
            },
            ResolvedConfig::Sse { url, .. } => Self::Remote {
                transport: "sse".to_string(),
                url: url.clone(),
            },
        }
    }

    fn matches(&self, listed: &ListedServer) -> bool {
        match self {
            Self::Stdio { command, args } => {
                listed.transport == "stdio"
                    && listed.command.as_deref() == Some(command.as_str())
                    && &listed.args == args
            }
            Self::Remote { transport, url } => {
                listed.transport == *transport && listed.url.as_deref() == Some(url.as_str())
            }
        }
    }
}

/// The catalog plus the host's one MCP server list.
pub struct HostMcpInstall {
    store: Arc<WebStore>,
    catalog: CatalogHandle,
    probe_timeout: Duration,
}

enum CatalogHandle {
    Shared,
    #[cfg(test)]
    Fixed(Arc<McpCatalogService>),
}

static LIVE: OnceLock<Arc<HostMcpInstall>> = OnceLock::new();

/// Install the process-wide installer. Desktop and troupe-server both call
/// this once the web store is open. A second call keeps the first store.
pub fn install_live(store: Arc<WebStore>) {
    let _ = LIVE.set(Arc::new(HostMcpInstall::live(store)));
}

pub(crate) fn live() -> Option<Arc<HostMcpInstall>> {
    LIVE.get().cloned()
}

impl HostMcpInstall {
    #[must_use]
    pub fn live(store: Arc<WebStore>) -> Self {
        Self {
            store,
            catalog: CatalogHandle::Shared,
            probe_timeout: Duration::from_secs(10),
        }
    }

    #[cfg(test)]
    pub(crate) fn for_tests(catalog: Arc<McpCatalogService>, store: Arc<WebStore>) -> Self {
        Self {
            store,
            catalog: CatalogHandle::Fixed(catalog),
            probe_timeout: Duration::from_millis(200),
        }
    }

    async fn catalog(&self) -> Arc<McpCatalogService> {
        match &self.catalog {
            CatalogHandle::Shared => McpCatalogService::shared().await,
            #[cfg(test)]
            CatalogHandle::Fixed(service) => Arc::clone(service),
        }
    }

    pub(crate) async fn describe(
        &self,
        request: &FormRequest,
    ) -> Result<FormReply, McpCatalogError> {
        self.catalog().await.describe_install(request).await
    }

    pub(crate) async fn plan(
        &self,
        request: &PlanRequest,
        caller: PlanCaller,
    ) -> Result<PlanReply, McpCatalogError> {
        self.catalog().await.plan_install(request, caller).await
    }

    pub(crate) async fn commit(
        &self,
        request: &CommitRequest,
        caller: &PlanCaller,
    ) -> Result<CommitResult, McpCatalogError> {
        self.catalog().await.commit_install(request, caller)
    }

    pub(crate) async fn cancel(&self, plan_id: &str, caller: &PlanCaller) {
        let _ = self.catalog().await.cancel_install(
            &crate::mcp_catalog::CancelRequest {
                plan_id: plan_id.to_string(),
            },
            caller,
        );
    }

    pub(crate) async fn runners(&self) -> RunnerAvailability {
        self.catalog().await.runner_availability().await
    }

    pub(crate) fn probe_timeout(&self) -> Duration {
        self.probe_timeout
    }

    pub(crate) fn list(&self) -> Result<Vec<ListedServer>, String> {
        let Some(value) = self
            .store
            .peek(STORE_KEY)
            .map_err(|_| "list unreadable".to_string())?
        else {
            return Ok(Vec::new());
        };
        Ok(registry_items(&value)
            .into_iter()
            .filter_map(listed_server)
            .collect())
    }

    /// Append `entry` to the host list under one store lock, so a second
    /// install or a settings save cannot drop this row. `entry` holds env
    /// and header values; this function does not log it.
    pub(crate) fn save(&self, entry: &Value) -> Result<(), String> {
        let entry = entry.clone();
        self.store
            .update_as_host(STORE_KEY, unix_ms(), |current| {
                let mut items = current.map(registry_items).unwrap_or_default();
                items.push(entry);
                json!({ "_version": 1u64, "data": items })
            })
            .map_err(|_| "list not saved".to_string())
    }
}

fn registry_items(value: &Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items.clone(),
        Value::Object(map) => match map.get("data") {
            Some(Value::Array(items)) => items.clone(),
            _ => Vec::new(),
        },
        _ => Vec::new(),
    }
}

fn listed_server(item: Value) -> Option<ListedServer> {
    let id = item.get("id")?.as_str()?.trim().to_string();
    let name = item.get("name")?.as_str()?.trim().to_string();
    if id.is_empty() || name.is_empty() {
        return None;
    }
    let transport = item
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("stdio")
        .to_string();
    let command = item
        .get("command")
        .and_then(Value::as_str)
        .map(str::to_string);
    let args = item
        .get("args")
        .and_then(Value::as_array)
        .map(|args| {
            args.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let url = item.get("url").and_then(Value::as_str).map(str::to_string);
    let catalog_name = item
        .get("catalog")
        .and_then(|catalog| catalog.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string);
    Some(ListedServer {
        id,
        name,
        transport,
        command,
        args,
        url,
        catalog_name,
    })
}

pub(crate) fn find_duplicate<'a>(
    listed: &'a [ListedServer],
    wire_name: Option<&str>,
    catalog_name: Option<&str>,
    launch: Option<&LaunchKey>,
) -> Option<&'a ListedServer> {
    listed.iter().find(|server| {
        wire_name.is_some_and(|name| server.name == name)
            || catalog_name.is_some_and(|name| server.catalog_name.as_deref() == Some(name))
            || launch.is_some_and(|launch| launch.matches(server))
    })
}

pub(crate) fn catalog_source_name(source: &PlanSource) -> Option<&str> {
    match source {
        PlanSource::Catalog { name, .. } => Some(name.as_str()),
        _ => None,
    }
}

/// Non-secret defaults. `missing` is true when a required non-secret has no
/// default, so the card must collect it before the command is known.
pub(crate) fn default_inputs(
    fields: &[crate::mcp_catalog::Field],
) -> (BTreeMap<String, String>, bool) {
    let mut inputs = BTreeMap::new();
    let mut missing = false;
    for field in fields {
        if field.is_secret {
            continue;
        }
        let value = match field.default.clone() {
            Some(value) => value,
            None if field.format == crate::mcp_catalog::FieldFormat::Boolean => "false".to_string(),
            None => String::new(),
        };
        if field.is_required && value.trim().is_empty() {
            missing = true;
        }
        inputs.insert(field.id.clone(), value);
    }
    (inputs, missing)
}

pub(crate) fn runner_of_command(command: &str) -> Option<Runner> {
    match command {
        "npx" => Some(Runner::Npx),
        "uvx" => Some(Runner::Uvx),
        "docker" => Some(Runner::Docker),
        "dotnet" => Some(Runner::Dotnet),
        _ => None,
    }
}

pub(crate) fn reason_code(reason: &McpCatalogReason) -> String {
    serde_json::to_value(reason)
        .ok()
        .and_then(|value| value.get("code")?.as_str().map(str::to_string))
        .unwrap_or_else(|| "unsupported".to_string())
}

/// The tool result. It never includes env values, header values, or the
/// `secrets` list from a commit.
pub(crate) struct ToolOutcome<'a> {
    pub outcome: &'a str,
    pub name: Option<&'a str>,
    pub server_id: Option<&'a str>,
    pub config: Option<&'a ResolvedConfig>,
    pub reason: Option<&'a McpCatalogReason>,
    pub attached: bool,
    pub new_session_needed: bool,
    pub next_steps: Vec<Value>,
}

pub(crate) fn tool_result(outcome: ToolOutcome<'_>) -> Value {
    let mut result = json!({
        "outcome": outcome.outcome,
        "attached": outcome.attached,
        "newSessionNeeded": outcome.new_session_needed,
        "nextSteps": outcome.next_steps,
    });
    if let Some(name) = outcome.name {
        result["name"] = json!(name);
    }
    if let Some(server_id) = outcome.server_id {
        result["serverId"] = json!(server_id);
    }
    if let Some(reason) = outcome.reason {
        result["reason"] = serde_json::to_value(reason).unwrap_or(Value::Null);
    }
    if let Some(config) = outcome.config {
        match config {
            ResolvedConfig::Stdio { command, args, .. } => {
                result["transport"] = json!("stdio");
                result["command"] = json!(command);
                result["args"] = json!(args);
            }
            ResolvedConfig::Http { url, .. } => {
                result["transport"] = json!("http");
                result["url"] = json!(url);
            }
            ResolvedConfig::Sse { url, .. } => {
                result["transport"] = json!("sse");
                result["url"] = json!(url);
            }
        }
    }
    result
}

pub(crate) fn step(kind: &str, runtime: Option<&str>, message: &str) -> Value {
    let mut step = json!({ "kind": kind, "message": message });
    if let Some(runtime) = runtime {
        step["runtime"] = json!(runtime);
    }
    step
}

pub(crate) fn runtime_message(runtime: &str, command: &str) -> String {
    format!("Install {runtime} so `{command}` is available, then try the server again.")
}

pub(crate) fn new_session_message() -> &'static str {
    "Start a new chat so this agent can use the new tools. This chat keeps the tools it started with."
}

pub(crate) fn oauth_message() -> &'static str {
    "Sign in to this server. Use the Sign in button on the card."
}

pub(crate) fn already_message(name: &str) -> String {
    format!(
        "This server is already installed as \"{name}\". It was not added again. Start a new chat if this one does not show its tools."
    )
}

pub(crate) fn declined_message() -> &'static str {
    "The user declined the install. Nothing was saved."
}

/// The stored entry. Env and header values come from `secrets` and stay in
/// the list, the same place a Settings install puts them.
pub(crate) fn stored_entry(id: &str, result: &CommitResult) -> Result<Value, ()> {
    let mut entry = serde_json::Map::new();
    entry.insert("id".to_string(), json!(id));
    entry.insert("name".to_string(), json!(result.name));
    entry.insert("enabled".to_string(), json!(true));
    match &result.config {
        ResolvedConfig::Stdio { command, args, env } => {
            entry.insert("type".to_string(), json!("stdio"));
            entry.insert("command".to_string(), json!(command));
            entry.insert("args".to_string(), json!(args));
            entry.insert(
                "env".to_string(),
                json!(pairs(env, SecretSlot::Env, &result.secrets)?),
            );
        }
        ResolvedConfig::Http { url, headers } => {
            entry.insert("type".to_string(), json!("http"));
            entry.insert("url".to_string(), json!(url));
            entry.insert(
                "headers".to_string(),
                json!(pairs(headers, SecretSlot::Header, &result.secrets)?),
            );
        }
        ResolvedConfig::Sse { url, headers } => {
            entry.insert("type".to_string(), json!("sse"));
            entry.insert("url".to_string(), json!(url));
            entry.insert(
                "headers".to_string(),
                json!(pairs(headers, SecretSlot::Header, &result.secrets)?),
            );
        }
    }
    if let Some(provenance) = &result.provenance {
        entry.insert(
            "catalog".to_string(),
            json!({
                "source": "mcp-registry",
                "name": provenance.name,
                "version": provenance.version,
                "kind": provenance.kind,
                "index": provenance.index,
                "repositoryId": provenance.repository_id,
                "launchDigest": result.launch_digest,
            }),
        );
    }
    Ok(Value::Object(entry))
}

fn pairs(
    slots: &[crate::mcp_catalog::ValueSlot],
    slot: SecretSlot,
    secrets: &[ResolvedSecret],
) -> Result<Vec<Value>, ()> {
    slots
        .iter()
        .map(|item| {
            let value = secrets
                .iter()
                .find(|secret| secret.slot == slot && secret.name == item.name)
                .map(|secret| secret.value.clone())
                .ok_or(())?;
            Ok(json!({ "name": item.name, "value": value }))
        })
        .collect()
}

/// A probe config. Callers must not log it: `env` and `headers` hold values.
pub(crate) fn probe_config(
    name: &str,
    result: &CommitResult,
) -> Option<crate::acp::mcp_probe::McpServerConfig> {
    let entry = stored_entry("probe", result).ok()?;
    let mut config: crate::acp::mcp_probe::McpServerConfig = serde_json::from_value(entry).ok()?;
    config.name = name.to_string();
    Some(config)
}

/// Transport string for logs. No values.
pub(crate) fn transport_label(config: &ResolvedConfig) -> &'static str {
    match config {
        ResolvedConfig::Stdio { .. } => "stdio",
        ResolvedConfig::Http { .. } => "http",
        ResolvedConfig::Sse { .. } => "sse",
    }
}

/// The consent view is safe to show: secret fields stay as placeholders.
pub(crate) fn consent_transport(consent: &ConsentView) -> String {
    consent.transport.to_string()
}
