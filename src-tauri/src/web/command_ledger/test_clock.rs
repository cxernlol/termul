//! Test helpers of the ledger: a hand-advanced [`LedgerClock`] for ledger and
//! `/ws` fault tests, and the one place tests mint `commandId`s (ledgered
//! routes and requests refuse a missing id, so every test request helper stamps
//! a fresh one from here).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use super::LedgerClock;

/// Starts at zero; only [`ManualClock::advance`] moves it (nanosecond precision).
#[derive(Default)]
pub(crate) struct ManualClock(AtomicU64);

impl ManualClock {
    pub(crate) fn advance(&self, by: Duration) {
        let nanos = u64::try_from(by.as_nanos()).expect("test advance fits in u64 nanoseconds");
        self.0.fetch_add(nanos, Ordering::SeqCst);
    }
}

impl LedgerClock for ManualClock {
    fn now(&self) -> Duration {
        Duration::from_nanos(self.0.load(Ordering::SeqCst))
    }
}

/// A well-formed `commandId` no other call has returned.
pub(crate) fn fresh_command_id() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    format!("test-cmd-{}", NEXT.fetch_add(1, Ordering::Relaxed))
}

/// Stamp a request frame (`{id, type, payload}`) of `/ws` (`command_id`) or
/// `/terminal/ws` (`commandId`) with a fresh id when its request type is
/// ledgered and the frame carries none, so a test's request is admitted as a
/// real client's is. Frames of other types, and `send_prompt` (whose id would
/// become its `turnId`), are left alone. Tests of the refusal send the frame
/// unstamped.
pub(crate) fn stamp_ws_frame(frame: &mut serde_json::Value) {
    let Some(kind) = frame.get("type").and_then(serde_json::Value::as_str) else {
        return;
    };
    let field = if super::terminal::ws_kind(kind).is_some() {
        "commandId"
    } else if kind != "send_prompt"
        && super::class_of(kind).is_some_and(|(_, class)| class.ledgered())
    {
        "command_id"
    } else {
        return;
    };
    if frame.get(field).is_none() {
        frame[field] = serde_json::Value::String(fresh_command_id());
    }
}

/// [`stamp_ws_frame`] for a frame in text form (invalid JSON is returned as is).
pub(crate) fn stamp_ws_text(text: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(text) {
        Ok(mut frame) => {
            stamp_ws_frame(&mut frame);
            frame.to_string()
        }
        Err(_) => text.to_string(),
    }
}
