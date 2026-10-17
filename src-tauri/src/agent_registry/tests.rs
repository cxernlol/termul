use super::*;
use crate::acp_registry_snapshot::test_server::serve_registry_routes;

#[test]
fn parses_well_formed_registry() {
    let body = r#"{
            "agents": [
                {
                    "id": "claude-acp",
                    "name": "Claude Code",
                    "description": "Anthropic's agent",
                    "website": "https://claude.com",
                    "icon": "https://cdn/icon.svg",
                    "distribution": { "binary": { "cmd": "claude-agent-acp", "args": [] } }
                }
            ]
        }"#;
    let entries = parse_registry(body).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].id, "claude-acp");
    assert_eq!(entries[0].name, "Claude Code");
    assert_eq!(entries[0].icon.as_deref(), Some("https://cdn/icon.svg"));
}

#[test]
fn missing_name_falls_back_to_id() {
    let body = r#"{ "agents": [ { "id": "mystery" } ] }"#;
    let entries = parse_registry(body).unwrap();
    assert_eq!(entries[0].name, "mystery");
}

#[test]
fn ignores_unknown_fields_including_distribution() {
    // The parser distills identity only; `distribution` (the ACP invocation)
    // must never leak into the returned entry shape.
    let body = r#"{ "agents": [ { "id": "x", "distribution": { "npx": { "cmd": "x-acp" } }, "extra": 1 } ] }"#;
    let entries = parse_registry(body).unwrap();
    assert_eq!(entries.len(), 1);
    let json = serde_json::to_string(&entries[0]).unwrap();
    assert!(!json.contains("distribution"));
    assert!(!json.contains("x-acp"));
}

#[test]
fn empty_agents_list_is_ok() {
    let body = r#"{ "agents": [] }"#;
    assert_eq!(parse_registry(body).unwrap().len(), 0);
}

#[test]
fn malformed_json_errors() {
    assert!(parse_registry("not json").is_err());
}

#[tokio::test]
async fn fetch_refuses_a_redirect_to_a_non_https_url() {
    let base = serve_registry_routes().await;

    let direct = fetch_registry_entries(&format!("{base}/plain.json"))
        .await
        .unwrap();
    assert_eq!(direct[0].id, "local-agent");

    let error = fetch_registry_entries(&format!("{base}/redirect.json"))
        .await
        .unwrap_err();
    assert_eq!(
        error,
        "ACP registry redirect refused: non-https redirect target (scheme \"http\")"
    );
}

#[tokio::test]
async fn fetch_accepts_a_body_at_the_cap_and_refuses_one_byte_over() {
    let base = serve_registry_routes().await;

    let at_cap = fetch_registry_entries(&format!("{base}/at-cap.json"))
        .await
        .unwrap();
    assert!(at_cap.is_empty());

    let error = fetch_registry_entries(&format!("{base}/over-cap.json"))
        .await
        .unwrap_err();
    assert_eq!(
        error,
        "ACP registry body exceeded the 4194304-byte cap; refused"
    );
}
