//! Host-side `+N −N` line counts for durable file-change summaries.
//!
//! The durable tool DTO never persists diff text, so the line counts the
//! renderer's Changed files panel shows for a restored session must be
//! computed here, at normalize time, from the live event's diff items. This
//! mirrors the renderer's `diffLineCounts` (`tool-call-format.ts`), so a
//! restored row shows the same counts the live card showed:
//!
//! - Same `splitLines` rules: empty text → no lines; the trailing empty
//!   segment after a final `\n` is dropped; one trailing `\r` per line is
//!   trimmed (CRLF content).
//! - `oldText` null/absent/`""` → every new line is an addition (new file).
//! - `newText` `""` (or absent — the renderer defaults it to `""`) → every
//!   old line is a removal (deleted file).
//! - Otherwise the renderer's bounded diff (`diffRange` / `anchorEmit`),
//!   counting kept lines only: trim the common prefix and suffix, take the
//!   exact LCS of the middle when it fits [`MAX_LCS_CELLS`], else chain
//!   anchors (lines unique on both sides, greedily kept while their new-side
//!   index rises) and recurse between them up to [`MAX_ANCHOR_DEPTH`]. A
//!   middle with no anchor, or past the depth cap, keeps nothing.
//!   `added = n − kept`, `removed = m − kept`.

use std::collections::HashMap;

use serde_json::Value;

/// Max (trimmed) cells for the exact LCS — parity with the renderer's
/// `MAX_LCS_CELLS`.
pub(crate) const MAX_LCS_CELLS: usize = 2_000_000;

/// Recursion cap on the anchor chain — parity with the renderer's
/// `MAX_ANCHOR_DEPTH`.
const MAX_ANCHOR_DEPTH: usize = 24;

/// Added/removed line counts for one or more diff items.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) struct LineCounts {
    pub added: u64,
    pub removed: u64,
}

/// Renderer `splitLines` parity.
pub(crate) fn split_lines(text: &str) -> Vec<&str> {
    if text.is_empty() {
        return Vec::new();
    }
    let mut parts: Vec<&str> = text.split('\n').collect();
    if parts.last() == Some(&"") {
        parts.pop();
    }
    parts
        .into_iter()
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect()
}

/// Renderer `diffLineCounts` parity for one diff item (`oldText` may be
/// absent/null; an absent `newText` is passed as `""`).
pub(crate) fn diff_line_counts(old_text: Option<&str>, new_text: &str) -> LineCounts {
    let new_lines = split_lines(new_text);
    let Some(old_text) = old_text.filter(|text| !text.is_empty()) else {
        // New file: all lines are additions.
        return LineCounts {
            added: new_lines.len() as u64,
            removed: 0,
        };
    };
    let old_lines = split_lines(old_text);
    if new_text.is_empty() {
        // Deleted file: all lines are removals.
        return LineCounts {
            added: 0,
            removed: old_lines.len() as u64,
        };
    }
    let kept = kept_in_range(&old_lines, &new_lines, 0);
    LineCounts {
        added: (new_lines.len() - kept) as u64,
        removed: (old_lines.len() - kept) as u64,
    }
}

/// Sum of [`diff_line_counts`] over every `type: "diff"` item in an ACP
/// tool `content` array (renderer `diffInfo` parity). `None` when the value
/// is not an array or holds no diff item — the event carries no diff stat.
pub(crate) fn content_diff_stat(content: Option<&Value>) -> Option<LineCounts> {
    let items = content?.as_array()?;
    let mut total: Option<LineCounts> = None;
    for item in items.iter().filter(|item| is_diff_item(item)) {
        let counts = diff_line_counts(
            item.get("oldText").and_then(Value::as_str),
            item.get("newText").and_then(Value::as_str).unwrap_or(""),
        );
        let sum = total.get_or_insert_with(LineCounts::default);
        sum.added = sum.added.saturating_add(counts.added);
        sum.removed = sum.removed.saturating_add(counts.removed);
    }
    total
}

/// True for an ACP `{"type": "diff", …}` content item.
pub(crate) fn is_diff_item(item: &Value) -> bool {
    item.get("type").and_then(Value::as_str) == Some("diff")
}

/// Renderer `diffRange` parity, counting `keep` ops only.
fn kept_in_range(old: &[&str], new: &[&str], depth: usize) -> usize {
    let head = old
        .iter()
        .zip(new.iter())
        .take_while(|(a, b)| a == b)
        .count();
    let (old_rest, new_rest) = (&old[head..], &new[head..]);
    let tail = old_rest
        .iter()
        .rev()
        .zip(new_rest.iter().rev())
        .take_while(|(a, b)| a == b)
        .count();
    let old_mid = &old_rest[..old_rest.len() - tail];
    let new_mid = &new_rest[..new_rest.len() - tail];
    let middle = if old_mid.is_empty() || new_mid.is_empty() {
        0
    } else if old_mid.len().saturating_mul(new_mid.len()) <= MAX_LCS_CELLS {
        lcs_len(old_mid, new_mid)
    } else if depth < MAX_ANCHOR_DEPTH {
        anchor_kept(old_mid, new_mid, depth)
    } else {
        0
    };
    head + tail + middle
}

/// Renderer `anchorEmit` parity, counting `keep` ops only.
fn anchor_kept(old: &[&str], new: &[&str], depth: usize) -> usize {
    let mut old_counts: HashMap<&str, usize> = HashMap::new();
    for line in old {
        *old_counts.entry(*line).or_insert(0) += 1;
    }
    let mut new_counts: HashMap<&str, usize> = HashMap::new();
    for line in new {
        *new_counts.entry(*line).or_insert(0) += 1;
    }
    let new_unique: HashMap<&str, usize> = new
        .iter()
        .enumerate()
        .filter(|(_, line)| new_counts[*line] == 1 && old_counts.get(*line) == Some(&1))
        .map(|(j, line)| (*line, j))
        .collect();
    let mut anchors: Vec<(usize, usize)> = Vec::new();
    for (i, line) in old.iter().enumerate() {
        if let Some(&j) = new_unique.get(line) {
            if anchors.last().is_none_or(|&(_, last)| j > last) {
                anchors.push((i, j));
            }
        }
    }
    if anchors.is_empty() {
        return 0;
    }
    let (mut old_start, mut new_start) = (0, 0);
    let mut kept = anchors.len();
    for &(i, j) in &anchors {
        kept += kept_in_range(&old[old_start..i], &new[new_start..j], depth + 1);
        old_start = i + 1;
        new_start = j + 1;
    }
    kept + kept_in_range(&old[old_start..], &new[new_start..], depth + 1)
}

/// Exact LCS length with a single rolling row over the shorter side
/// (O(m·n) time, O(min(m, n)) memory).
fn lcs_len(a: &[&str], b: &[&str]) -> usize {
    let (outer, inner) = if a.len() >= b.len() { (a, b) } else { (b, a) };
    let mut row = vec![0usize; inner.len() + 1];
    for outer_line in outer {
        let mut diagonal = 0usize;
        for (j, inner_line) in inner.iter().enumerate() {
            let above = row[j + 1];
            row[j + 1] = if outer_line == inner_line {
                diagonal + 1
            } else {
                above.max(row[j])
            };
            diagonal = above;
        }
    }
    row[inner.len()]
}
