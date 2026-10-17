use notify::event::{
    AccessKind, AccessMode, CreateKind, DataChange, MetadataKind, ModifyKind, RemoveKind,
    RenameMode,
};
use notify::{Event, EventKind};

const FIXTURE: &str =
    include_str!("../../src/renderer/lib/__tests__/fixtures/notify-watch-events.json");

fn event(kind: EventKind, paths: &[&str]) -> Event {
    paths
        .iter()
        .fold(Event::new(kind), |event, path| event.add_path(path.into()))
}

fn rename(mode: RenameMode, paths: &[&str], tracker: Option<usize>) -> Event {
    let event = event(EventKind::Modify(ModifyKind::Name(mode)), paths);
    match tracker {
        Some(tracker) => event.set_tracker(tracker),
        None => event,
    }
}

#[test]
fn renderer_watch_fixtures_match_the_events_tauri_plugin_fs_serializes() {
    let expected = serde_json::json!({
        "createFile": event(EventKind::Create(CreateKind::File), &["/test/new.txt"]),
        "createAny": event(EventKind::Create(CreateKind::Any), &["/test/new.txt"]),
        "modifyData": event(
            EventKind::Modify(ModifyKind::Data(DataChange::Any)),
            &["/test/saved.txt"]
        ),
        "modifyMetadata": event(
            EventKind::Modify(ModifyKind::Metadata(MetadataKind::Any)),
            &["/test/saved.txt"]
        ),
        "removeFile": event(EventKind::Remove(RemoveKind::File), &["/test/gone.txt"]),
        "removeAny": event(EventKind::Remove(RemoveKind::Any), &["/test/gone.txt"]),
        "renameFrom": rename(RenameMode::From, &["/test/old.txt"], Some(7)),
        "renameTo": rename(RenameMode::To, &["/test/renamed.txt"], Some(7)),
        "renameBoth": rename(RenameMode::Both, &["/test/old.txt", "/test/renamed.txt"], Some(7)),
        "renameAny": rename(RenameMode::Any, &["/test/renamed.txt"], None),
        "any": event(EventKind::Any, &["/test/open.md"]),
        "other": event(EventKind::Other, &["/test/open.md"]),
        "accessOpenAny": event(
            EventKind::Access(AccessKind::Open(AccessMode::Any)),
            &["/test/open.md"]
        ),
        "accessCloseWrite": event(
            EventKind::Access(AccessKind::Close(AccessMode::Write)),
            &["/test/open.md"]
        ),
        "accessCloseRead": event(
            EventKind::Access(AccessKind::Close(AccessMode::Read)),
            &["/test/open.md"]
        ),
        "accessAny": event(EventKind::Access(AccessKind::Any), &["/test/open.md"]),
    });
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture is JSON");
    assert_eq!(fixture, expected);
}
