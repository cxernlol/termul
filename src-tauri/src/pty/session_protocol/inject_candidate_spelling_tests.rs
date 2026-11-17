#![cfg(not(target_os = "windows"))]
//! Both host scripts send raw words; the client spells them for the quote open
//! at the cursor (#1879). zsh's compsys quotes matches (compadd quotes them
//! unless `-Q` says they are quoted already), bash's compgen does not, so the
//! zsh capture must unquote them.

use super::frame::Frame;
use super::inject_test_support::{bash_supports_integration, on_path, LiveShell};
use std::path::PathBuf;

fn shells() -> Vec<PathBuf> {
    let mut paths = vec![on_path("bash").unwrap(), PathBuf::from("/bin/bash")];
    paths.dedup();
    paths.retain(|shell| bash_supports_integration(shell));
    if let Some(zsh) = on_path("zsh") {
        paths.push(zsh);
    }
    paths
}

fn candidates(live: &mut LiveShell, draft: &str) -> Vec<String> {
    let hex: String = draft.bytes().map(|b| format!("{b:02x}")).collect();
    live.write(
        format!(
            "\x1b0Di\x15__termul_complete spelling 7 {} {hex}\r",
            draft.len()
        )
        .as_bytes(),
    );
    let (frames, _) = live.completion_until_idle();
    let [Frame::Completion(result)] = frames.as_slice() else {
        panic!("{draft}: {frames:?}");
    };
    let mut words: Vec<String> = result
        .output
        .lines()
        .map(|line| {
            let bytes = (0..line.len())
                .step_by(2)
                .map(|i| u8::from_str_radix(&line[i..i + 2], 16).unwrap())
                .collect();
            // Directories may or may not carry the trailing slash.
            String::from_utf8(bytes).unwrap().trim_end_matches('/').to_owned()
        })
        .collect();
    words.sort();
    words.dedup();
    words
}

#[test]
fn candidates_are_raw_words_in_every_shell_and_quote() {
    for shell in shells() {
        let home = std::sync::Arc::new(tempfile::tempdir().unwrap());
        let outer = home.path().join("outer");
        std::fs::create_dir_all(outer.join("dir with space")).unwrap();
        std::fs::write(outer.join("it's $x.txt"), "").unwrap();
        std::fs::write(outer.join("back\\slash b.txt"), "").unwrap();
        let mut live = LiveShell::with_home(&shell, home, true);
        live.handshake();
        live.read_until_idle();
        for (draft, expected) in [
            ("cat outer/dir\\ w", "outer/dir with space"),
            ("cat \"outer/dir w", "outer/dir with space"),
            ("cat 'outer/dir w", "outer/dir with space"),
            ("cat outer/it", "outer/it's $x.txt"),
            ("cat \"outer/it", "outer/it's $x.txt"),
            ("cat 'outer/it", "outer/it's $x.txt"),
            ("cat outer/ba", "outer/back\\slash b.txt"),
            ("cat \"outer/ba", "outer/back\\slash b.txt"),
        ] {
            assert_eq!(
                candidates(&mut live, draft),
                [expected],
                "{shell:?}: {draft}"
            );
        }
    }
}

/// Without `-Q`, `compadd -A` stores the match quoted for the open quote.
#[test]
fn zsh_unquotes_matches_added_without_q() {
    let Some(zsh) = on_path("zsh") else {
        return;
    };
    let mut live = LiveShell::spawn(&zsh);
    live.handshake();
    live.read_until_idle();
    live.write(b"_spelled() { compadd -- 'my file' 'x$y' 'a\\b'; }; compdef _spelled spelledcmd\r");
    live.frames_until_prompt();
    for draft in [
        "spelledcmd ",
        "spelledcmd \"",
        "spelledcmd '",
        "spelledcmd $'",
    ] {
        assert_eq!(
            candidates(&mut live, draft),
            ["a\\b", "my file", "x$y"],
            "{draft}"
        );
    }
}
