//! File pass of the @-mention / explorer filename search: drains one
//! `rg --files` stdout into capped, ignore-bucketed file hits. Shared by the
//! desktop `search_file_names_stream` command and the web
//! `GET /search/file-names` handler, so both transports produce the same hits.
//!
//! Hit paths are root-relative with forward slashes (the same contract as the
//! folder pass in `search_dirs`). rg echoes the absolute root it is given, so
//! each line is stripped of the root prefix before `path_is_ignored` sees it;
//! a root under a folder named like an ignored dir never taints its hits.

use super::search::{path_is_ignored, SearchFileHit};
use super::search_dirs::{relativize_rg_line, FileWalkResult};
use std::io::BufRead;

/// Maximum file hits per search.
pub(crate) const MAX_FILE_HITS: usize = 100;
/// Default-path hit count between mid-stream batches.
const BATCH_SIZE: usize = 25;
/// Maximum ignored file hits kept under `include_ignored` (ADR 0003).
const IGNORED_FILE_CAP: usize = 20;

/// Outcome of one file walk.
pub(crate) struct FileHitWalk {
    pub result: FileWalkResult,
    pub stream_error: Option<String>,
    /// The walk stopped at the cap before EOF: kill rg before reaping.
    pub stopped_early: bool,
    /// rg lines that were not under the search root and were skipped.
    pub skipped_lines: usize,
}

/// Drain rg `--files` lines into file hits. `on_batch` receives the
/// cumulative default-path snapshot every [`BATCH_SIZE`] hits (the desktop
/// stream emits it; the web route ignores it). Under `include_ignored` the
/// walk stops once the non-ignored bucket is full, because later ignored hits
/// can no longer survive `rank_search_hits`.
pub(crate) fn collect_file_hits<R: BufRead>(
    reader: R,
    root_prefix: &str,
    include_ignored: bool,
    mut on_batch: impl FnMut(&[SearchFileHit]),
) -> FileHitWalk {
    let mut files: Vec<SearchFileHit> = Vec::new();
    let mut non_ignored: Vec<SearchFileHit> = Vec::new();
    let mut ignored: Vec<SearchFileHit> = Vec::new();
    let mut ignored_dropped: usize = 0;
    let mut at_cap = false;
    let mut last_batch_count: usize = 0;
    let mut stream_error: Option<String> = None;
    let mut skipped_lines: usize = 0;

    // A manual loop records the first I/O error that `map_while(Result::ok)`
    // would swallow.
    let mut lines = reader.lines();
    loop {
        let line = match lines.next() {
            Some(Ok(line)) => line,
            Some(Err(e)) => {
                stream_error = Some(format!("stdout read error: {e}"));
                break;
            }
            None => break,
        };
        let Some(path) = relativize_rg_line(&line, root_prefix) else {
            skipped_lines += 1;
            continue;
        };
        if include_ignored {
            if non_ignored.len() >= MAX_FILE_HITS {
                at_cap = true;
                break;
            }
            if path_is_ignored(&path) {
                if ignored.len() < IGNORED_FILE_CAP {
                    ignored.push(SearchFileHit {
                        path,
                        ignored: true,
                        kind: None,
                    });
                } else {
                    ignored_dropped += 1;
                }
            } else {
                non_ignored.push(SearchFileHit {
                    path,
                    ignored: false,
                    kind: None,
                });
            }
        } else {
            if files.len() >= MAX_FILE_HITS {
                at_cap = true;
                break;
            }
            files.push(SearchFileHit {
                path,
                ignored: false,
                kind: None,
            });
            if files.len().is_multiple_of(BATCH_SIZE) {
                on_batch(&files);
                last_batch_count = files.len();
            }
        }
    }

    FileHitWalk {
        result: FileWalkResult {
            include_ignored,
            files,
            non_ignored,
            ignored,
            max_files: MAX_FILE_HITS,
            truncated: at_cap || ignored_dropped > 0,
            last_batch_count,
        },
        stream_error,
        stopped_early: at_cap,
        skipped_lines,
    }
}
