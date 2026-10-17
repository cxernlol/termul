use super::*;

fn set_env(port: &str, token: &str, session: &str, agent: &str) {
    std::env::set_var(ENV_PORT, port);
    std::env::set_var(ENV_TOKEN, token);
    std::env::set_var(ENV_SESSION_ID, session);
    std::env::set_var(ENV_AGENT_ID, agent);
}

fn clear_env() {
    std::env::remove_var(ENV_PORT);
    std::env::remove_var(ENV_TOKEN);
    std::env::remove_var(ENV_SESSION_ID);
    std::env::remove_var(ENV_AGENT_ID);
}

// `parse_env` reads `std::env` — these tests are not parallel-safe, so
// serialize them with a shared lock.
static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[test]
fn parse_env_rejects_missing_port() {
    let _g = ENV_LOCK.lock().unwrap();
    clear_env();
    std::env::set_var(ENV_TOKEN, "tok");
    std::env::set_var(ENV_SESSION_ID, "sess");
    let err = parse_env().expect_err("missing PORT must error");
    assert!(err.contains(ENV_PORT));
    clear_env();
}

#[test]
fn parse_env_rejects_missing_token() {
    let _g = ENV_LOCK.lock().unwrap();
    clear_env();
    std::env::set_var(ENV_PORT, "1234");
    std::env::set_var(ENV_SESSION_ID, "sess");
    let err = parse_env().expect_err("missing TOKEN must error");
    assert!(err.contains(ENV_TOKEN));
    clear_env();
}

#[test]
fn parse_env_rejects_missing_session_id() {
    let _g = ENV_LOCK.lock().unwrap();
    clear_env();
    std::env::set_var(ENV_PORT, "1234");
    std::env::set_var(ENV_TOKEN, "tok");
    let err = parse_env().expect_err("missing SESSION_ID must error");
    assert!(err.contains(ENV_SESSION_ID));
    clear_env();
}

#[test]
fn parse_env_rejects_blank_token() {
    let _g = ENV_LOCK.lock().unwrap();
    clear_env();
    set_env("1234", "   ", "sess", "agent");
    let err = parse_env().expect_err("blank TOKEN must error");
    assert!(err.contains(ENV_TOKEN));
    clear_env();
}

#[test]
fn parse_env_rejects_non_numeric_port() {
    let _g = ENV_LOCK.lock().unwrap();
    clear_env();
    set_env("not-a-port", "tok", "sess", "agent");
    let err = parse_env().expect_err("non-numeric PORT must error");
    assert!(err.contains(ENV_PORT));
    clear_env();
}

#[test]
fn parse_env_accepts_valid_config() {
    let _g = ENV_LOCK.lock().unwrap();
    clear_env();
    set_env("4242", "tok-abc", "sess-xyz", "agent-1");
    let cfg = parse_env().expect("valid env must parse");
    assert_eq!(cfg.port, 4242);
    assert_eq!(cfg.token, "tok-abc");
    assert_eq!(cfg.session_id, "sess-xyz");
    assert_eq!(cfg.agent_id, "agent-1");
    clear_env();
}

#[test]
fn parse_env_agent_id_is_optional() {
    let _g = ENV_LOCK.lock().unwrap();
    clear_env();
    set_env("4242", "tok", "sess", "");
    std::env::remove_var(ENV_AGENT_ID);
    let cfg = parse_env().expect("AGENT_ID is optional");
    assert_eq!(cfg.agent_id, "");
    clear_env();
}

fn handshake_config() -> ChildConfig {
    ChildConfig {
        port: 9,
        token: "tok".to_string(),
        session_id: "sess".to_string(),
        agent_id: "agent".to_string(),
    }
}

async fn read_json_id(
    reader: &mut (impl tokio::io::AsyncBufRead + Unpin),
    id: i64,
) -> serde_json::Value {
    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line).await.expect("read response");
        assert!(n > 0, "eof before response id {id}");
        let value: serde_json::Value =
            serde_json::from_str(line.trim()).unwrap_or_else(|e| panic!("bad json {line}: {e}"));
        if value.get("id").and_then(|v| v.as_i64()) == Some(id) {
            return value;
        }
    }
}

#[tokio::test]
async fn server_discover_without_meta_lists_tools() {
    let (server_io, client_io) = tokio::io::duplex(64 * 1024);
    let (server_read, server_write) = tokio::io::split(server_io);
    let (client_read, mut client_write) = tokio::io::split(client_io);
    let serve = tokio::spawn(async move {
        serve_mcp_transport(handshake_config(), server_read, server_write).await
    });

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), async move {
        client_write
            .write_all(br#"{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{}}"#)
            .await
            .unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let mut reader = BufReader::new(client_read);
        let discover = read_json_id(&mut reader, 1).await;
        assert!(
            discover.get("error").is_none(),
            "discover failed: {discover}"
        );
        assert!(discover.get("result").is_some(), "{discover}");
        // `server/discover` resolves through the same `get_info` as
        // `initialize` — pin the instructions delivery on this path too.
        assert_eq!(
            discover["result"]["instructions"].as_str(),
            Some(crate::acp::host_mcp::TERMUL_CHAT_INSTRUCTIONS),
            "discover result must carry the chat-output instructions verbatim"
        );

        client_write
            .write_all(br#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#)
            .await
            .unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let tools = read_json_id(&mut reader, 2).await;
        assert!(tools.get("error").is_none(), "tools/list failed: {tools}");
        let names = tools["result"]["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect::<Vec<_>>();
        assert!(names.contains(&"plan"), "{names:?}");
        drop(client_write);
        drop(reader);
        serve.await.expect("serve task").expect("serve ok");
    })
    .await;
    result.expect("handshake timed out");
}

#[tokio::test]
async fn legacy_initialize_still_lists_tools() {
    let (server_io, client_io) = tokio::io::duplex(64 * 1024);
    let (server_read, server_write) = tokio::io::split(server_io);
    let (client_read, mut client_write) = tokio::io::split(client_io);
    let serve = tokio::spawn(async move {
        serve_mcp_transport(handshake_config(), server_read, server_write).await
    });

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), async move {
        let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test-client","version":"0.0.1"}}}"#;
        client_write.write_all(init.as_bytes()).await.unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let mut reader = BufReader::new(client_read);
        let init_reply = read_json_id(&mut reader, 1).await;
        assert!(
            init_reply.get("error").is_none(),
            "initialize failed: {init_reply}"
        );
        client_write
            .write_all(br#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#)
            .await
            .unwrap();
        client_write.write_all(b"\n").await.unwrap();
        client_write
            .write_all(br#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#)
            .await
            .unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let tools = read_json_id(&mut reader, 2).await;
        assert!(tools.get("error").is_none(), "tools/list failed: {tools}");
        let names = tools["result"]["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect::<Vec<_>>();
        assert!(names.contains(&"plan"), "{names:?}");
        drop(client_write);
        drop(reader);
        serve.await.expect("serve task").expect("serve ok");
    })
    .await;
    result.expect("legacy handshake timed out");
}

/// The `initialize` result must carry `instructions` advertising the chat
/// renderer's markdown affordances — this is the only channel that tells
/// agents images embed inline and file links open in Termul's editor.
#[tokio::test]
async fn initialize_advertises_termul_chat_instructions() {
    let (server_io, client_io) = tokio::io::duplex(64 * 1024);
    let (server_read, server_write) = tokio::io::split(server_io);
    let (client_read, mut client_write) = tokio::io::split(client_io);
    let serve = tokio::spawn(async move {
        serve_mcp_transport(handshake_config(), server_read, server_write).await
    });

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), async move {
        let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test-client","version":"0.0.1"}}}"#;
        client_write.write_all(init.as_bytes()).await.unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let mut reader = BufReader::new(client_read);
        let init_reply = read_json_id(&mut reader, 1).await;
        assert!(
            init_reply.get("error").is_none(),
            "initialize failed: {init_reply}"
        );
        assert_eq!(
            init_reply["result"]["instructions"].as_str(),
            Some(crate::acp::host_mcp::TERMUL_CHAT_INSTRUCTIONS),
            "initialize result must carry the chat-output instructions verbatim"
        );
        drop(client_write);
        drop(reader);
        serve.await.expect("serve task").expect("serve ok");
    })
    .await;
    result.expect("instructions handshake timed out");
}

/// Story 16 (CAP-5): `set_session_title` advertises an OPTIONAL `branch` slug
/// (never in `required`) and its description asks for a kebab-case slug.
#[tokio::test]
async fn set_session_title_schema_lists_optional_branch() {
    let (server_io, client_io) = tokio::io::duplex(64 * 1024);
    let (server_read, server_write) = tokio::io::split(server_io);
    let (client_read, mut client_write) = tokio::io::split(client_io);
    let serve = tokio::spawn(async move {
        serve_mcp_transport(handshake_config(), server_read, server_write).await
    });

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), async move {
        client_write
            .write_all(br#"{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{}}"#)
            .await
            .unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let mut reader = BufReader::new(client_read);
        let _ = read_json_id(&mut reader, 1).await;
        client_write
            .write_all(br#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#)
            .await
            .unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let tools = read_json_id(&mut reader, 2).await;
        let title_tool = tools["result"]["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .find(|tool| tool["name"].as_str() == Some("set_session_title"))
            .cloned()
            .expect("set_session_title tool");
        let schema = &title_tool["inputSchema"];
        assert!(schema["properties"].get("branch").is_some(), "{schema}");
        let required: Vec<&str> = schema["required"]
            .as_array()
            .map(|items| items.iter().filter_map(|item| item.as_str()).collect())
            .unwrap_or_default();
        assert!(required.contains(&"title"), "{required:?}");
        assert!(!required.contains(&"branch"), "{required:?}");
        let description = title_tool["description"].as_str().unwrap_or_default();
        assert!(description.contains("kebab-case"), "{description}");
        drop(client_write);
        drop(reader);
        serve.await.expect("serve task").expect("serve ok");
    })
    .await;
    result.expect("tools/list timed out");
}

#[tokio::test]
async fn ask_user_schema_lists_question_options_and_free_text() {
    let (server_io, client_io) = tokio::io::duplex(64 * 1024);
    let (server_read, server_write) = tokio::io::split(server_io);
    let (client_read, mut client_write) = tokio::io::split(client_io);
    let serve = tokio::spawn(async move {
        serve_mcp_transport(handshake_config(), server_read, server_write).await
    });

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), async move {
        client_write
            .write_all(br#"{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{}}"#)
            .await
            .unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let mut reader = BufReader::new(client_read);
        let _ = read_json_id(&mut reader, 1).await;
        client_write
            .write_all(br#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#)
            .await
            .unwrap();
        client_write.write_all(b"\n").await.unwrap();
        let tools = read_json_id(&mut reader, 2).await;
        let ask_tool = tools["result"]["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .find(|tool| tool["name"].as_str() == Some("ask_user"))
            .cloned()
            .expect("ask_user tool");
        let schema = &ask_tool["inputSchema"];
        for field in [
            "question",
            "options",
            "multi_select",
            "allow_free_text",
            "header",
        ] {
            assert!(schema["properties"].get(field).is_some(), "{field} missing: {schema}");
        }
        let required: Vec<&str> = schema["required"]
            .as_array()
            .map(|items| items.iter().filter_map(|item| item.as_str()).collect())
            .unwrap_or_default();
        assert!(required.contains(&"question"), "{required:?}");
        assert!(!required.contains(&"allow_free_text"), "{required:?}");
        let description = ask_tool["description"].as_str().unwrap_or_default();
        assert!(description.contains("INSTEAD of asking"), "{description}");
        drop(client_write);
        drop(reader);
        serve.await.expect("serve task").expect("serve ok");
    })
    .await;
    result.expect("tools/list timed out");
}

/// The agent's MCP client gives up on a waiting `ask_user` (its tool timeout
/// sends `notifications/cancelled`): the child hangs up on the parent, and the
/// parent ends the parked call so a later answer is refused.
#[tokio::test]
async fn a_client_cancelled_ask_user_ends_the_parked_call_in_the_parent() {
    let parent = crate::acp::host_mcp::parent::HostPlanServer::start(vec![], None);
    let (port, token, provisional) = parent.register_session("agent-1");
    parent.bind_session(&token, "sess-real");
    parent.begin_turn("agent-1", "sess-real");
    let config = ChildConfig {
        port,
        token,
        session_id: provisional,
        agent_id: "agent-1".to_string(),
    };

    let (server_io, client_io) = tokio::io::duplex(64 * 1024);
    let (server_read, server_write) = tokio::io::split(server_io);
    let (client_read, mut client_write) = tokio::io::split(client_io);
    let serve = tokio::spawn(async move { serve_mcp_transport(config, server_read, server_write).await });

    let mut reader = BufReader::new(client_read);
    let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test-client","version":"0.0.1"}}}"#;
    let call = r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ask_user","arguments":{"question":"Proceed?","options":[{"label":"Yes"}]}}}"#;
    for line in [init, r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, call] {
        client_write.write_all(line.as_bytes()).await.unwrap();
        client_write.write_all(b"\n").await.unwrap();
        if line == init {
            let _ = read_json_id(&mut reader, 1).await;
        }
    }

    let mut question_id = None;
    for _ in 0..400 {
        question_id = parent.open_ask_ids().into_iter().next();
        if question_id.is_some() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
    let question_id = question_id.expect("ask_user call was never parked");

    client_write
        .write_all(br#"{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":2,"reason":"tool timeout"}}"#)
        .await
        .unwrap();
    client_write.write_all(b"\n").await.unwrap();
    for _ in 0..400 {
        if parent.open_ask_ids().is_empty() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }

    assert_eq!(parent.open_ask_ids(), Vec::<String>::new(), "the parked call ended");
    assert!(
        !parent.answer_ask(&question_id, Some(vec!["Yes".to_string()])),
        "a late answer is refused"
    );
    drop(client_write);
    drop(reader);
    serve.await.expect("serve task").expect("serve ok");
}
