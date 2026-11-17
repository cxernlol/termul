use std::collections::HashMap;

use agent_client_protocol::schema::v1::{McpServer, McpServerStdio};

use super::AgentLaunch;
use crate::acp::claude_agent::ClaudeLaunchAuth;
use crate::acp::config::{AgentConfig, AgentId, SessionId};
use crate::acp::AcpManager;

fn launch() -> AgentLaunch {
    AgentLaunch {
        config: AgentConfig {
            config_id: Some("acp-registry:claude-acp".to_string()),
            name: "Claude Agent".to_string(),
            command: "node".to_string(),
            args: Vec::new(),
            env: HashMap::new(),
            allow_terminal: false,
        },
        project_id: Some("proj-1".to_string()),
        claude: ClaudeLaunchAuth::Account("work".to_string()),
    }
}

fn server(name: &str) -> McpServer {
    McpServer::Stdio(McpServerStdio::new(name.to_string(), "/bin/true"))
}

fn recipe_servers(manager: &AcpManager, session: &str) -> Option<Vec<String>> {
    let recipe = manager.launch_recipe(&SessionId(session.to_string()))?;
    Some(
        recipe
            .mcp_servers
            .unwrap_or_default()
            .iter()
            .map(|server| match server {
                McpServer::Stdio(stdio) => stdio.name.clone(),
                _ => "other".to_string(),
            })
            .collect(),
    )
}

#[tokio::test]
async fn a_reopen_without_an_mcp_list_keeps_the_last_one() {
    let manager = AcpManager::new(vec![]);
    let agent = AgentId("agent-1".to_string());
    let _sent = manager.install_test_agent_with_resume(agent.clone(), ["s1".to_string()].into());
    manager.record_agent_launch(&agent, launch());

    let reopen = |servers: Option<Vec<McpServer>>| {
        manager.resume_session(
            &agent,
            SessionId("s1".to_string()),
            "/work".to_string(),
            Vec::new(),
            servers,
        )
    };
    reopen(Some(vec![server("docs")])).await.unwrap();
    reopen(None).await.unwrap();
    assert_eq!(recipe_servers(&manager, "s1"), Some(vec!["docs".to_string()]));

    reopen(Some(vec![server("search")])).await.unwrap();
    assert_eq!(
        recipe_servers(&manager, "s1"),
        Some(vec!["search".to_string()])
    );
}

#[tokio::test]
async fn closing_a_chat_forgets_its_recipe_but_closing_an_agent_it_left_does_not() {
    let manager = AcpManager::new(vec![]);
    let agent = AgentId("agent-1".to_string());
    manager.install_test_agent_with_closable_sessions(agent.clone(), vec!["s1".to_string()], true);
    manager.record_agent_launch(&agent, launch());
    manager.record_launch_recipe(&agent, "s1", "/work".to_string(), None, Vec::new());

    let left = AgentId("agent-it-left".to_string());
    let _ = manager
        .close_session(&left, SessionId("s1".to_string()))
        .await;
    assert_eq!(
        manager
            .launch_recipe(&SessionId("s1".to_string()))
            .map(|recipe| recipe.agent_id),
        Some(agent.clone())
    );

    manager
        .close_session(&agent, SessionId("s1".to_string()))
        .await
        .unwrap();
    assert!(manager
        .launch_recipe(&SessionId("s1".to_string()))
        .is_none());
}
