//! Worker chats an agent starts with the `start_chat` host tool. Each is a
//! real, persisted chat in the caller's project and folder, on its own host
//! agent, started and prompted with no client connected. A managed Claude
//! caller's worker runs on the signed-in Account with the most room, written
//! as the chat's own Account, so the limit supervisor moves it like any chat.

use std::collections::HashMap;
use std::sync::{Arc, Weak};

use agent_client_protocol::schema::v1::{ContentBlock, SessionModeState, TextContent};
use parking_lot::Mutex;
use serde::Serialize;

use crate::acp::claude_agent::{ClaudeLaunchAuth, LaunchChat};
use crate::acp::claude_limit::decide::{self, Candidate};
use crate::acp::claude_limit::{roomiest_account, AccountRef, CLAUDE_CONFIG_ID};
use crate::acp::config::{AgentId, SessionId};
use crate::acp::manager::{LaunchRecipe, SessionCreationContext};
use crate::acp::session_persistence::{SessionKind, UNASSIGNED_PROJECT_ID};
use crate::acp::{AcpManager, SignInCheck, SpawnScope};
use crate::logging::redact_session_id;
use crate::web::prompt_turn::{
    accept_prompt_turn, complete_prompt_turn, PromptAdmission, PromptTurnError, PromptTurnRequest,
};
use crate::web::project_registry::ProjectRegistry;
use crate::web::WsRelaySink;

/// Worker chats one caller may have running at once.
pub const MAX_LIVE_CHILDREN: usize = 6;

/// The Claude Account a new worker chat runs on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AccountChoice {
    /// The signed-in Account with the most room.
    Auto,
    Account(String),
}

impl AccountChoice {
    /// No value, a blank one and `auto` choose automatically.
    #[must_use]
    pub fn parse(raw: Option<&str>) -> Self {
        match raw.map(str::trim) {
            None | Some("" | "auto") => Self::Auto,
            Some(id) => Self::Account(id.to_string()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct StartChatRequest {
    pub caller: SessionId,
    pub prompt: String,
    pub title: Option<String>,
    pub account: AccountChoice,
}

/// The `start_chat` result.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedChat {
    pub chat_id: String,
    /// The chat's own Claude Account; `None` when it follows its Project.
    pub account: Option<AccountRef>,
    /// Why the chat follows its Project, or what did not apply.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkerChatError {
    Unavailable,
    /// The caller is not open on a host agent the host launched for a client.
    NoRecipe,
    /// The caller is itself a worker chat.
    Grandchild,
    QuickChat,
    ProjectBusy,
    CapReached,
    UnknownAccount(String),
    AccountNotReady(String),
    /// The chat does not exist or another chat started it.
    NotYourChat(String),
    Busy(String),
    /// No live agent holds the chat.
    Stopped(String),
    Failed(String),
}

impl WorkerChatError {
    #[must_use]
    pub fn code(&self) -> &'static str {
        match self {
            Self::Unavailable => "unavailable",
            Self::NoRecipe => "no_launch_recipe",
            Self::Grandchild => "worker_chat",
            Self::QuickChat => "quick_chat",
            Self::ProjectBusy => "project_busy",
            Self::CapReached => "too_many_chats",
            Self::UnknownAccount(_) => "unknown_account",
            Self::AccountNotReady(_) => "account_not_ready",
            Self::NotYourChat(_) => "not_your_chat",
            Self::Busy(_) => "busy",
            Self::Stopped(_) => "stopped",
            Self::Failed(_) => "failed",
        }
    }

    #[must_use]
    pub fn message(&self) -> String {
        match self {
            Self::Unavailable => "Worker chats are not available on this Troupe host.".to_string(),
            Self::NoRecipe => "Troupe cannot start a chat from this one: the host did not launch \
                this chat's agent for a client, so it has nothing to start the new chat with. \
                Reopen this chat in Troupe, then try again."
                .to_string(),
            Self::Grandchild => "This chat was started by another chat, so it cannot start chats \
                of its own. Report back to the chat that started you instead."
                .to_string(),
            Self::QuickChat => "Quick chats cannot start other chats; use a project chat.".to_string(),
            Self::ProjectBusy => "This chat's project is being removed or archived.".to_string(),
            Self::CapReached => format!(
                "This chat already has {MAX_LIVE_CHILDREN} worker chats running, the most it may \
                 have. Wait for one to finish (read it with read_chat) or give more work to one \
                 with send_to_chat."
            ),
            Self::UnknownAccount(id) => format!(
                "Troupe has no Claude account with ID {id}. Pass \"auto\" to use the account \
                 with the most room."
            ),
            Self::AccountNotReady(id) => format!(
                "The Claude account with ID {id} is not signed in. Pass \"auto\" to use the \
                 account with the most room, or ask the user to sign in to it."
            ),
            Self::NotYourChat(id) => format!(
                "Chat {id} was not started by this chat. send_to_chat only reaches chats this \
                 chat started with start_chat."
            ),
            Self::Busy(id) => format!(
                "Chat {id} is still working on its current message, so the new one was not sent. \
                 Check its progress with read_chat and send again when it has answered."
            ),
            Self::Stopped(id) => format!(
                "Chat {id} is not running anymore: its agent stopped. Start a new chat with \
                 start_chat and pass what it needs, or ask the user to reopen chat {id}."
            ),
            Self::Failed(reason) => reason.clone(),
        }
    }
}

/// One worker chat of a caller: reserved while it starts, then its id.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Slot {
    Starting(u64),
    Started(SessionId),
}

#[derive(Default)]
struct Children {
    next: u64,
    by_parent: HashMap<SessionId, Vec<Slot>>,
}

/// Why a worker chat follows its Project's Account.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FollowReason {
    /// The caller runs on credentials no Account switch changes.
    Unmanaged,
    /// The user turned automatic account switching off.
    AutoSwitchOff,
    NoRoom,
}

impl FollowReason {
    fn note(self) -> &'static str {
        match self {
            Self::Unmanaged => "This chat does not run on a Claude account Troupe manages, so the \
                new chat uses its project's agent setup and `account` was ignored.",
            Self::AutoSwitchOff => {
                "Automatic account switching is off, so this chat uses the project's account."
            }
            Self::NoRoom => "No signed-in Claude account has room now, so the new chat uses its \
                project's account.",
        }
    }
}

/// Where a new worker chat's agent gets its Claude Account.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AccountPick {
    Pinned(String),
    FollowsProject(FollowReason),
}

/// The Account of a new worker chat. `managed`: the caller is a managed
/// Claude chat on an Account. `auto_switch`: the user's consent to run chats
/// on other Accounts. `roomiest`: the ranked pick over `candidates`.
pub(crate) fn pick_account(
    managed: bool,
    auto_switch: bool,
    choice: &AccountChoice,
    candidates: &[Candidate],
    roomiest: Option<&str>,
) -> Result<AccountPick, WorkerChatError> {
    if !managed {
        return Ok(AccountPick::FollowsProject(FollowReason::Unmanaged));
    }
    if !auto_switch {
        return Ok(AccountPick::FollowsProject(FollowReason::AutoSwitchOff));
    }
    match choice {
        AccountChoice::Auto => Ok(roomiest.map_or(
            AccountPick::FollowsProject(FollowReason::NoRoom),
            |id| AccountPick::Pinned(id.to_string()),
        )),
        AccountChoice::Account(id) => match candidates.iter().find(|c| c.account_id == *id) {
            None => Err(WorkerChatError::UnknownAccount(id.clone())),
            Some(candidate) if !candidate.ready => {
                Err(WorkerChatError::AccountNotReady(id.clone()))
            }
            Some(_) => Ok(AccountPick::Pinned(id.clone())),
        },
    }
}

/// A worker chat's Account, named.
enum ChildAccount {
    Pinned(AccountRef),
    FollowsProject(FollowReason),
}

/// One worker chat of a caller, as `list_started_chats` shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedChat {
    pub chat_id: String,
    pub title: Option<String>,
    pub status: ChatStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ChatStatus {
    /// Answering a message.
    Working,
    /// Waiting for a message.
    Idle,
    /// No live agent holds it.
    Stopped,
}

pub struct WorkerChats {
    acp: Weak<AcpManager>,
    relay: Arc<WsRelaySink>,
    runtime: tokio::runtime::Handle,
    children: Mutex<Children>,
    /// Test seam; the installed registry otherwise.
    registry: std::sync::OnceLock<Arc<ProjectRegistry>>,
}

/// Install the worker-chat service on `acp`'s host tools.
pub fn install(
    acp: &Arc<AcpManager>,
    relay: &Arc<WsRelaySink>,
    runtime: &tokio::runtime::Handle,
) -> Arc<WorkerChats> {
    let chats = Arc::new(WorkerChats {
        acp: Arc::downgrade(acp),
        relay: Arc::clone(relay),
        runtime: runtime.clone(),
        children: Mutex::new(Children::default()),
        registry: std::sync::OnceLock::new(),
    });
    acp.set_worker_chats(Arc::clone(&chats));
    chats
}

impl WorkerChats {
    /// Start a worker chat for `request.caller` and send it its first prompt.
    /// Runs on the host runtime, not the host tool listener's thread.
    pub async fn start(self: &Arc<Self>, request: StartChatRequest) -> Result<StartedChat, WorkerChatError> {
        let this = Arc::clone(self);
        self.runtime
            .spawn(async move { this.start_here(request).await })
            .await
            .map_err(|_| WorkerChatError::Failed("starting the chat stopped unexpectedly".to_string()))?
    }

    /// Send `prompt` to the worker chat `child` of `caller`.
    pub async fn send(
        self: &Arc<Self>,
        caller: SessionId,
        child: SessionId,
        prompt: String,
    ) -> Result<(), WorkerChatError> {
        let this = Arc::clone(self);
        self.runtime
            .spawn(async move { this.send_here(&caller, &child, prompt).await })
            .await
            .map_err(|_| WorkerChatError::Failed("sending the message stopped unexpectedly".to_string()))?
    }

    /// The worker chats `caller` started, newest first.
    pub async fn list(self: &Arc<Self>, caller: SessionId) -> Result<Vec<ListedChat>, WorkerChatError> {
        let this = Arc::clone(self);
        self.runtime
            .spawn(async move { this.list_here(&caller).await })
            .await
            .map_err(|_| WorkerChatError::Failed("listing the chats stopped unexpectedly".to_string()))?
    }

    #[cfg(test)]
    pub(crate) fn set_registry_for_test(&self, registry: Arc<ProjectRegistry>) {
        let _ = self.registry.set(registry);
    }

    fn registry(&self) -> Option<Arc<ProjectRegistry>> {
        self.registry
            .get()
            .cloned()
            .or_else(crate::web::project_registry::installed)
    }

    async fn list_here(&self, caller: &SessionId) -> Result<Vec<ListedChat>, WorkerChatError> {
        let acp = self.acp.upgrade().ok_or(WorkerChatError::Unavailable)?;
        let persistence = acp.persistence().ok_or(WorkerChatError::Unavailable)?;
        let mut entries: Vec<_> = persistence
            .list_sessions()
            .into_iter()
            .filter(|entry| entry.started_by.as_deref() == Some(caller.0.as_str()))
            .collect();
        entries.sort_by_key(|entry| std::cmp::Reverse(entry.created_at));
        let mut listed = Vec::with_capacity(entries.len());
        for entry in entries {
            let chat = SessionId(entry.session_id.clone());
            let status = match live_owner(&acp, &chat).await {
                None => ChatStatus::Stopped,
                Some(agent) if acp.is_turn_active(&agent, chat).await.unwrap_or(false) => {
                    ChatStatus::Working
                }
                Some(_) => ChatStatus::Idle,
            };
            listed.push(ListedChat {
                chat_id: entry.session_id,
                title: entry.title,
                status,
            });
        }
        Ok(listed)
    }

    async fn start_here(&self, request: StartChatRequest) -> Result<StartedChat, WorkerChatError> {
        let acp = self.acp.upgrade().ok_or(WorkerChatError::Unavailable)?;
        let persistence = acp.persistence().ok_or(WorkerChatError::Unavailable)?;
        let caller = redact_session_id(&request.caller.0);
        let recipe = acp
            .launch_recipe(&request.caller)
            .ok_or(WorkerChatError::NoRecipe)?;
        let metadata = persistence
            .metadata(&request.caller.0)
            .map_err(|_| WorkerChatError::NoRecipe)?;
        if metadata.started_by.is_some() {
            return Err(WorkerChatError::Grandchild);
        }
        if metadata.kind == SessionKind::Quick {
            return Err(WorkerChatError::QuickChat);
        }
        let project_id = recipe.launch.project_id.clone();
        let registry = self.registry();
        let was_active = match (&registry, project_id.as_deref()) {
            (Some(registry), Some(project)) => {
                if registry.is_removing(project) {
                    return Err(WorkerChatError::ProjectBusy);
                }
                registry.is_active(project)
            }
            _ => false,
        };
        let slot = self.reserve(&acp, &request.caller)?;
        let account = child_account(&acp, &recipe, &request.account).await?;
        let chat = match &account {
            ChildAccount::Pinned(account) => LaunchChat::New {
                account_id: account.id.clone(),
            },
            ChildAccount::FollowsProject(_) => LaunchChat::None,
        };
        let agent_id = acp
            .spawn_with_command_id(
                recipe.launch.config.clone(),
                None,
                SpawnScope {
                    project_id: project_id.clone(),
                    chat,
                },
            )
            .await
            .map_err(|error| {
                log::warn!("[worker-chats] chat {caller} could not start a worker agent: {error}");
                WorkerChatError::Failed(format!("The new chat's agent did not start: {error}"))
            })?
            .agent_id;
        let created = match acp
            .new_session_with_context(
                &agent_id,
                recipe.cwd.clone(),
                recipe.mcp_servers.clone().unwrap_or_default(),
                SessionCreationContext {
                    project_id: project_id.clone(),
                    additional_directories: recipe.additional_directories.clone(),
                    worktree_path: metadata.worktree_path.clone(),
                    worktree_branch: metadata.worktree_branch.clone(),
                    started_by: Some(request.caller.0.clone()),
                    ..SessionCreationContext::default()
                },
            )
            .await
        {
            Ok(created) => created,
            Err(error) => {
                log::warn!("[worker-chats] chat {caller}: the worker agent {agent_id} did not open a chat");
                let _ = acp.kill(&agent_id).await;
                return Err(WorkerChatError::Failed(format!(
                    "The new chat did not open: {error}"
                )));
            }
        };
        let child = created.session_id.clone();
        if let (Some(registry), Some(project)) = (&registry, project_id.as_deref()) {
            if registry.project_left_while_starting(project, was_active) {
                log::warn!("[worker-chats] chat {caller}: the project was removed while a worker chat started; stopping it");
                acp.stop_project_sessions(&agent_id, std::slice::from_ref(&child.0))
                    .await;
                let _ = acp.kill(&agent_id).await;
                return Err(WorkerChatError::ProjectBusy);
            }
        }
        let recorded_parent = persistence
            .metadata(&child.0)
            .ok()
            .and_then(|metadata| metadata.started_by);
        if recorded_parent.as_deref() != Some(request.caller.0.as_str()) {
            log::warn!(
                "[worker-chats] chat {caller}: the new chat {} is not recorded as its worker; stopping it",
                redact_session_id(&child.0)
            );
            let _ = acp.kill(&agent_id).await;
            return Err(WorkerChatError::Failed(
                "The new chat could not be recorded as this chat's worker.".to_string(),
            ));
        }
        let mut note = None;
        let account = match account {
            ChildAccount::Pinned(account) => {
                let pinned = acp
                    .claude_agent()
                    .set_chat_account(
                        project_id.as_deref().unwrap_or(UNASSIGNED_PROJECT_ID),
                        &child.0,
                        Some(&account.id),
                        None,
                        SignInCheck::Skip,
                    )
                    .await;
                if let Err(error) = pinned {
                    log::warn!(
                        "[worker-chats] the account of worker chat {} was not saved: {error}",
                        redact_session_id(&child.0)
                    );
                    note = Some(
                        "The chat runs on this account now, but Troupe could not save it as the \
                         chat's account."
                            .to_string(),
                    );
                }
                Some(account)
            }
            ChildAccount::FollowsProject(reason) => {
                note = Some(reason.note().to_string());
                None
            }
        };
        inherit_mode(&acp, &request.caller, &agent_id, &child, created.modes.as_ref()).await;
        if let Some(title) = request.title.filter(|title| !title.trim().is_empty()) {
            if let Err(error) = crate::acp::manager::record_local_title(
                &persistence,
                acp.sinks(),
                agent_id.clone(),
                child.0.clone(),
                title,
            )
            .await
            {
                log::warn!(
                    "[worker-chats] the title of worker chat {} was not saved: {error}",
                    redact_session_id(&child.0)
                );
            }
        }
        slot.started(child.clone());
        if let Err(error) = self.prompt(&acp, &agent_id, &child, request.prompt).await {
            return Err(WorkerChatError::Failed(format!(
                "Chat {} started, but its first message was not sent ({}). Send it again with \
                 send_to_chat.",
                child.0,
                error.message()
            )));
        }
        log::info!(
            "[worker-chats] chat {caller} started worker chat {} on agent {agent_id} ({})",
            redact_session_id(&child.0),
            if account.is_some() { "own account" } else { "project account" }
        );
        Ok(StartedChat {
            chat_id: child.0,
            account,
            note,
        })
    }

    async fn send_here(
        &self,
        caller: &SessionId,
        child: &SessionId,
        prompt: String,
    ) -> Result<(), WorkerChatError> {
        let acp = self.acp.upgrade().ok_or(WorkerChatError::Unavailable)?;
        let persistence = acp.persistence().ok_or(WorkerChatError::Unavailable)?;
        let started_by = persistence
            .metadata(&child.0)
            .ok()
            .and_then(|metadata| metadata.started_by);
        if started_by.as_deref() != Some(caller.0.as_str()) {
            log::info!(
                "[worker-chats] chat {} may not send to chat {}",
                redact_session_id(&caller.0),
                redact_session_id(&child.0)
            );
            return Err(WorkerChatError::NotYourChat(child.0.clone()));
        }
        let agent_id = live_owner(&acp, child)
            .await
            .ok_or_else(|| WorkerChatError::Stopped(child.0.clone()))?;
        self.prompt(&acp, &agent_id, child, prompt).await?;
        log::info!(
            "[worker-chats] chat {} sent a message to worker chat {}",
            redact_session_id(&caller.0),
            redact_session_id(&child.0)
        );
        Ok(())
    }

    /// Start a turn of `prompt` and return once the agent accepted it.
    async fn prompt(
        &self,
        acp: &Arc<AcpManager>,
        agent_id: &AgentId,
        session_id: &SessionId,
        prompt: String,
    ) -> Result<(), WorkerChatError> {
        let blocks = vec![ContentBlock::Text(TextContent::new(prompt))];
        let request = PromptTurnRequest {
            agent_id: agent_id.clone(),
            session_id: session_id.clone(),
            content: blocks.clone(),
            record_content: blocks,
            turn_id: Some(format!("worker-chat-{}", uuid::Uuid::new_v4())),
        };
        let chat = redact_session_id(&session_id.0);
        match accept_prompt_turn(acp, &self.relay, request).await {
            Ok(PromptAdmission::Running(running)) => {
                let acp = Arc::clone(acp);
                tokio::spawn(async move {
                    match complete_prompt_turn(&acp, running).await {
                        Ok(reason) => log::info!("[worker-chats] worker chat {chat} turn ended ({reason:?})"),
                        Err(_) => log::warn!("[worker-chats] the turn of worker chat {chat} failed"),
                    }
                });
                Ok(())
            }
            Ok(PromptAdmission::Receipt(_)) => Ok(()),
            Err(error) => {
                log::warn!("[worker-chats] worker chat {chat} refused a message ({})", error.kind());
                Err(match error {
                    PromptTurnError::Busy { .. } => WorkerChatError::Busy(session_id.0.clone()),
                    PromptTurnError::NotOwned => WorkerChatError::Stopped(session_id.0.clone()),
                    PromptTurnError::Failed(reason)
                        if reason.starts_with("ACP_TURN_IN_PROGRESS") =>
                    {
                        WorkerChatError::Busy(session_id.0.clone())
                    }
                    PromptTurnError::Failed(reason) => WorkerChatError::Failed(reason),
                })
            }
        }
    }

    /// Hold a place for one more worker chat of `parent`, or refuse at the cap.
    fn reserve(&self, acp: &AcpManager, parent: &SessionId) -> Result<Reservation<'_>, WorkerChatError> {
        let mut children = self.children.lock();
        children.next += 1;
        let id = children.next;
        let slots = children.by_parent.entry(parent.clone()).or_default();
        slots.retain(|slot| match slot {
            Slot::Starting(_) => true,
            Slot::Started(child) => is_live(acp, child),
        });
        if slots.len() >= MAX_LIVE_CHILDREN {
            log::info!(
                "[worker-chats] chat {} is at its {MAX_LIVE_CHILDREN} worker chats",
                redact_session_id(&parent.0)
            );
            return Err(WorkerChatError::CapReached);
        }
        slots.push(Slot::Starting(id));
        Ok(Reservation {
            chats: self,
            parent: parent.clone(),
            id,
            started: false,
        })
    }
}

/// A held place for one worker chat; dropped unstarted, it frees the place.
struct Reservation<'a> {
    chats: &'a WorkerChats,
    parent: SessionId,
    id: u64,
    started: bool,
}

impl Reservation<'_> {
    fn started(mut self, child: SessionId) {
        self.set(Some(child));
        self.started = true;
    }

    fn set(&self, child: Option<SessionId>) {
        let mut children = self.chats.children.lock();
        let Some(slots) = children.by_parent.get_mut(&self.parent) else {
            return;
        };
        if let Some(index) = slots.iter().position(|slot| *slot == Slot::Starting(self.id)) {
            match child {
                Some(child) => slots[index] = Slot::Started(child),
                None => {
                    slots.remove(index);
                }
            }
        }
    }
}

impl Drop for Reservation<'_> {
    fn drop(&mut self) {
        if !self.started {
            self.set(None);
        }
    }
}

/// A live agent the host launched holds the chat.
fn is_live(acp: &AcpManager, chat: &SessionId) -> bool {
    acp.launch_recipe(chat)
        .is_some_and(|recipe| acp.agent_launch(&recipe.agent_id).is_some())
}

async fn live_owner(acp: &AcpManager, chat: &SessionId) -> Option<AgentId> {
    for agent in acp.list_agents() {
        if acp.owns_session(&agent, chat.clone()).await.unwrap_or(false) {
            return Some(agent);
        }
    }
    None
}

/// Read what [`pick_account`] needs and name the Account it picks.
async fn child_account(
    acp: &AcpManager,
    recipe: &LaunchRecipe,
    choice: &AccountChoice,
) -> Result<ChildAccount, WorkerChatError> {
    let managed = recipe.launch.config.config_id.as_deref() == Some(CLAUDE_CONFIG_ID)
        && matches!(recipe.launch.claude, ClaudeLaunchAuth::Account(_));
    let snapshot = if managed {
        Some(
            acp.claude_agent()
                .profile_list()
                .await
                .map_err(WorkerChatError::Failed)?,
        )
    } else {
        None
    };
    let auto_switch = snapshot.as_ref().is_some_and(|snapshot| snapshot.auto_switch);
    let candidates = match &snapshot {
        Some(snapshot) if auto_switch => {
            let usage = acp
                .claude_agent()
                .accounts_usage(true)
                .await
                .unwrap_or_else(|error| {
                    log::warn!("[worker-chats] usage read failed: {error}");
                    Vec::new()
                });
            decide::candidates(snapshot, &usage, None)
        }
        _ => Vec::new(),
    };
    let roomiest = roomiest_account(acp, &candidates);
    match pick_account(managed, auto_switch, choice, &candidates, roomiest.as_deref())? {
        AccountPick::FollowsProject(reason) => Ok(ChildAccount::FollowsProject(reason)),
        AccountPick::Pinned(id) => {
            let name = snapshot
                .iter()
                .flat_map(|snapshot| &snapshot.profiles)
                .find(|account| account.id == id)
                .map_or_else(|| id.clone(), |account| account.name.clone());
            Ok(ChildAccount::Pinned(AccountRef { id, name }))
        }
    }
}

/// Start the worker in the mode its caller runs in now, so a caller that
/// allowed its tools does not leave its worker waiting on a permission no
/// client is there to answer.
async fn inherit_mode(
    acp: &AcpManager,
    caller: &SessionId,
    agent_id: &AgentId,
    child: &SessionId,
    modes: Option<&SessionModeState>,
) {
    let (Some(modes), Some(persistence)) = (modes, acp.persistence()) else {
        return;
    };
    let Some(mode) = persistence.current_mode_id(&caller.0).await else {
        return;
    };
    if *modes.current_mode_id.0 == *mode
        || !modes.available_modes.iter().any(|available| *available.id.0 == *mode)
    {
        return;
    }
    if acp.set_mode(agent_id, child.clone(), mode).await.is_err() {
        log::warn!(
            "[worker-chats] worker chat {} kept its own mode",
            redact_session_id(&child.0)
        );
    }
}

#[cfg(test)]
#[path = "real_loop_tests.rs"]
mod real_loop_tests;

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
