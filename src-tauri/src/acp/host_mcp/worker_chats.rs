//! Inputs and descriptions of the `start_chat` and `send_to_chat` tools.

use rmcp::schemars;
use serde::{Deserialize, Serialize};

pub const START_CHAT_DESCRIPTION: &str = "Start a new Troupe chat that works in parallel with \
this one, in the same project and folder, and send it `prompt` as its first message. When this \
chat runs on a Claude account Troupe manages and the user allows automatic account switching, \
the new chat runs on the signed-in Claude account with the most room; otherwise it uses the \
project's account. It is a normal chat the user can open. It does not see this conversation: \
put the whole task and every detail it needs in `prompt`. Returns its chat ID and account. \
Follow it with read_chat and send follow-ups with send_to_chat. A chat started this way cannot \
start chats itself, and one chat may have at most 6 running.";

pub const LIST_STARTED_CHATS_DESCRIPTION: &str = "List the chats this chat started with \
start_chat, newest first: chat ID, title, and status (working, idle or stopped).";

/// What the agent reads when `start_chat` outlives its wait.
pub const START_CHAT_LATE: &str = "The Troupe host did not answer in time. The new chat may \
still start: call list_started_chats to find it, then read it with read_chat, before you start \
it again.";

pub const SEND_TO_CHAT_DESCRIPTION: &str = "Send another message to a chat this chat started \
with start_chat. Refused while that chat is still answering its last message: check it with \
read_chat first.";

/// Input of `start_chat`.
#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
pub struct StartChatInput {
    /// The new chat's first message: the whole task, with everything it
    /// needs to know.
    pub prompt: String,
    /// A short title for the new chat.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// `auto` (the default) picks the signed-in Claude account with the most
    /// room; or a Claude account ID from Troupe. Ignored when this chat does
    /// not run on a Claude account Troupe manages.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
}

/// Input of `send_to_chat`.
#[derive(Debug, Clone, Deserialize, Serialize, schemars::JsonSchema)]
pub struct SendToChatInput {
    /// The chat ID `start_chat` returned.
    #[serde(alias = "chatId")]
    pub chat_id: String,
    /// The message to send.
    pub prompt: String,
}
