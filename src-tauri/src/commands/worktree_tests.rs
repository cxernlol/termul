//! `worktree_merge_preview` reply shape against the renderer's `MergePreviewInfo`.

use std::collections::BTreeSet;

use super::worktree::{ConflictFileInfo, MergePreviewInfo};

const TS_WORKTREE: &str = include_str!("../../../src/shared/types/worktree.types.ts");

/// The keys the TS `MergePreviewInfo` declares: its own, and those of the
/// object type inside `conflictFiles`.
fn ts_merge_preview_keys() -> (BTreeSet<String>, BTreeSet<String>) {
    let body = TS_WORKTREE
        .split("export interface MergePreviewInfo {")
        .nth(1)
        .expect("MergePreviewInfo interface");
    let mut top = BTreeSet::new();
    let mut nested = BTreeSet::new();
    let mut depth = 1_i32;
    for line in body.lines() {
        if let Some((name, _)) = line.split_once(':') {
            let name = name.trim();
            let is_key = !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_');
            if is_key && depth == 1 {
                top.insert(name.to_string());
            } else if is_key && depth == 2 {
                nested.insert(name.to_string());
            }
        }
        depth += line.matches('{').count() as i32 - line.matches('}').count() as i32;
        if depth == 0 {
            break;
        }
    }
    (top, nested)
}

fn json_keys(value: &serde_json::Value) -> BTreeSet<String> {
    value
        .as_object()
        .expect("a JSON object")
        .keys()
        .cloned()
        .collect()
}

#[test]
fn the_serialized_merge_preview_has_exactly_the_keys_of_the_ts_type() {
    let preview = MergePreviewInfo {
        direction: "topic → main".to_string(),
        source_branch: "topic".to_string(),
        target_branch: "main".to_string(),
        conflict_files: vec![ConflictFileInfo {
            path: "a.txt".to_string(),
            severity: "high".to_string(),
            conflict_count: 1,
            is_lock_file: false,
        }],
        changed_files: vec!["a.txt".to_string()],
        total_changes: 1,
        detection_mode: "accurate".to_string(),
    };
    let json = serde_json::to_value(&preview).expect("serialize the preview");

    let (ts_top, ts_nested) = ts_merge_preview_keys();
    assert_eq!(json_keys(&json), ts_top, "MergePreviewInfo keys drifted");
    assert_eq!(
        json_keys(&json["conflictFiles"][0]),
        ts_nested,
        "ConflictFileInfo keys drifted"
    );
    assert!(
        ts_nested.contains("isLockFile"),
        "the TS parse found the nested keys"
    );
}
