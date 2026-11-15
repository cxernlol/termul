use super::*;

#[test]
fn a_chatgpt_login_reads_as_signed_in() {
    let json = r#"{"auth_mode":"chatgpt","OPENAI_API_KEY":null,"tokens":{"id_token":"a","access_token":"b","refresh_token":"c","account_id":"d"}}"#;
    assert_eq!(login_from_auth_json(json), CodexLoginProbe::SignedIn);
}

#[test]
fn an_api_key_reads_as_signed_in_like_the_cli() {
    assert_eq!(
        login_from_auth_json(r#"{"OPENAI_API_KEY":"sk-x","tokens":null}"#),
        CodexLoginProbe::SignedIn
    );
}

#[test]
fn empty_tokens_and_no_key_read_as_signed_out() {
    assert_eq!(
        login_from_auth_json(r#"{"tokens":{"access_token":"","refresh_token":"  "}}"#),
        CodexLoginProbe::SignedOut
    );
}

#[test]
fn a_broken_file_is_unavailable() {
    assert_eq!(
        login_from_auth_json("{not json"),
        CodexLoginProbe::Unavailable
    );
}

#[test]
fn a_home_without_the_file_is_signed_out_and_with_it_signed_in() {
    let dir = tempfile::tempdir().expect("temp dir");
    let home = dir.path().to_str().expect("utf-8 path");
    assert_eq!(
        codex_login_from_file(Some(home)),
        CodexLoginProbe::SignedOut
    );
    std::fs::write(
        dir.path().join(AUTH_FILE),
        r#"{"tokens":{"refresh_token":"r"}}"#,
    )
    .expect("write auth file");
    assert_eq!(codex_login_from_file(Some(home)), CodexLoginProbe::SignedIn);
}

#[test]
fn a_relative_account_home_never_reads_the_default_home() {
    assert_eq!(
        codex_login_from_file(Some("relative/home")),
        CodexLoginProbe::Unavailable
    );
}
