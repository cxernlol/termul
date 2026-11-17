//! What the host does when a chat reaches its account's plan limit. Pure: the
//! supervisor gathers the inputs and acts on the [`LimitDecision`].

use std::collections::HashMap;
use std::time::{Duration, SystemTime};

use crate::acp::claude_accounts::usage::{ClaudeAccountUsage, ClaudeUsageStatus};
use crate::acp::claude_accounts::ClaudeAccountsSnapshot;

pub const SHORTEST_WINDOW: Duration = Duration::from_secs(5 * 60 * 60);

#[derive(Debug, Clone, PartialEq)]
pub struct Candidate {
    pub account_id: String,
    /// The login is confirmed and the last usage read did not report it
    /// signed out.
    pub ready: bool,
    /// Percent used of the account's most used window; `None` when the usage
    /// read had no windows or failed.
    pub percent: Option<f64>,
}

/// Ready accounts with room left, least used first. An account with an
/// unknown usage counts as unused.
#[must_use]
pub fn rank_alternatives(candidates: &[Candidate]) -> Vec<String> {
    let mut ranked: Vec<(&str, f64)> = candidates
        .iter()
        .filter(|c| c.ready)
        .map(|c| (c.account_id.as_str(), c.percent.unwrap_or(0.0)))
        .filter(|(_, percent)| *percent < 100.0)
        .collect();
    ranked.sort_by(|a, b| a.1.total_cmp(&b.1));
    ranked.into_iter().map(|(id, _)| id.to_string()).collect()
}

/// Every Account of `snapshot` except `exclude`, with its readiness and the
/// percent used of its most used window.
#[must_use]
pub fn candidates(
    snapshot: &ClaudeAccountsSnapshot,
    usage: &[ClaudeAccountUsage],
    exclude: Option<&str>,
) -> Vec<Candidate> {
    snapshot
        .profiles
        .iter()
        .filter(|account| Some(account.id.as_str()) != exclude)
        .map(|account| {
            let read = usage.iter().find(|u| u.account_id == account.id);
            Candidate {
                account_id: account.id.clone(),
                ready: account.signed_in == Some(true)
                    && read.is_none_or(|u| u.status != ClaudeUsageStatus::SignedOut),
                percent: most_used(read).map(|(percent, _)| percent),
            }
        })
        .collect()
}

/// The percent used of the most used window, and when it resets.
#[must_use]
pub fn most_used(usage: Option<&ClaudeAccountUsage>) -> Option<(f64, Option<&str>)> {
    let usage = usage.filter(|u| u.status == ClaudeUsageStatus::Ok)?;
    usage
        .windows
        .iter()
        .reduce(|top, w| if w.percent > top.percent { w } else { top })
        .map(|w| (w.percent, w.resets_at.as_deref()))
}

/// The first of the `ranked` Accounts that has not reached a limit, or whose
/// limit has reset by `now`.
#[must_use]
pub fn first_with_room<'a>(
    ranked: &'a [String],
    limited_until: &HashMap<String, SystemTime>,
    now: SystemTime,
) -> Option<&'a String> {
    ranked.iter().find(|id| {
        limited_until
            .get(id.as_str())
            .is_none_or(|until| *until <= now)
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IgnoreReason {
    AutoSwitchOff,
    /// No account has room and the reset time is unknown.
    NoRoom,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LimitDecision {
    /// Move the chat to `to` and continue it there.
    Switch {
        to: String,
    },
    /// No account has room: continue the chat when the window resets.
    ResumeAt {
        at: SystemTime,
    },
    /// The chat's agent runs an account the chat no longer uses (a client
    /// or the project choice moved it first): restart it on the chat's
    /// account.
    Restart,
    Ignore {
        reason: IgnoreReason,
    },
}

pub struct LimitContext<'a> {
    /// The account the chat's agent was started with.
    pub agent_account: &'a str,
    /// The account the chat runs on now: its own, else its project's, else
    /// the default.
    pub chat_account: &'a str,
    pub auto_switch: bool,
    pub candidates: &'a [String],
    /// Accounts that reached a limit, until their reset. A cached usage read
    /// can still show room for an account that just reached its limit.
    pub limited_until: &'a HashMap<String, SystemTime>,
    pub resets_at: Option<SystemTime>,
    pub now: SystemTime,
}

#[must_use]
pub fn decide(ctx: &LimitContext<'_>) -> LimitDecision {
    if ctx.agent_account != ctx.chat_account {
        return LimitDecision::Restart;
    }
    if !ctx.auto_switch {
        return LimitDecision::Ignore {
            reason: IgnoreReason::AutoSwitchOff,
        };
    }
    if let Some(to) = first_with_room(ctx.candidates, ctx.limited_until, ctx.now) {
        return LimitDecision::Switch { to: to.clone() };
    }
    match ctx.resets_at {
        Some(at) => LimitDecision::ResumeAt { at },
        None => LimitDecision::Ignore {
            reason: IgnoreReason::NoRoom,
        },
    }
}

/// The live agent that holds a chat when its scheduled resume falls due.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatHolder<'a> {
    Nobody,
    /// An agent the host launched for a client on this account.
    Account(&'a str),
    /// An agent on credentials no account switch changes, or one the host
    /// did not launch for a client.
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumePlan {
    /// No agent holds the chat: start one.
    Start,
    /// Continue on the agent that holds the chat.
    Continue,
    /// The holder runs an older account than the chat's: replace it.
    Replace,
    /// The chat left the limited account since, or the host cannot tell:
    /// leave it alone.
    Skip,
}

/// What a due resume does. `limited_account` is the account that reached its
/// limit; `chat_account` is `None` when the account lookup failed, and then
/// no agent is replaced.
#[must_use]
pub fn plan_resume(
    holder: ChatHolder<'_>,
    limited_account: Option<&str>,
    chat_account: Option<&str>,
) -> ResumePlan {
    match holder {
        ChatHolder::Nobody => ResumePlan::Start,
        ChatHolder::Other => ResumePlan::Skip,
        ChatHolder::Account(running) if limited_account.is_some_and(|l| l != running) => {
            ResumePlan::Skip
        }
        ChatHolder::Account(running) => match chat_account {
            Some(chat) if chat != running => ResumePlan::Replace,
            _ => ResumePlan::Continue,
        },
    }
}

#[cfg(test)]
#[path = "decide_tests.rs"]
mod tests;
