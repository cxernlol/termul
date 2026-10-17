use super::search::{path_is_ignored, SearchFileHit};
use super::search_dirs::*;
use std::io::{self, Cursor, Read};

fn paths(hits: &[SearchFileHit]) -> Vec<&str> {
    hits.iter().map(|h| h.path.as_str()).collect()
}

fn collect(query: &str, include_ignored: bool, files: &[&str]) -> (Vec<SearchFileHit>, bool) {
    let mut collector = DirCollector::new(query, include_ignored);
    for file in files {
        if !collector.push_path(file) {
            break;
        }
    }
    collector.finish()
}

#[test]
fn dir_args_use_dir_glob_and_keep_file_pass_ignore_rules() {
    let dir_args = build_dir_name_search_args("comp", "/proj", false);
    let file_args = super::search::build_file_name_search_args("comp", "/proj", false);
    let glob_idx = dir_args.iter().position(|a| a == "--iglob").unwrap();
    assert_eq!(dir_args[glob_idx + 1], "**/*comp*/**");
    assert_eq!(file_args[glob_idx + 1], "**/*comp*");
    // Everything except the glob is identical (same bare-basename `-g !name`
    // ignore form, same root).
    let mut a = dir_args.clone();
    let mut b = file_args.clone();
    a.remove(glob_idx + 1);
    b.remove(glob_idx + 1);
    assert_eq!(a, b);
    assert!(dir_args.iter().any(|x| x == "!node_modules"));
    assert_eq!(dir_args.last().unwrap(), "/proj");
}

#[test]
fn dir_args_escape_glob_metacharacters_and_honor_include_ignored() {
    let args = build_dir_name_search_args("a*b[c]", "/proj", true);
    let glob_idx = args.iter().position(|a| a == "--iglob").unwrap();
    assert_eq!(args[glob_idx + 1], "**/*a\\*b\\[c\\]*/**");
    assert!(args.iter().any(|a| a == "--no-ignore"));
    assert!(args.iter().any(|a| a == "--hidden"));
    assert!(!args.iter().any(|a| a == "!node_modules"));
}

#[test]
fn dir_search_registry_key_is_distinct_from_the_search_id() {
    assert_ne!(dir_search_registry_key("search-1"), "search-1");
    assert_eq!(dir_search_registry_key("search-1"), "search-1#dirs");
}

#[test]
fn dir_search_applies_skips_empty_and_separator_queries() {
    assert!(dir_search_applies("components"));
    assert!(!dir_search_applies(""));
    assert!(!dir_search_applies("src/comp"));
    assert!(!dir_search_applies("src\\comp"));
}

#[test]
fn relativize_strips_root_prefix_and_normalizes_slashes() {
    let prefix = root_prefix_for("/home/me/proj/");
    assert_eq!(prefix, "/home/me/proj/");
    assert_eq!(
        relativize_rg_line("/home/me/proj/src/a/b.ts", &prefix).as_deref(),
        Some("src/a/b.ts")
    );
    let win_prefix = root_prefix_for(r"\\?\C:\proj");
    assert_eq!(win_prefix, "C:/proj/");
    assert_eq!(
        relativize_rg_line(r"\\?\C:\proj\src\a.ts", &win_prefix).as_deref(),
        Some("src/a.ts")
    );
    // Outside the root: never leaks an absolute path.
    assert_eq!(relativize_rg_line("/elsewhere/x.ts", &prefix), None);
    assert_eq!(relativize_rg_line("/home/me/proj/", &prefix), None);
}

#[test]
fn collector_derives_ancestor_dirs_whose_own_name_matches() {
    let (hits, truncated) = collect(
        "components",
        false,
        &[
            "src/renderer/components/a.tsx",
            "src/renderer/components/ui/b.tsx",
            "src/renderer/components/chat/c.tsx",
        ],
    );
    assert!(!truncated);
    assert_eq!(paths(&hits), vec!["src/renderer/components"]);
    assert_eq!(hits[0].kind, Some("dir"));
    assert!(!hits[0].ignored);
}

#[test]
fn collector_excludes_the_file_name_and_non_matching_dirs() {
    // The file's own name matches but it is not a directory.
    let (hits, _) = collect("search", false, &["src/search.rs", "search.rs"]);
    assert!(hits.is_empty());
    // A matching dir name only in a longer segment still matches (contains).
    let (hits, _) = collect("comp", false, &["src/mycomponents/x.ts"]);
    assert_eq!(paths(&hits), vec!["src/mycomponents"]);
}

#[test]
fn collector_is_case_insensitive_and_dedupes() {
    let (hits, _) = collect(
        "COMP",
        false,
        &[
            "src/Components/a.ts",
            "src/Components/b.ts",
            "src/components/c.ts",
        ],
    );
    // Distinct case = distinct paths; identical paths are deduped.
    assert_eq!(paths(&hits), vec!["src/Components", "src/components"]);
}

#[test]
fn collector_emits_every_matching_ancestor_shallow_first() {
    let (hits, _) = collect("search", false, &["a/search/b/search_x/f.rs"]);
    assert_eq!(paths(&hits), vec!["a/search", "a/search/b/search_x"]);
}

#[test]
fn collector_caps_non_ignored_and_reports_truncation() {
    let files: Vec<String> = (0..MAX_DIR_HITS + 5)
        .map(|i| format!("d/match{i}/f.txt"))
        .collect();
    let refs: Vec<&str> = files.iter().map(String::as_str).collect();
    let (hits, truncated) = collect("match", false, &refs);
    assert_eq!(hits.len(), MAX_DIR_HITS);
    assert!(truncated);
}

#[test]
fn collector_stops_walk_signal_when_non_ignored_full() {
    let mut collector = DirCollector::new("m", false);
    for i in 0..DIR_CANDIDATE_POOL {
        assert!(collector.push_path(&format!("m{i}/f")));
    }
    assert!(!collector.push_path("mextra/f"));
}

#[test]
fn collector_not_truncated_at_exact_cap() {
    let files: Vec<String> = (0..MAX_DIR_HITS).map(|i| format!("m{i}/f")).collect();
    let refs: Vec<&str> = files.iter().map(String::as_str).collect();
    let (hits, truncated) = collect("m", false, &refs);
    assert_eq!(hits.len(), MAX_DIR_HITS);
    assert!(!truncated);
}

#[test]
fn collector_include_ignored_tags_and_ranks_ignored_after_non_ignored() {
    let (hits, truncated) = collect(
        "components",
        true,
        &[
            "node_modules/pkg/components/a.js",
            "src/components/b.ts",
            ".hidden/components/c.ts",
        ],
    );
    assert!(!truncated);
    assert_eq!(
        paths(&hits),
        vec![
            "src/components",
            ".hidden/components",
            "node_modules/pkg/components"
        ]
    );
    assert!(!hits[0].ignored);
    assert!(hits[1].ignored && hits[2].ignored);
    assert!(hits.iter().all(|h| h.kind == Some("dir")));
    assert!(path_is_ignored(&hits[1].path));
}

#[test]
fn collector_ignored_never_crowd_out_non_ignored_and_respect_total_cap() {
    let mut files: Vec<String> = (0..30).map(|i| format!("node_modules/m{i}/f")).collect();
    files.push("src/m_real/f".to_string());
    let refs: Vec<&str> = files.iter().map(String::as_str).collect();
    let (hits, truncated) = collect("m", true, &refs);
    // "node_modules" itself does not contain "m"? It does ("m" in "node_modules").
    assert_eq!(hits.len(), MAX_DIR_HITS);
    assert_eq!(hits[0].path, "src/m_real");
    assert!(!hits[0].ignored);
    assert!(hits[1..].iter().all(|h| h.ignored));
    assert!(truncated);
}

#[test]
fn collector_without_include_ignored_never_tags_ignored() {
    // rg already excluded ignored dirs in this mode; the collector must not
    // reclassify what it is given.
    let (hits, _) = collect("components", false, &["src/components/a.ts"]);
    assert!(hits.iter().all(|h| !h.ignored));
}

#[test]
fn dir_hit_serializes_kind_and_file_hit_omits_it() {
    let dir = SearchFileHit {
        path: "src/components".to_string(),
        ignored: false,
        kind: Some(DIR_KIND),
    };
    let json = serde_json::to_value(&dir).unwrap();
    assert_eq!(json["kind"], "dir");
    assert_eq!(json["path"], "src/components");
    assert_eq!(json["ignored"], false);

    let file = SearchFileHit {
        path: "src/a.ts".to_string(),
        ignored: false,
        kind: None,
    };
    let json = serde_json::to_string(&file).unwrap();
    assert_eq!(json, r#"{"path":"src/a.ts","ignored":false}"#);
}

#[test]
fn collect_dir_hits_reads_lines_skips_foreign_paths_and_flags_early_stop() {
    let prefix = "/r/";
    let input = "/r/src/components/a.ts\n/other/components/x.ts\n/r/src/components/b.ts\n";
    let (outcome, stopped_early) =
        collect_dir_hits(Cursor::new(input), prefix, "components", false);
    assert!(!stopped_early);
    assert_eq!(outcome.skipped_lines, 1);
    assert_eq!(paths(&outcome.hits), vec!["src/components"]);
    assert!(outcome.error.is_none());

    let many: String = (0..DIR_CANDIDATE_POOL + 3)
        .map(|i| format!("/r/m{i}/f\n"))
        .collect();
    let (outcome, stopped_early) = collect_dir_hits(Cursor::new(many), prefix, "m", false);
    assert!(stopped_early);
    assert!(outcome.truncated);
    assert_eq!(outcome.hits.len(), MAX_DIR_HITS);
}

#[test]
fn start_dir_search_skips_separator_queries_without_spawning() {
    // `rg_path` is bogus on purpose: the query short-circuits before spawn.
    let result = start_dir_search("definitely-not-rg", "a/b", "/tmp", false);
    assert!(matches!(result, Ok(None)));
}

#[test]
fn start_dir_search_reports_spawn_failure() {
    let result = start_dir_search("/definitely/not/rg-binary", "abc", "/tmp", false);
    let err = result.err().expect("spawn failure surfaces as Err");
    assert!(err.contains("spawn failed"), "unexpected error: {err}");
}

/// Real-rg integration: honors ignore rules, derives root-relative dirs, and
/// leaves the file pass alone. Needs `rg` (PATH or `TERMUL_RG_PATH`).
#[test]
fn start_dir_search_finds_dirs_with_real_rg() {
    let root = std::env::temp_dir().join(format!(
        "termul-dirs-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(root.join("src/renderer/components/ui")).unwrap();
    std::fs::write(root.join("src/renderer/components/ui/a.tsx"), "x").unwrap();
    std::fs::create_dir_all(root.join("node_modules/pkg/components")).unwrap();
    std::fs::write(root.join("node_modules/pkg/components/z.js"), "x").unwrap();
    std::fs::create_dir_all(root.join("src/empty-components")).unwrap();
    let root_str = std::fs::canonicalize(&root)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let rg = super::search::detect_rg_path();

    let default = start_dir_search(&rg, "components", &root_str, false)
        .expect("spawn")
        .expect("applicable")
        .finish();
    assert!(default.error.is_none(), "{:?}", default.error);
    // Ignored node_modules excluded; empty dir not matched.
    assert_eq!(paths(&default.hits), vec!["src/renderer/components"]);
    assert!(default
        .hits
        .iter()
        .all(|h| !h.ignored && h.kind == Some("dir")));

    let with_ignored = start_dir_search(&rg, "components", &root_str, true)
        .expect("spawn")
        .expect("applicable")
        .finish();
    assert!(with_ignored.error.is_none(), "{:?}", with_ignored.error);
    assert_eq!(
        paths(&with_ignored.hits),
        vec!["src/renderer/components", "node_modules/pkg/components"]
    );
    assert!(!with_ignored.hits[0].ignored);
    assert!(with_ignored.hits[1].ignored);

    let none = start_dir_search(&rg, "nosuchdirname", &root_str, false)
        .expect("spawn")
        .expect("applicable")
        .finish();
    assert!(none.hits.is_empty());
    assert!(none.error.is_none());
    let _ = std::fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn cancel_kills_both_the_file_pass_and_the_folder_pass() {
    use super::search::SearchFileNamesCancelRequest;
    use super::search::{filename_search_processes, search_file_names_cancel};
    use std::process::Command;
    use std::sync::{Arc, Mutex};

    let id = "cancel-test-both-passes";
    let file_child = Arc::new(Mutex::new(Command::new("sleep").arg("30").spawn().unwrap()));
    let dir_child = Arc::new(Mutex::new(Command::new("sleep").arg("30").spawn().unwrap()));
    {
        let mut guard = filename_search_processes().lock().unwrap();
        guard.insert(id.to_string(), Arc::clone(&file_child));
        guard.insert(dir_search_registry_key(id), Arc::clone(&dir_child));
    }

    let res =
        tauri::async_runtime::block_on(search_file_names_cancel(SearchFileNamesCancelRequest {
            search_id: id.to_string(),
        }))
        .unwrap();
    assert!(res.success);

    for child in [&file_child, &dir_child] {
        assert!(child.lock().unwrap().try_wait().unwrap().is_some());
    }
    let guard = filename_search_processes().lock().unwrap();
    assert!(!guard.contains_key(id));
    assert!(!guard.contains_key(&dir_search_registry_key(id)));
}

#[test]
fn collector_keeps_shallow_dir_arriving_after_many_deep_ones() {
    let mut files: Vec<String> = (0..25).map(|i| format!("a/b/c/d/m{i}/f")).collect();
    files.push("m_shallow/f".to_string());
    let refs: Vec<&str> = files.iter().map(String::as_str).collect();
    let (hits, truncated) = collect("m", false, &refs);
    assert_eq!(hits.len(), MAX_DIR_HITS);
    assert_eq!(hits[0].path, "m_shallow");
    assert!(truncated);
}

#[test]
fn collector_candidate_pool_is_bounded_and_truncates() {
    let files: Vec<String> = (0..DIR_CANDIDATE_POOL + 5)
        .map(|i| format!("m{i}/f"))
        .collect();
    let refs: Vec<&str> = files.iter().map(String::as_str).collect();
    let (hits, truncated) = collect("m", false, &refs);
    assert_eq!(hits.len(), MAX_DIR_HITS);
    assert!(truncated);
}

/// A reader that yields one valid line and then an I/O error.
struct FailingReader {
    sent: bool,
}

impl Read for FailingReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.sent {
            return Err(io::Error::other("boom"));
        }
        self.sent = true;
        let line = b"/r/src/components/a.ts\n";
        buf[..line.len()].copy_from_slice(line);
        Ok(line.len())
    }
}

#[test]
fn collect_dir_hits_read_error_requests_kill_and_keeps_partial_hits() {
    let reader = io::BufReader::new(FailingReader { sent: false });
    let (outcome, stopped_early) = collect_dir_hits(reader, "/r/", "components", false);
    // rg must be killed before reaping so it cannot block on a full pipe.
    assert!(stopped_early);
    assert!(outcome.error.as_deref().unwrap().contains("read error"));
    assert_eq!(paths(&outcome.hits), vec!["src/components"]);
}

fn hit(path: &str, ignored: bool, dir: bool) -> SearchFileHit {
    SearchFileHit {
        path: path.to_string(),
        ignored,
        kind: dir.then_some(DIR_KIND),
    }
}

fn walk(include_ignored: bool, last_batch_count: usize) -> FileWalkResult {
    FileWalkResult {
        include_ignored,
        files: vec![hit("a.ts", false, false), hit("b.ts", false, false)],
        non_ignored: vec![hit("src/x.ts", false, false)],
        ignored: vec![hit("node_modules/x.js", true, false)],
        max_files: 100,
        truncated: false,
        last_batch_count,
    }
}

#[test]
fn final_batch_appends_dirs_after_files() {
    let batch = assemble_final_batch(walk(false, 0), vec![hit("src/comp", false, true)], false);
    assert_eq!(paths(&batch.files), vec!["a.ts", "b.ts", "src/comp"]);
    assert_eq!(batch.files[2].kind, Some("dir"));
    assert!(batch.files[..2].iter().all(|h| h.kind.is_none()));
    assert!(batch.emit);
}

#[test]
fn final_batch_emits_when_count_equals_last_batch_but_dirs_exist() {
    // 2 files already emitted mid-stream (last_batch_count == 2): without
    // dirs nothing to emit, with dirs the cumulative batch must go out.
    let with_dirs = assemble_final_batch(walk(false, 2), vec![hit("d", false, true)], false);
    assert!(with_dirs.emit);
    let without = assemble_final_batch(walk(false, 2), vec![], false);
    assert!(!without.emit);
    assert_eq!(paths(&without.files), vec!["a.ts", "b.ts"]);
}

#[test]
fn final_batch_emits_when_file_count_changed_since_last_batch() {
    let batch = assemble_final_batch(walk(false, 1), vec![], false);
    assert!(batch.emit);
}

#[test]
fn final_batch_ors_truncation_from_dir_pass() {
    let batch = assemble_final_batch(walk(false, 0), vec![hit("d", false, true)], true);
    assert!(batch.truncated);
    let mut w = walk(false, 0);
    w.truncated = true;
    assert!(assemble_final_batch(w, vec![], false).truncated);
    assert!(!assemble_final_batch(walk(false, 0), vec![], false).truncated);
}

#[test]
fn final_batch_include_ignored_ranks_files_then_dirs_and_always_emits() {
    let dirs = vec![
        hit("src/comp", false, true),
        hit("node_modules/comp", true, true),
    ];
    let batch = assemble_final_batch(walk(true, 2), dirs, false);
    assert!(batch.emit);
    assert_eq!(
        paths(&batch.files),
        vec![
            "src/x.ts",
            "node_modules/x.js",
            "src/comp",
            "node_modules/comp"
        ]
    );
    // Without dirs it still emits the single ranked batch.
    assert!(assemble_final_batch(walk(true, 99), vec![], false).emit);
}
