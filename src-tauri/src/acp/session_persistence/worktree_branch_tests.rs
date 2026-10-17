use super::worktree_branch::AutoRenameRefusal;
use super::*;

fn temp_dir(label: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "termul-sessions-wtbranch-{label}-{}-{}",
        std::process::id(),
        now_millis()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}

async fn open(root: &Path) -> Arc<SessionPersistence> {
    SessionPersistence::open(root.join("store")).await.unwrap()
}

async fn register(
    persistence: &SessionPersistence,
    root: &Path,
    session_id: &str,
    worktree_path: Option<&str>,
    created: bool,
) -> SessionMetadata {
    let cwd = root.join("cwd");
    fs::create_dir_all(&cwd).unwrap();
    persistence
        .register_session(SessionRegistration {
            session_id: session_id.to_string(),
            stable_agent_namespace: Some("config:one".to_string()),
            runtime_agent_id: Some("runtime-1".to_string()),
            project_id: Some("project-1".to_string()),
            cwd,
            worktree_path: worktree_path.map(str::to_string),
            worktree_branch: worktree_path.map(|_| "chat/ab12cd34".to_string()),
            worktree_created: created,
            ..Default::default()
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn creator_registration_records_auto_source_and_launch_branch() {
    let root = temp_dir("creator");
    let persistence = open(&root).await;
    let metadata = register(
        &persistence,
        &root,
        "s1",
        Some("/p/.termul/worktrees/ab12"),
        true,
    )
    .await;
    assert_eq!(
        metadata.worktree_branch_source,
        Some(WorktreeBranchSource::Auto)
    );
    assert_eq!(
        metadata.worktree_launch_branch.as_deref(),
        Some("chat/ab12cd34")
    );
    // Survives a restart (metadata.json is the source of truth).
    persistence.shutdown().await.unwrap();
    let reopened = open(&root).await;
    let loaded = reopened.metadata("s1").unwrap();
    assert_eq!(
        loaded.worktree_branch_source,
        Some(WorktreeBranchSource::Auto)
    );
    assert_eq!(
        loaded.worktree_launch_branch.as_deref(),
        Some("chat/ab12cd34")
    );
    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn non_creator_and_worktreeless_registrations_carry_no_provenance() {
    let root = temp_dir("non-creator");
    let persistence = open(&root).await;
    let existing = register(&persistence, &root, "s1", Some("/p/wt"), false).await;
    assert_eq!(existing.worktree_branch_source, None);
    assert_eq!(existing.worktree_launch_branch, None);
    let bare = register(&persistence, &root, "s2", None, true).await;
    assert_eq!(bare.worktree_branch_source, None);
    assert_eq!(bare.worktree_launch_branch, None);
    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn old_metadata_without_the_new_keys_loads_and_new_keys_stay_off_the_index() {
    let root = temp_dir("old-json");
    let persistence = open(&root).await;
    let metadata = register(&persistence, &root, "s1", Some("/p/wt"), false).await;
    persistence.shutdown().await.unwrap();

    // The keys are skipped when None, so old files and new files without
    // provenance are byte-compatible.
    let path = root
        .join("store")
        .join(&metadata.storage_key)
        .join(METADATA_FILE);
    let raw: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert!(raw.get("worktreeBranchSource").is_none());
    assert!(raw.get("worktreeLaunchBranch").is_none());
    let reopened = open(&root).await;
    assert_eq!(
        reopened.metadata("s1").unwrap().worktree_branch_source,
        None
    );

    // The index never carries host-internal provenance, even for a creator.
    let creator = register(&reopened, &root, "s2", Some("/p/wt2"), true).await;
    assert!(creator.worktree_branch_source.is_some());
    let index: Value =
        serde_json::from_slice(&fs::read(root.join("store").join(INDEX_FILE)).unwrap()).unwrap();
    let text = index.to_string();
    assert!(!text.contains("worktreeBranchSource"), "{text}");
    assert!(!text.contains("worktreeLaunchBranch"), "{text}");
    let _ = fs::remove_dir_all(root);
}

#[test]
fn branch_source_serializes_snake_case() {
    assert_eq!(
        serde_json::to_value(WorktreeBranchSource::Auto).unwrap(),
        serde_json::json!("auto")
    );
    assert_eq!(
        serde_json::to_value(WorktreeBranchSource::User).unwrap(),
        serde_json::json!("user")
    );
}

#[tokio::test]
async fn guard_allows_only_the_auto_creator() {
    let root = temp_dir("guard");
    let persistence = open(&root).await;
    register(&persistence, &root, "creator", Some("/p/wt"), true).await;
    register(&persistence, &root, "other", Some("/p/wt"), false).await;
    register(&persistence, &root, "bare", None, false).await;

    let target = persistence.worktree_branch_guard("creator").unwrap();
    assert_eq!(target.worktree_path, "/p/wt");
    assert_eq!(target.launch_branch, "chat/ab12cd34");
    assert_eq!(
        persistence.worktree_branch_guard("other").unwrap_err(),
        AutoRenameRefusal::NotCreator
    );
    assert_eq!(
        persistence.worktree_branch_guard("bare").unwrap_err(),
        AutoRenameRefusal::NoWorktree
    );
    assert_eq!(
        persistence.worktree_branch_guard("missing").unwrap_err(),
        AutoRenameRefusal::NoWorktree
    );

    // A rename by hand claims the branch for the user.
    persistence
        .rename_worktree_branch("/p/wt", "chat/by-hand", true)
        .await
        .unwrap();
    assert_eq!(
        persistence.worktree_branch_guard("creator").unwrap_err(),
        AutoRenameRefusal::SourceUser
    );
    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn rename_rewrites_every_matching_session_across_path_forms_including_closed() {
    let root = temp_dir("rewrite");
    let persistence = open(&root).await;
    register(
        &persistence,
        &root,
        "creator",
        Some(r"E:\proj\.termul\worktrees\ab12\"),
        true,
    )
    .await;
    register(
        &persistence,
        &root,
        "later",
        Some("e:/proj/.termul/worktrees/ab12"),
        false,
    )
    .await;
    register(
        &persistence,
        &root,
        "closed",
        Some("E:/proj/.termul/worktrees/ab12/"),
        false,
    )
    .await;
    register(
        &persistence,
        &root,
        "elsewhere",
        Some("E:/proj/.termul/worktrees/zz99"),
        true,
    )
    .await;
    register(&persistence, &root, "bare", None, false).await;
    persistence
        .finalize_session("closed", PersistedSessionStatus::Closed)
        .await
        .unwrap();

    let count = persistence
        .rename_worktree_branch(
            r"\\?\E:\proj\.termul\worktrees\ab12",
            "chat/fix-login",
            false,
        )
        .await
        .unwrap();
    assert_eq!(count, 3);

    let branch_of = |id: &str| persistence.metadata(id).unwrap().worktree_branch;
    for id in ["creator", "later", "closed"] {
        assert_eq!(branch_of(id).as_deref(), Some("chat/fix-login"), "{id}");
    }
    assert_eq!(branch_of("elsewhere").as_deref(), Some("chat/ab12cd34"));
    assert_eq!(branch_of("bare"), None);
    // Auto rename leaves the source untouched.
    assert_eq!(
        persistence
            .metadata("creator")
            .unwrap()
            .worktree_branch_source,
        Some(WorktreeBranchSource::Auto)
    );
    // The index reports the new branch for every matching session.
    let listed: Vec<_> = persistence
        .list_sessions()
        .into_iter()
        .filter(|entry| entry.worktree_branch.as_deref() == Some("chat/fix-login"))
        .collect();
    assert_eq!(listed.len(), 3);

    // Persisted: a reopened store reports the same.
    persistence.shutdown().await.unwrap();
    let reopened = open(&root).await;
    for id in ["creator", "later", "closed"] {
        assert_eq!(
            reopened.metadata(id).unwrap().worktree_branch.as_deref(),
            Some("chat/fix-login"),
            "{id}"
        );
    }
    let _ = fs::remove_dir_all(root);
}

#[tokio::test]
async fn rename_by_hand_flips_source_to_user_only_on_carriers() {
    let root = temp_dir("by-hand");
    let persistence = open(&root).await;
    register(&persistence, &root, "creator", Some("/p/wt"), true).await;
    register(&persistence, &root, "later", Some("/p/wt"), false).await;
    let count = persistence
        .rename_worktree_branch("/p/wt/", "chat/mine", true)
        .await
        .unwrap();
    assert_eq!(count, 2);
    assert_eq!(
        persistence
            .metadata("creator")
            .unwrap()
            .worktree_branch_source,
        Some(WorktreeBranchSource::User)
    );
    assert_eq!(
        persistence
            .metadata("later")
            .unwrap()
            .worktree_branch_source,
        None
    );
    assert_eq!(
        persistence
            .metadata("later")
            .unwrap()
            .worktree_branch
            .as_deref(),
        Some("chat/mine")
    );
    let _ = fs::remove_dir_all(root);
}
