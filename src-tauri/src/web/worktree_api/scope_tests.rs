use super::*;

fn entry(path: &str) -> GitWorktreeEntry {
    GitWorktreeEntry {
        name: "wt".to_string(),
        branch: "b".to_string(),
        path: path.to_string(),
        head_commit: "abc".to_string(),
    }
}

#[test]
fn inside_and_root_are_not_flagged() {
    let out = scope_entries(
        vec![entry("/work/proj"), entry("/work/proj/.termul/worktrees/a")],
        "/work/proj",
    );
    assert!(out.iter().all(|e| !e.outside_project_root));
}

#[test]
fn outside_is_kept_and_flagged() {
    let out = scope_entries(vec![entry("/elsewhere/wt")], "/work/proj");
    assert_eq!(out.len(), 1, "outside entries are listed, not dropped");
    assert!(out[0].outside_project_root);
}

#[test]
fn prefix_sibling_is_outside() {
    let out = scope_entries(vec![entry("/work/proj-other/wt")], "/work/proj");
    assert!(out[0].outside_project_root);
}

#[test]
fn windows_forms_are_equivalent() {
    let out = scope_entries(
        vec![
            entry("E:/Work/Proj/.termul/worktrees/a"),
            entry("D:/other/wt"),
        ],
        r"\\?\e:\work\proj\",
    );
    assert!(!out[0].outside_project_root);
    assert!(out[1].outside_project_root);
}

#[test]
fn flag_serializes_camel_case_only_when_true() {
    let out = scope_entries(vec![entry("/work/proj/a"), entry("/x/y")], "/work/proj");
    let inside = serde_json::to_value(&out[0]).unwrap();
    let outside = serde_json::to_value(&out[1]).unwrap();
    assert!(inside.get("outsideProjectRoot").is_none());
    assert_eq!(outside["outsideProjectRoot"], serde_json::json!(true));
    assert_eq!(outside["headCommit"], serde_json::json!("abc"));
    assert_eq!(outside["path"], serde_json::json!("/x/y"));
}
