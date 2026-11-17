use super::*;

fn resume(session_id: &str, at: i64) -> ScheduledResume {
    ScheduledResume {
        session_id: session_id.to_string(),
        project_id: "p1".to_string(),
        at,
        account_id: Some("a1".to_string()),
        window: Some("five_hour".to_string()),
        turn_mark: 0,
    }
}

#[test]
fn a_resume_survives_a_reload_and_fires_once() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("resumes.json");
    let mut schedule = Schedule::load(Some(path.clone()));
    schedule.insert(resume("s1", 100));
    schedule.insert(resume("s2", 300));

    let mut reloaded = Schedule::load(Some(path.clone()));
    assert_eq!(reloaded.next_at(), Some(100));
    assert_eq!(reloaded.take_next_due(200), Some(resume("s1", 100)));
    assert_eq!(reloaded.take_next_due(200), None);

    let after_fire = Schedule::load(Some(path));
    assert_eq!(after_fire.next_at(), Some(300));
}

#[test]
fn removing_a_resume_persists() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("resumes.json");
    let mut schedule = Schedule::load(Some(path.clone()));
    schedule.insert(resume("s1", 100));
    assert_eq!(schedule.remove("s1"), Some(resume("s1", 100)));
    assert_eq!(schedule.remove("s1"), None);
    assert_eq!(Schedule::load(Some(path)).next_at(), None);
}

#[test]
fn a_damaged_file_loads_empty() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("resumes.json");
    std::fs::write(&path, b"{not json").unwrap();
    assert_eq!(Schedule::load(Some(path)).next_at(), None);
}
