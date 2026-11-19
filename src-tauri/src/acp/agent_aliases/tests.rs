use super::*;

#[test]
fn opencode_v2_is_the_legacy_id_for_opencode() {
    assert_eq!(canonical_agent_id("opencode-v2"), "opencode");
    assert_eq!(canonical_agent_id("opencode"), "opencode");
    assert_eq!(canonical_agent_id("gemini"), "gemini");
    assert!(is_legacy_agent_id("opencode-v2"));
    assert!(!is_legacy_agent_id("opencode"));
    assert_eq!(legacy_ids_for("opencode"), vec!["opencode-v2"]);
    assert!(legacy_ids_for("gemini").is_empty());
}
