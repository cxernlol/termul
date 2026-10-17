use super::search::SearchFileHit;
use super::search_dirs::root_prefix_for;
use super::search_file_hits::*;
use std::io::Cursor;

fn paths(hits: &[SearchFileHit]) -> Vec<&str> {
    hits.iter().map(|h| h.path.as_str()).collect()
}

#[test]
fn file_hits_are_root_relative() {
    let prefix = root_prefix_for("/proj");
    let input = "/proj/src/a.ts\n/proj/a.ts\n";
    let walk = collect_file_hits(Cursor::new(input), &prefix, false, |_| {});
    assert_eq!(paths(&walk.result.files), vec!["src/a.ts", "a.ts"]);
    assert_eq!(walk.skipped_lines, 0);
}

#[test]
fn windows_verbatim_hits_are_root_relative_with_forward_slashes() {
    let prefix = root_prefix_for(r"\\?\C:\work\proj");
    let input = "\\\\?\\C:\\work\\proj\\src\\a.ts\n";
    let walk = collect_file_hits(Cursor::new(input), &prefix, false, |_| {});
    assert_eq!(paths(&walk.result.files), vec!["src/a.ts"]);
}

#[test]
fn a_project_under_a_dir_named_like_an_ignored_dir_is_not_ignored() {
    let prefix = root_prefix_for("/home/me/build/proj");
    let input = "/home/me/build/proj/src/a.ts\n/home/me/build/proj/node_modules/x/a.ts\n";
    let walk = collect_file_hits(Cursor::new(input), &prefix, true, |_| {});
    assert_eq!(paths(&walk.result.non_ignored), vec!["src/a.ts"]);
    assert_eq!(paths(&walk.result.ignored), vec!["node_modules/x/a.ts"]);
    assert!(walk.result.ignored[0].ignored);
}

#[test]
fn lines_outside_the_root_are_skipped_and_counted() {
    let prefix = root_prefix_for("/proj");
    let input = "/proj/a.ts\n/elsewhere/b.ts\n/project-two/c.ts\n";
    let walk = collect_file_hits(Cursor::new(input), &prefix, false, |_| {});
    assert_eq!(paths(&walk.result.files), vec!["a.ts"]);
    assert_eq!(walk.skipped_lines, 2);
}

#[test]
fn mid_stream_batches_carry_root_relative_paths() {
    let prefix = root_prefix_for("/proj");
    let input: String = (0..25).map(|i| format!("/proj/f{i}.ts\n")).collect();
    let mut batches: Vec<Vec<String>> = Vec::new();
    collect_file_hits(Cursor::new(input), &prefix, false, |files| {
        batches.push(files.iter().map(|h| h.path.clone()).collect());
    });
    assert_eq!(batches.len(), 1);
    assert_eq!(batches[0][0], "f0.ts");
    assert_eq!(batches[0][24], "f24.ts");
}
