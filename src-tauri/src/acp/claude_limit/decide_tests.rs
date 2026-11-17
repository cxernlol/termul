use super::*;

fn candidate(id: &str, ready: bool, percent: Option<f64>) -> Candidate {
    Candidate {
        account_id: id.to_string(),
        ready,
        percent,
    }
}

fn at(secs: u64) -> SystemTime {
    SystemTime::UNIX_EPOCH + Duration::from_secs(secs)
}

#[test]
fn ranking_keeps_ready_accounts_with_room_least_used_first() {
    let cases: [(&str, Vec<Candidate>, Vec<&str>); 5] = [
        (
            "least used first",
            vec![
                candidate("a", true, Some(70.0)),
                candidate("b", true, Some(10.0)),
                candidate("c", true, Some(40.0)),
            ],
            vec!["b", "c", "a"],
        ),
        (
            "an unknown usage counts as unused",
            vec![candidate("a", true, Some(5.0)), candidate("b", true, None)],
            vec!["b", "a"],
        ),
        (
            "a full account has no room",
            vec![
                candidate("a", true, Some(100.0)),
                candidate("b", true, Some(99.0)),
            ],
            vec!["b"],
        ),
        (
            "an account that is not ready is left out",
            vec![
                candidate("a", false, Some(0.0)),
                candidate("b", true, Some(50.0)),
            ],
            vec!["b"],
        ),
        (
            "ties keep list order",
            vec![
                candidate("a", true, Some(20.0)),
                candidate("b", true, Some(20.0)),
            ],
            vec!["a", "b"],
        ),
    ];
    for (name, input, expected) in cases {
        assert_eq!(rank_alternatives(&input), expected, "{name}");
    }
}

#[test]
fn a_new_chat_takes_the_first_ranked_account_that_has_not_reached_a_limit() {
    const NOW: u64 = 1_000;
    let ranked: Vec<String> = ["spare", "work", "home"].map(String::from).to_vec();
    type Case<'a> = (&'a str, Vec<(&'a str, u64)>, Option<&'a str>);
    let cases: [Case<'_>; 4] = [
        ("nothing limited", vec![], Some("spare")),
        ("the roomiest one is limited", vec![("spare", NOW + 60)], Some("work")),
        ("a limit that reset counts as room", vec![("spare", NOW)], Some("spare")),
        (
            "every account limited",
            vec![("spare", NOW + 1), ("work", NOW + 1), ("home", NOW + 1)],
            None,
        ),
    ];
    for (name, limited, expected) in cases {
        let limited: HashMap<String, SystemTime> = limited
            .into_iter()
            .map(|(id, until)| (id.to_string(), at(until)))
            .collect();
        assert_eq!(
            first_with_room(&ranked, &limited, at(NOW)).map(String::as_str),
            expected,
            "{name}"
        );
    }
}

struct Case {
    name: &'static str,
    agent: &'static str,
    chat: &'static str,
    auto_switch: bool,
    candidates: Vec<&'static str>,
    limited: Vec<(&'static str, u64)>,
    resets_at: Option<u64>,
    expected: LimitDecision,
}

#[test]
fn decision_table() {
    const NOW: u64 = 1_000;
    let cases = vec![
        Case {
            name: "switches to the first candidate",
            agent: "a",
            chat: "a",
            auto_switch: true,
            candidates: vec!["b", "c"],
            limited: vec![],
            resets_at: Some(5_000),
            expected: LimitDecision::Switch {
                to: "b".to_string(),
            },
        },
        Case {
            name: "skips a candidate still limited",
            agent: "a",
            chat: "a",
            auto_switch: true,
            candidates: vec!["b", "c"],
            limited: vec![("b", 2_000)],
            resets_at: Some(5_000),
            expected: LimitDecision::Switch {
                to: "c".to_string(),
            },
        },
        Case {
            name: "a candidate whose limit already reset has room",
            agent: "a",
            chat: "a",
            auto_switch: true,
            candidates: vec!["b"],
            limited: vec![("b", NOW)],
            resets_at: Some(5_000),
            expected: LimitDecision::Switch {
                to: "b".to_string(),
            },
        },
        Case {
            name: "no room resumes at the reset",
            agent: "a",
            chat: "a",
            auto_switch: true,
            candidates: vec!["b"],
            limited: vec![("b", 9_000)],
            resets_at: Some(5_000),
            expected: LimitDecision::ResumeAt { at: at(5_000) },
        },
        Case {
            name: "no room and no reset time does nothing",
            agent: "a",
            chat: "a",
            auto_switch: true,
            candidates: vec![],
            limited: vec![],
            resets_at: None,
            expected: LimitDecision::Ignore {
                reason: IgnoreReason::NoRoom,
            },
        },
        Case {
            name: "switching off does nothing",
            agent: "a",
            chat: "a",
            auto_switch: false,
            candidates: vec!["b"],
            limited: vec![],
            resets_at: Some(5_000),
            expected: LimitDecision::Ignore {
                reason: IgnoreReason::AutoSwitchOff,
            },
        },
        Case {
            name: "an agent on an account the chat left restarts, switching on",
            agent: "a",
            chat: "b",
            auto_switch: true,
            candidates: vec!["c"],
            limited: vec![],
            resets_at: Some(5_000),
            expected: LimitDecision::Restart,
        },
        Case {
            name: "an agent on an account the chat left restarts, switching off",
            agent: "a",
            chat: "b",
            auto_switch: false,
            candidates: vec![],
            limited: vec![],
            resets_at: None,
            expected: LimitDecision::Restart,
        },
    ];
    for case in cases {
        let candidates: Vec<String> = case.candidates.iter().map(ToString::to_string).collect();
        let limited: HashMap<String, SystemTime> = case
            .limited
            .iter()
            .map(|(id, until)| ((*id).to_string(), at(*until)))
            .collect();
        let decision = decide(&LimitContext {
            agent_account: case.agent,
            chat_account: case.chat,
            auto_switch: case.auto_switch,
            candidates: &candidates,
            limited_until: &limited,
            resets_at: case.resets_at.map(at),
            now: at(NOW),
        });
        assert_eq!(decision, case.expected, "{}", case.name);
    }
}

#[test]
fn a_due_resume_never_touches_a_chat_that_left_the_limited_account() {
    type Case<'a> = (&'a str, ChatHolder<'a>, Option<&'a str>, Option<&'a str>, ResumePlan);
    let cases: [Case<'_>; 8] = [
        ("nobody holds the chat", ChatHolder::Nobody, Some("work"), Some("work"), ResumePlan::Start),
        ("nobody holds it, lookup failed", ChatHolder::Nobody, Some("work"), None, ResumePlan::Start),
        ("the limited account, still the chat's", ChatHolder::Account("work"), Some("work"), Some("work"), ResumePlan::Continue),
        ("the limited account, chat moved on", ChatHolder::Account("work"), Some("work"), Some("spare"), ResumePlan::Replace),
        ("the lookup failed", ChatHolder::Account("work"), Some("work"), None, ResumePlan::Continue),
        ("the chat moved to another account", ChatHolder::Account("spare"), Some("work"), Some("spare"), ResumePlan::Skip),
        ("an agent the host cannot switch", ChatHolder::Other, Some("work"), Some("work"), ResumePlan::Skip),
        ("an entry with no account", ChatHolder::Account("spare"), None, Some("work"), ResumePlan::Replace),
    ];
    for (name, holder, limited, chat, want) in cases {
        assert_eq!(plan_resume(holder, limited, chat), want, "{name}");
    }
}
