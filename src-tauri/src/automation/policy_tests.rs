use serde_json::json;

use super::mcp::test_support::server;
use super::model::{
    AgentMcpServer, AgentPolicy, AgentTool, McpToolPolicy, NodeHosts, NodeSecrets, RunPolicy,
};
use super::policy::run_policy;
use super::test_support::{apply, node_id, sample_automation};

#[test]
fn derives_the_approval_card_for_the_sample() {
    // 2026-03-06T12:00Z, a Friday; next weekday 05:00 New York slots follow DST.
    let policy = run_policy(&sample_automation(), 1_772_798_400_000, &[]);
    assert_eq!(
        policy,
        RunPolicy {
            trigger_summary: "cron \"0 5 * * 1-5\" in America/New_York".into(),
            next_runs: vec![1_773_046_800_000, 1_773_133_200_000, 1_773_219_600_000],
            agents: vec![AgentPolicy {
                node_id: node_id("extract"),
                agent_id: "claude".into(),
                model: Some("sonnet".into()),
                timeout_ms: 120_000,
                tools: vec![AgentTool::Read, AgentTool::Search],
                mcp_servers: vec![],
            }],
            secrets: vec![
                NodeSecrets {
                    node_id: node_id("fetch"),
                    names: vec!["API_KEY".into()],
                },
                NodeSecrets {
                    node_id: node_id("post"),
                    names: vec!["HOOK_KEY".into()],
                },
            ],
            outbound_hosts: vec![
                NodeHosts {
                    node_id: node_id("fetch"),
                    hosts: vec!["api.example.com".into()],
                },
                NodeHosts {
                    node_id: node_id("post"),
                    hosts: vec!["hooks.example.com".into()],
                },
            ],
            mcp_tools: vec![],
            untrusted_flow: true,
            failure_policy: "backoff 30s/1m/5m/15m/60m".into(),
        }
    );
}

#[test]
fn summarizes_manual_every_and_at_triggers() {
    let base = sample_automation();
    let summary = |trigger: serde_json::Value| {
        let a = apply(&base, json!([{ "op": "set_trigger", "trigger": trigger }]));
        let p = run_policy(&a, 0, &[]);
        (p.trigger_summary, p.next_runs)
    };
    assert_eq!(
        summary(json!({ "kind": "manual" })),
        ("manual only".into(), vec![])
    );
    assert_eq!(
        summary(
            json!({ "kind": "schedule", "schedule": { "kind": "every", "every_ms": 900000, "anchor_ms": 0 } })
        ),
        (
            "every 15m from 1970-01-01T00:00Z".into(),
            vec![900_000, 1_800_000, 2_700_000]
        )
    );
    assert_eq!(
        summary(
            json!({ "kind": "schedule", "schedule": { "kind": "at", "at": 1_772_798_400_000_i64 } })
        ),
        ("once at 2026-03-06T12:00Z".into(), vec![1_772_798_400_000])
    );
}

#[test]
fn lists_each_mcp_tool_node_with_its_server_name_when_the_server_is_known() {
    let a = apply(
        &sample_automation(),
        json!([
            { "op": "add_node", "node": { "id": "issues", "label": "Issues", "spec": {
                "kind": "mcp_tool", "server_id": "srv-gh", "tool": "list_issues" } } },
            { "op": "add_node", "node": { "id": "gone", "label": "Gone", "spec": {
                "kind": "mcp_tool", "server_id": "srv-old", "tool": "ping" } } }
        ]),
    );
    assert_eq!(
        run_policy(&a, 0, &[server("srv-gh", "GitHub")]).mcp_tools,
        vec![
            McpToolPolicy {
                node_id: node_id("issues"),
                server_id: "srv-gh".into(),
                server_name: Some("GitHub".into()),
                tool: "list_issues".into(),
            },
            McpToolPolicy {
                node_id: node_id("gone"),
                server_id: "srv-old".into(),
                server_name: None,
                tool: "ping".into(),
            },
        ]
    );
}

#[test]
fn an_agent_that_lists_other_reaches_every_launchable_mcp_server_in_settings_order() {
    let a = apply(
        &sample_automation(),
        json!([
            { "op": "add_node", "node": { "id": "triage", "label": "Triage", "spec": {
                "kind": "agent", "agent_id": "claude", "prompt": "Triage",
                "output_schema": { "type": "object" }, "timeout_ms": 60000,
                "max_attempts": 1, "tools": ["other"] } } }
        ]),
    );
    let mut no_command = server("srv-broken", "Broken");
    no_command.config.command = None;
    let servers = [
        server("srv-tebar", "Tebar"),
        no_command,
        server("srv-gh", "GitHub"),
    ];
    let reach: Vec<(String, Vec<AgentMcpServer>)> = run_policy(&a, 0, &servers)
        .agents
        .into_iter()
        .map(|agent| (agent.node_id.to_string(), agent.mcp_servers))
        .collect();
    assert_eq!(
        reach,
        vec![
            ("extract".to_string(), vec![]),
            (
                "triage".to_string(),
                vec![
                    AgentMcpServer {
                        server_id: "srv-tebar".into(),
                        name: "Tebar".into(),
                    },
                    AgentMcpServer {
                        server_id: "srv-gh".into(),
                        name: "GitHub".into(),
                    },
                ]
            ),
        ]
    );
}

#[test]
fn an_agent_scoped_to_mcp_servers_reaches_only_those_in_scope_order() {
    let agent = |id: &str, scope: serde_json::Value| {
        json!({ "op": "add_node", "node": { "id": id, "label": id, "spec": {
            "kind": "agent", "agent_id": "claude", "prompt": "Triage",
            "output_schema": { "type": "object" }, "timeout_ms": 60000,
            "max_attempts": 1, "tools": ["other"], "mcp_servers": scope } } })
    };
    let a = apply(
        &sample_automation(),
        json!([
            agent("scoped", json!(["srv-gh", "srv-old", "srv-gone"])),
            agent("none", json!([]))
        ]),
    );
    let mut tebar = server("srv-tebar", "Tebar");
    tebar.aliases = vec!["srv-old".into()];
    let servers = [tebar, server("srv-gh", "GitHub")];
    let reach: Vec<(String, Vec<String>)> = run_policy(&a, 0, &servers)
        .agents
        .into_iter()
        .map(|agent| {
            let names = agent.mcp_servers.into_iter().map(|s| s.name).collect();
            (agent.node_id.to_string(), names)
        })
        .collect();
    assert_eq!(
        reach,
        vec![
            ("extract".to_string(), vec![]),
            (
                "scoped".to_string(),
                vec!["GitHub".to_string(), "Tebar".to_string()]
            ),
            ("none".to_string(), vec![]),
        ]
    );
}
