//! Directory-name match pass for the @-mention filename search (gh-896).
//!
//! `rg --files` only emits files, so a folder named `components` is never a
//! hit of the file pass. This module runs a second `rg --files` walk with the
//! glob `**/*{query}*/**` (every file under a directory whose name contains
//! the query) plus the same ignore rules as the file pass, then derives the
//! unique root-relative ancestor directories whose own name contains the
//! query. No new dependency: the walk is ripgrep, the derivation is pure.
//!
//! Shared by both transports: the desktop `search_file_names_stream` command
//! and the web `GET /search/file-names` handler. Dir hits are tagged
//! `kind: Some("dir")`, carry root-relative forward-slash paths with no
//! trailing slash, and obey `path_is_ignored` / `rank_search_hits` exactly
//! like file hits. Empty directories are never matched (derived from file
//! paths) - a documented limitation.
//!
//! Logging stays with the callers (`log` on desktop, `tracing` on the web
//! transport); this module reports failures through [`DirSearchOutcome`].

use super::search::{
    build_file_name_search_args, configure_background_command, path_is_ignored, rank_search_hits,
    reap_rg_child_after_stdout, SearchFileHit,
};
use crate::path_validation;
use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

/// Wire value of `SearchFileHit.kind` for folder hits.
pub(crate) const DIR_KIND: &str = "dir";
/// Maximum folder hits per search (so folders never crowd out files).
pub(crate) const MAX_DIR_HITS: usize = 20;
/// Distinct non-ignored candidate dirs collected before the walk is stopped.
/// rg's parallel walk order is arbitrary, so the final `MAX_DIR_HITS` are
/// chosen shallow-first from this larger pool rather than first-come.
pub(crate) const DIR_CANDIDATE_POOL: usize = 200;
/// Maximum ignored folder hits kept under `include_ignored` (same cap as files).
const IGNORED_DIR_CAP: usize = 20;

/// Registry key under which the desktop stream registers the dir-pass rg
/// child, so `search_file_names_cancel` stops both passes for one search id.
pub(crate) fn dir_search_registry_key(search_id: &str) -> String {
    format!("{search_id}#dirs")
}

/// Build the ripgrep argv for the directory-name pass: identical to the file
/// pass (`build_file_name_search_args`, including the bare-basename `-g !name`
/// ignore form) except the glob is `**/*{escaped_query}*/**`.
pub(crate) fn build_dir_name_search_args(
    query: &str,
    root_path: &str,
    include_ignored: bool,
) -> Vec<String> {
    let mut args = build_file_name_search_args(query, root_path, include_ignored);
    if let Some(glob) = args
        .iter()
        .position(|a| a == "--iglob")
        .and_then(|i| args.get_mut(i + 1))
    {
        glob.push_str("/**");
    }
    args
}

/// Slash-normalized root prefix (`/abs/root/`) stripped from rg lines so hits
/// are root-relative. Verbatim (`\\?\`) prefixes are removed from the root
/// the same way they are removed from each line.
pub(crate) fn root_prefix_for(validated_root: &str) -> String {
    let normalized = path_validation::strip_verbatim_prefix(validated_root).replace('\\', "/");
    format!("{}/", normalized.trim_end_matches('/'))
}

/// Convert one rg output line into a root-relative, slash-normalized path.
/// `None` when the line is not under `root_prefix` (so an absolute path can
/// never leak into a dir hit).
pub(crate) fn relativize_rg_line(line: &str, root_prefix: &str) -> Option<String> {
    let normalized = path_validation::strip_verbatim_prefix(line).replace('\\', "/");
    normalized
        .strip_prefix(root_prefix)
        .map(|rel| rel.trim_start_matches('/'))
        .filter(|rel| !rel.is_empty())
        .map(str::to_string)
}

/// The dir pass is skipped for queries that cannot match a single directory
/// name (path separators) so no wasted walk is started.
pub(crate) fn dir_search_applies(query: &str) -> bool {
    !query.is_empty() && !query.contains(['/', '\\'])
}

/// Accumulates unique ancestor directories whose own name contains the query,
/// bucketed non-ignored / ignored and capped. Pure (no I/O) so it can be
/// unit-tested directly.
pub(crate) struct DirCollector {
    query_lower: String,
    include_ignored: bool,
    seen: HashSet<String>,
    non_ignored: Vec<SearchFileHit>,
    ignored: Vec<SearchFileHit>,
    ignored_dropped: usize,
    broke_at_cap: bool,
}

impl DirCollector {
    pub(crate) fn new(query: &str, include_ignored: bool) -> Self {
        Self {
            query_lower: query.to_lowercase(),
            include_ignored,
            seen: HashSet::new(),
            non_ignored: Vec::new(),
            ignored: Vec::new(),
            ignored_dropped: 0,
            broke_at_cap: false,
        }
    }

    /// Feed one root-relative, slash-normalized FILE path. Every ancestor
    /// directory (the file's own name is excluded) whose last segment contains
    /// the query is recorded once. Returns `false` once the non-ignored
    /// candidate pool ([`DIR_CANDIDATE_POOL`]) is full and a further distinct
    /// dir arrived, i.e. the walk can stop (later ignored dirs could no longer
    /// survive ranking).
    pub(crate) fn push_path(&mut self, rel_path: &str) -> bool {
        let mut seg_start = 0;
        for (idx, _) in rel_path.match_indices('/') {
            let segment = &rel_path[seg_start..idx];
            seg_start = idx + 1;
            if segment.is_empty() || !segment.to_lowercase().contains(&self.query_lower) {
                continue;
            }
            let dir = &rel_path[..idx];
            if self.seen.contains(dir) {
                continue;
            }
            self.seen.insert(dir.to_string());

            // Without `include_ignored` rg already excluded ignored dirs and
            // every hit is `ignored: false` (same as the file pass).
            let ignored = self.include_ignored && path_is_ignored(dir);
            if ignored {
                if self.ignored.len() < IGNORED_DIR_CAP {
                    self.ignored.push(SearchFileHit {
                        path: dir.to_string(),
                        ignored: true,
                        kind: Some(DIR_KIND),
                    });
                } else {
                    self.ignored_dropped += 1;
                }
            } else {
                if self.non_ignored.len() >= DIR_CANDIDATE_POOL {
                    self.broke_at_cap = true;
                    return false;
                }
                self.non_ignored.push(SearchFileHit {
                    path: dir.to_string(),
                    ignored: false,
                    kind: Some(DIR_KIND),
                });
            }
        }
        true
    }

    /// Ranked dir hits (non-ignored first, shallower paths first inside each
    /// bucket so the order does not depend on the parallel walk) cut to
    /// `MAX_DIR_HITS`, and whether more candidates existed than were kept.
    pub(crate) fn finish(self) -> (Vec<SearchFileHit>, bool) {
        let Self {
            mut non_ignored,
            mut ignored,
            ignored_dropped,
            broke_at_cap,
            ..
        } = self;
        let sort_key = |h: &SearchFileHit| (h.path.matches('/').count(), h.path.clone());
        non_ignored.sort_by_key(sort_key);
        ignored.sort_by_key(sort_key);
        let truncated =
            broke_at_cap || ignored_dropped > 0 || non_ignored.len() + ignored.len() > MAX_DIR_HITS;
        non_ignored.truncate(MAX_DIR_HITS);
        (
            rank_search_hits(non_ignored, ignored, MAX_DIR_HITS),
            truncated,
        )
    }
}

/// Result of one dir pass. Failures never fail the file search: callers log
/// `error` and still return their file hits.
#[derive(Debug, Default)]
pub(crate) struct DirSearchOutcome {
    pub hits: Vec<SearchFileHit>,
    pub truncated: bool,
    pub error: Option<String>,
    /// rg lines that were not under the search root and were skipped.
    pub skipped_lines: usize,
}

/// Drain an rg stdout into dir hits. Returns `(outcome, stopped_early)`;
/// `stopped_early` tells the caller to kill rg before reaping.
pub(crate) fn collect_dir_hits<R: BufRead>(
    reader: R,
    root_prefix: &str,
    query: &str,
    include_ignored: bool,
) -> (DirSearchOutcome, bool) {
    let mut collector = DirCollector::new(query, include_ignored);
    let mut outcome = DirSearchOutcome::default();
    let mut stopped_early = false;
    for line in reader.lines() {
        match line {
            Ok(line) => match relativize_rg_line(&line, root_prefix) {
                Some(rel) => {
                    if !collector.push_path(&rel) {
                        stopped_early = true;
                        break;
                    }
                }
                None => outcome.skipped_lines += 1,
            },
            Err(e) => {
                outcome.error = Some(format!("dir search stdout read error: {e}"));
                // Stdout is no longer drained: kill rg before reaping so it
                // cannot block on a full pipe.
                stopped_early = true;
                break;
            }
        }
    }
    let (hits, truncated) = collector.finish();
    outcome.hits = hits;
    outcome.truncated = truncated;
    (outcome, stopped_early)
}

/// A running dir pass: the rg child (shared so the desktop cancel registry can
/// kill it) plus the collector thread draining its stdout.
pub(crate) struct DirSearch {
    pub child: Arc<Mutex<Child>>,
    join: JoinHandle<DirSearchOutcome>,
}

impl DirSearch {
    /// Kill the rg child without waiting (the collector thread reaps it), so a
    /// following `finish()` returns promptly.
    pub(crate) fn kill(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }

    /// Block until the dir pass ends (EOF, cap, cancel kill) and return its
    /// outcome. A panicked collector degrades to an error outcome.
    pub(crate) fn finish(self) -> DirSearchOutcome {
        self.join.join().unwrap_or_else(|_| DirSearchOutcome {
            error: Some("dir search thread panicked".to_string()),
            ..DirSearchOutcome::default()
        })
    }
}

/// Spawn the dir pass. `Ok(None)` when the query cannot match a directory
/// name; `Err` when rg could not be spawned (callers log it and still return
/// their file hits). Runs concurrently with the file pass.
pub(crate) fn start_dir_search(
    rg_path: &str,
    query: &str,
    validated_root: &str,
    include_ignored: bool,
) -> Result<Option<DirSearch>, String> {
    if !dir_search_applies(query) {
        return Ok(None);
    }
    let args = build_dir_name_search_args(query, validated_root, include_ignored);
    let mut command = Command::new(rg_path);
    command
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    configure_background_command(&mut command);
    let mut child = command
        .spawn()
        .map_err(|e| format!("dir search rg spawn failed (path: {rg_path}): {e}"))?;
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("dir search failed to capture rg stdout".to_string());
    };

    let child = Arc::new(Mutex::new(child));
    let thread_child = Arc::clone(&child);
    let root_prefix = root_prefix_for(validated_root);
    let query = query.to_string();
    let join = std::thread::Builder::new()
        .name("file-name-dir-search".to_string())
        .spawn(move || {
            let (mut outcome, stopped_early) = collect_dir_hits(
                BufReader::new(stdout),
                &root_prefix,
                &query,
                include_ignored,
            );
            let status = match thread_child.lock() {
                Ok(mut c) => reap_rg_child_after_stdout(&mut c, stopped_early),
                Err(_) => {
                    outcome
                        .error
                        .get_or_insert("dir search child handle poisoned".to_string());
                    None
                }
            };
            // rg exits 1 for "no matches"; a kill from cancel/early-stop ends
            // by signal (no exit code) and is not a failure either.
            if !stopped_early {
                if let Some(status) = status.filter(|s| s.code().is_some_and(|c| c != 0 && c != 1))
                {
                    outcome
                        .error
                        .get_or_insert(format!("dir search rg exited with status: {status:?}"));
                }
            }
            outcome
        })
        .map_err(|e| {
            if let Ok(mut c) = child.lock() {
                let _ = c.kill();
                let _ = c.wait();
            }
            format!("dir search thread spawn failed: {e}")
        })?;

    Ok(Some(DirSearch { child, join }))
}

/// Inputs for [`assemble_final_batch`]: the file walk's result plus the
/// bookkeeping the emit decision needs.
pub(crate) struct FileWalkResult {
    pub include_ignored: bool,
    /// Default-path files in walk order (unused when `include_ignored`).
    pub files: Vec<SearchFileHit>,
    /// `include_ignored` buckets, ranked here (unused otherwise).
    pub non_ignored: Vec<SearchFileHit>,
    pub ignored: Vec<SearchFileHit>,
    pub max_files: usize,
    /// File-walk truncation (default: cap hit; `include_ignored`: cap hit or
    /// ignored hits dropped).
    pub truncated: bool,
    /// Size of the last mid-stream batch already emitted (default path).
    pub last_batch_count: usize,
}

/// The authoritative final batch of a filename search.
#[derive(Debug)]
pub(crate) struct FinalBatch {
    /// Cumulative snapshot: files first, then folder hits.
    pub files: Vec<SearchFileHit>,
    pub truncated: bool,
    /// Whether the caller must emit `files` as a final batch event.
    pub emit: bool,
}

/// Merge the folder pass into the file walk's final batch. Pure so the
/// emit/ordering/truncation rules are unit-testable. `include_ignored` always
/// emits one ranked batch; the default path emits only when the count changed
/// since the last mid-stream batch or folder hits were appended.
pub(crate) fn assemble_final_batch(
    walk: FileWalkResult,
    dir_hits: Vec<SearchFileHit>,
    dir_truncated: bool,
) -> FinalBatch {
    let truncated = walk.truncated || dir_truncated;
    let has_dirs = !dir_hits.is_empty();
    let mut files = if walk.include_ignored {
        rank_search_hits(walk.non_ignored, walk.ignored, walk.max_files)
    } else {
        walk.files
    };
    files.extend(dir_hits);
    let emit = walk.include_ignored || files.len() != walk.last_batch_count || has_dirs;
    FinalBatch {
        files,
        truncated,
        emit,
    }
}
