use super::{pick_account, AccountChoice, AccountPick, FollowReason, WorkerChatError};
use crate::acp::claude_limit::decide::Candidate;

fn candidate(id: &str, ready: bool) -> Candidate {
    Candidate {
        account_id: id.to_string(),
        ready,
        percent: Some(10.0),
    }
}

#[test]
fn a_worker_chat_uses_another_account_only_with_the_users_consent() {
    let candidates = [candidate("spare", true), candidate("out", false)];
    let auto = AccountChoice::Auto;
    let spare = AccountChoice::Account("spare".to_string());
    let out = AccountChoice::Account("out".to_string());
    let gone = AccountChoice::Account("gone".to_string());
    type Case<'a> = (
        &'a str,
        bool,
        bool,
        &'a AccountChoice,
        Option<&'a str>,
        Result<AccountPick, WorkerChatError>,
    );
    let follows = |reason| Ok(AccountPick::FollowsProject(reason));
    let cases: [Case<'_>; 9] = [
        ("unmanaged caller, auto", false, true, &auto, Some("spare"), follows(FollowReason::Unmanaged)),
        ("unmanaged caller, named", false, true, &spare, Some("spare"), follows(FollowReason::Unmanaged)),
        ("switching off, auto", true, false, &auto, Some("spare"), follows(FollowReason::AutoSwitchOff)),
        ("switching off, named", true, false, &spare, Some("spare"), follows(FollowReason::AutoSwitchOff)),
        ("auto takes the roomiest", true, true, &auto, Some("spare"), Ok(AccountPick::Pinned("spare".to_string()))),
        ("auto with no room", true, true, &auto, None, follows(FollowReason::NoRoom)),
        ("named and ready", true, true, &spare, None, Ok(AccountPick::Pinned("spare".to_string()))),
        ("named, signed out", true, true, &out, Some("spare"), Err(WorkerChatError::AccountNotReady("out".to_string()))),
        ("named, unknown", true, true, &gone, Some("spare"), Err(WorkerChatError::UnknownAccount("gone".to_string()))),
    ];
    for (name, managed, auto_switch, choice, roomiest, expected) in cases {
        assert_eq!(
            pick_account(managed, auto_switch, choice, &candidates, roomiest),
            expected,
            "{name}"
        );
    }
}

#[test]
fn a_switched_off_caller_is_told_why_its_worker_follows_the_project() {
    assert_eq!(
        FollowReason::AutoSwitchOff.note(),
        "Automatic account switching is off, so this chat uses the project's account."
    );
}

#[test]
fn account_choice_reads_auto_from_nothing_blank_or_auto() {
    for raw in [None, Some(""), Some("  "), Some("auto")] {
        assert_eq!(AccountChoice::parse(raw), AccountChoice::Auto, "{raw:?}");
    }
    assert_eq!(
        AccountChoice::parse(Some(" a1b2 ")),
        AccountChoice::Account("a1b2".to_string())
    );
}
