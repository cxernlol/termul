//! What a subagent wrote, kept on its restored dispatch card as messages
//! split at the subagent's own tool calls (renderer `subagentMessages`).

use std::collections::VecDeque;

use serde::Serialize;

use crate::acp::session_persistence::MAX_DURABLE_SUBAGENT_TEXT_CHARS;

/// Messages kept per dispatch; the oldest go first. Same bound as the
/// renderer's `MAX_SUBAGENT_MESSAGES`.
pub(crate) const MAX_DURABLE_SUBAGENT_MESSAGES: usize = 200;
/// Longest ACP `messageId` a message keeps; a longer one counts as absent.
/// Same bound as the renderer.
const MAX_MESSAGE_ID_CHARS: usize = 256;

/// One stretch of text a subagent wrote between two of its tool calls
/// (renderer `SubagentMessage`). `seq`/`timestamp` are those of the chunk
/// that opened it, so it sorts among the subagent's tool calls.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MaterializedSubagentMessage {
    pub seq: u64,
    pub timestamp: u64,
    pub text: String,
    /// ACP `messageId` of its chunks, when the agent sent one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
}

/// The fold of one dispatch's subagent text chunks, with the renderer's
/// split rule: a chunk extends the last message unless it carries a
/// different ACP `messageId`, or one of the subagent's tool calls first
/// appeared after that message started.
#[derive(Debug, Default)]
pub(super) struct SubagentMessages {
    messages: VecDeque<MaterializedSubagentMessage>,
    /// Bytes of text across `messages`.
    bytes: usize,
    /// A tool call this subagent made appeared after the last message started.
    child_since_last: bool,
}

impl SubagentMessages {
    pub(super) fn push(
        &mut self,
        chunk: &str,
        seq: u64,
        timestamp: u64,
        message_id: Option<&str>,
    ) {
        let message_id = message_id
            .filter(|id| !id.is_empty() && id.chars().count() <= MAX_MESSAGE_ID_CHARS);
        match self.messages.back_mut() {
            Some(last)
                if !self.child_since_last
                    && message_id.is_none_or(|id| last.message_id.as_deref() == Some(id)) =>
            {
                last.text.push_str(chunk);
            }
            _ => {
                self.messages.push_back(MaterializedSubagentMessage {
                    seq,
                    timestamp,
                    text: chunk.to_string(),
                    message_id: message_id.map(str::to_string),
                });
                self.child_since_last = false;
                if self.messages.len() > MAX_DURABLE_SUBAGENT_MESSAGES {
                    if let Some(dropped) = self.messages.pop_front() {
                        self.bytes -= dropped.text.len();
                    }
                }
            }
        }
        self.bytes += chunk.len();
        // Trim only past eight times the bound in bytes (twice it in 4-byte
        // characters), so long text costs amortized linear time.
        if self.bytes > MAX_DURABLE_SUBAGENT_TEXT_CHARS * 8 {
            self.trim();
        }
    }

    /// A tool call this subagent made first appeared, with `seq`.
    pub(super) fn note_child(&mut self, seq: u64) {
        if self.messages.back().is_some_and(|last| seq > last.seq) {
            self.child_since_last = true;
        }
    }

    /// The messages within both bounds, oldest first.
    pub(super) fn finish(mut self) -> Vec<MaterializedSubagentMessage> {
        self.trim();
        self.messages.into()
    }

    /// Keep the newest `MAX_DURABLE_SUBAGENT_TEXT_CHARS` characters: older
    /// messages go first, then the head of the oldest kept one.
    fn trim(&mut self) {
        let mut budget = MAX_DURABLE_SUBAGENT_TEXT_CHARS;
        let mut keep_from = 0;
        for (index, message) in self.messages.iter_mut().enumerate().rev() {
            let count = message.text.chars().count();
            if count >= budget {
                trim_text_tail(&mut message.text, budget);
                keep_from = index;
                break;
            }
            budget -= count;
        }
        self.messages.drain(..keep_from);
        self.bytes = self.messages.iter().map(|message| message.text.len()).sum();
    }
}

fn trim_text_tail(text: &mut String, max: usize) {
    let count = text.chars().count();
    if count <= max {
        return;
    }
    let cut = text
        .char_indices()
        .nth(count - max)
        .map_or(0, |(index, _)| index);
    text.drain(..cut);
}
