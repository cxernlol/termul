use super::*;

#[test]
fn counts_a_two_way_conflict_block() {
    let content = r#"
normal code
<<<<<<< HEAD
ours version
=======
theirs version
>>>>>>> branch
more normal code
"#;
    assert_eq!(WorktreeManager::count_conflict_blocks(content), 1);
}

#[test]
fn counts_a_diff3_conflict_block_once() {
    let content = r#"
<<<<<<< HEAD
ours version
||||||| base
base version
=======
theirs version
>>>>>>> branch
"#;
    assert_eq!(WorktreeManager::count_conflict_blocks(content), 1);
}

#[test]
fn counts_every_conflict_block_in_a_file() {
    let content = r#"
<<<<<<< HEAD
first ours
=======
first theirs
>>>>>>> branch
normal code
<<<<<<< HEAD
second ours
=======
second theirs
>>>>>>> branch
"#;
    assert_eq!(WorktreeManager::count_conflict_blocks(content), 2);
}

#[test]
fn test_extract_lines_splits_cr_lf_and_crlf() {
    // Mirrors real `git worktree add` stderr: \r-delimited progress updates
    // interleaved with \n lines and a CRLF pair.
    let mut buf =
        b"Preparing worktree\nUpdating files:  10%\rUpdating files:  20%\rHEAD is now at abc\r\n"
            .to_vec();
    let lines = extract_lines(&mut buf);
    assert_eq!(
        lines,
        vec![
            "Preparing worktree",
            "Updating files:  10%",
            "Updating files:  20%",
            "HEAD is now at abc"
        ]
    );
    assert!(buf.is_empty());
}

#[test]
fn test_extract_lines_keeps_partial_tail() {
    let mut buf = b"Updating files:  10%\rpartial".to_vec();
    let lines = extract_lines(&mut buf);
    assert_eq!(lines, vec!["Updating files:  10%"]);
    assert_eq!(buf, b"partial".to_vec());

    // Next chunk completes the line.
    buf.extend_from_slice(b" line\n");
    let lines = extract_lines(&mut buf);
    assert_eq!(lines, vec!["partial line"]);
    assert!(buf.is_empty());
}

#[test]
fn test_extract_lines_empty_input() {
    let mut buf: Vec<u8> = Vec::new();
    assert!(extract_lines(&mut buf).is_empty());
    // Bare delimiters yield no empty lines.
    let mut buf = b"\r\n\n".to_vec();
    assert!(extract_lines(&mut buf).is_empty());
    assert!(buf.is_empty());
}
