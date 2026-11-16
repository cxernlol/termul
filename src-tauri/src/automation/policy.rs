//! The run policy the approval card renders, derived from an automation.

use std::collections::BTreeSet;

use chrono::{TimeZone, Utc};

use super::graph;
use super::mcp::{agent_servers, find_server, McpServerEntry};
use super::model::{
    AgentMcpServer, AgentPolicy, AgentTool, Automation, McpToolPolicy, NodeHosts, NodeSecrets,
    NodeSpec, RunPolicy, Schedule, Trigger,
};
use super::schedule::{next_runs, BACKOFF_LADDER_MS};

const PREVIEW_RUNS: usize = 3;

/// `servers` are the project's enabled MCP servers.
pub fn run_policy(automation: &Automation, now_ms: i64, servers: &[McpServerEntry]) -> RunPolicy {
    let graph = &automation.graph;
    let mut agents = Vec::new();
    let mut secrets = Vec::new();
    let mut outbound_hosts = Vec::new();
    let mut mcp_tools = Vec::new();
    for node in &graph.nodes {
        match &node.spec {
            NodeSpec::Agent {
                agent_id,
                model,
                timeout_ms,
                tools,
                mcp_servers,
                ..
            } => agents.push(AgentPolicy {
                node_id: node.id.clone(),
                agent_id: agent_id.clone(),
                model: model.clone(),
                timeout_ms: *timeout_ms,
                tools: tools
                    .iter()
                    .copied()
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect(),
                mcp_servers: if tools.contains(&AgentTool::Other) {
                    agent_mcp_servers(mcp_servers.as_deref(), servers)
                } else {
                    Vec::new()
                },
            }),
            NodeSpec::Http { allowed_hosts, .. } => {
                let names = graph::secret_names(&node.spec);
                if !names.is_empty() {
                    secrets.push(NodeSecrets {
                        node_id: node.id.clone(),
                        names,
                    });
                }
                outbound_hosts.push(NodeHosts {
                    node_id: node.id.clone(),
                    hosts: allowed_hosts.clone(),
                });
            }
            NodeSpec::McpTool {
                server_id, tool, ..
            } => mcp_tools.push(McpToolPolicy {
                node_id: node.id.clone(),
                server_id: server_id.clone(),
                server_name: find_server(servers, server_id).map(|s| s.name.clone()),
                tool: tool.clone(),
            }),
            NodeSpec::Transform { .. }
            | NodeSpec::Condition { .. }
            | NodeSpec::Fail { .. }
            | NodeSpec::ForEach { .. }
            | NodeSpec::Merge { .. }
            | NodeSpec::Wait { .. }
            | NodeSpec::Approval { .. } => {}
        }
    }
    RunPolicy {
        trigger_summary: trigger_summary(&automation.trigger),
        next_runs: automation
            .schedule()
            .and_then(|s| next_runs(s, now_ms, PREVIEW_RUNS).ok())
            .unwrap_or_default(),
        agents,
        secrets,
        outbound_hosts,
        mcp_tools,
        untrusted_flow: graph::untrusted_flow(graph),
        failure_policy: failure_policy(),
    }
}

/// The servers an agent node's session gets: those of its scope with a
/// usable launch config, as `engine::agent` passes them.
fn agent_mcp_servers(scope: Option<&[String]>, servers: &[McpServerEntry]) -> Vec<AgentMcpServer> {
    agent_servers(scope, servers)
        .into_iter()
        .filter(|server| server.acp_server().is_some())
        .map(|server| AgentMcpServer {
            server_id: server.server_id.clone(),
            name: server.name.clone(),
        })
        .collect()
}

fn trigger_summary(trigger: &Trigger) -> String {
    match trigger {
        Trigger::Manual => "manual only".to_string(),
        Trigger::Schedule {
            schedule: Schedule::Cron { expr, timezone },
        } => format!("cron \"{expr}\" in {timezone}"),
        Trigger::Schedule {
            schedule:
                Schedule::Every {
                    every_ms,
                    anchor_ms,
                },
        } => format!("every {} from {}", duration(*every_ms), instant(*anchor_ms)),
        Trigger::Schedule {
            schedule: Schedule::At { at },
        } => format!("once at {}", instant(*at)),
    }
}

fn failure_policy() -> String {
    let rungs: Vec<String> = BACKOFF_LADDER_MS
        .iter()
        .map(|ms| match ms % 60_000 {
            0 => format!("{}m", ms / 60_000),
            _ => format!("{}s", ms / 1_000),
        })
        .collect();
    format!("backoff {}", rungs.join("/"))
}

fn duration(ms: u64) -> String {
    const UNITS: [(u64, &str); 5] = [
        (86_400_000, "d"),
        (3_600_000, "h"),
        (60_000, "m"),
        (1_000, "s"),
        (1, "ms"),
    ];
    UNITS
        .iter()
        .find(|(size, _)| ms >= *size && ms.is_multiple_of(*size))
        .map(|(size, unit)| format!("{}{unit}", ms / size))
        .unwrap_or_else(|| format!("{ms}ms"))
}

fn instant(ms: i64) -> String {
    Utc.timestamp_millis_opt(ms)
        .single()
        .map(|t| t.format("%Y-%m-%dT%H:%MZ").to_string())
        .unwrap_or_else(|| ms.to_string())
}
