import { PersistenceKeys } from '@shared/types/persistence.types'
import { UNASSIGNED_PROJECT_ID } from '@shared/types/web-projects.types'
import { toast } from 'sonner'
import { type LaunchCheckout, launchChat } from '@/components/agents/launcher/launch-chat'
import {
  emptyPendingLauncherOptions,
  hasPendingLauncherOptions,
  optionsToPending,
  overlayPendingLauncherOptions,
  type PendingLauncherOptions,
  restoredLauncherOptions
} from '@/components/agents/pending-launcher-options'
import { newChatKind } from '@/components/shell/open-new-chat'
import type { SessionId } from '@/lib/acp-api'
import { persistenceApi } from '@/lib/api'
import { logFrontendError } from '@/lib/log-api'
import { getActiveWorktreeForProject, getDefaultCwdForProject } from '@/lib/worktree-context'
import {
  type AgentOptionsCacheEntry,
  ChatLaunchCancelledError,
  isAuthRetriableSessionError,
  useAcpStore
} from '@/stores/acp-store'
import { isScopedOption, readComposerOptions } from '@/stores/acp-store/composer-options'
import { useChatStartPickStore } from '@/stores/chat-start-pick-store'
import { useProjectStore } from '@/stores/project-store'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { agentChatTabId, findPaneById, useWorkspaceStore } from '@/stores/workspace-store'
import { rememberNewChatAgent, resolveNewChatAgent } from './new-chat-agent'

const SOURCE = 'chat.openNewChat'

/** Why a new chat was asked for (logged with every start). */
export type NewChatReason =
  | 'rail'
  | 'project-row'
  | 'shortcut'
  | 'menu'
  | 'command-palette'
  | 'stopped-chat'
  | 'github-handoff'
  | 'worktree-failed'

export interface OpenNewChatRequest {
  /** The pane the chat opens in; absent means the focused pane. */
  paneId?: string | null
  /** The project the chat belongs to; absent means the active project. */
  projectId?: string | null
  reason: NewChatReason
}

export type OpenNewChatResult =
  /** The pane already showed an empty chat of this project; it is focused. */
  | { kind: 'focused'; sessionId: SessionId }
  /** A new empty chat opened (its id is the launch placeholder's). */
  | { kind: 'opened'; sessionId: SessionId }
  /** No agent can start without a choice: the launcher opened instead. */
  | { kind: 'launcher' }
  | { kind: 'skipped' }

function log(level: 'info' | 'warn' | 'error', message: string): void {
  void logFrontendError({ level, source: SOURCE, message })
}

/**
 * A chat that has not started: no messages, nothing queued for the agent, no
 * turn, still usable. A message sent before the agent is ready waits in the
 * queue, so a chat with a queued message is not empty.
 */
export function isEmptyStartChat(sessionId: SessionId): boolean {
  const state = useAcpStore.getState()
  const session = state.sessions[sessionId]
  if (!session) return false
  if (session.status === 'closed' || session.status === 'error') return false
  if (session.activeTurn || session.openTurnId) return false
  if ((state.promptQueues[sessionId]?.length ?? 0) > 0) return false
  return (state.messages[sessionId]?.length ?? 0) === 0
}

/** The text of the messages waiting in a chat's queue. */
function queuedText(sessionId: SessionId): string {
  return (useAcpStore.getState().promptQueues[sessionId] ?? [])
    .map((item) =>
      (item.displayBlocks ?? item.blocks)
        .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
        .join('')
        .trim()
    )
    .filter(Boolean)
    .join('\n\n')
}

/** The empty chat of `projectId` the pane shows now, if any. */
function emptyChatInPane(paneId: string, projectId: string): SessionId | null {
  const pane = findPaneById(useWorkspaceStore.getState().root, paneId)
  if (pane?.type !== 'leaf') return null
  const tab = pane.tabs.find((t) => t.id === pane.activeTabId)
  if (tab?.type !== 'agent-chat') return null
  const session = useAcpStore.getState().sessions[tab.sessionId]
  return session?.projectId === projectId && isEmptyStartChat(tab.sessionId) ? tab.sessionId : null
}

/**
 * Forget an empty chat that will not be used: it has no messages, so nothing
 * is lost. A launch still in flight is called off (the deletion tombstone),
 * a live session is closed first.
 */
export async function discardEmptyChat(sessionId: SessionId): Promise<void> {
  useChatStartPickStore.getState().clearPick(sessionId)
  const store = useAcpStore.getState()
  try {
    if (!store.launchingSessionIds[sessionId]) await store.closeSession(sessionId)
    await useAcpStore.getState().deleteHistorySession(sessionId)
  } catch (err) {
    log(
      'warn',
      `Could not discard the empty chat ${sessionId}: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/** The saved composer picks of an agent, checked against its cached options. */
async function savedPicks(configId: string): Promise<PendingLauncherOptions> {
  const saved = await readComposerOptions(configId).catch((err: unknown) => {
    log(
      'warn',
      `New chat on ${configId}: could not read the saved options: ${err instanceof Error ? err.message : String(err)}`
    )
    return null
  })
  if (!saved) return emptyPendingLauncherOptions()
  const cache = useAcpStore.getState().agentOptionsCache[configId]
  return restoredLauncherOptions({
    saved,
    pick: null,
    models: cache?.models,
    modes: cache?.modes,
    configOptions: cache?.configOptions ?? [],
    onDrop: (what) => log('warn', `New chat on ${configId}: dropped the saved ${what}`)
  })
}

/**
 * The options the new chat shows before its session starts: the agent's
 * cached options with the saved picks on top. The cache holds the options of
 * the agent's last session, which may run another model. Its scoped values
 * (effort, Fast) belong to that model, so for another picked model they are
 * dropped unless the saved record has that model's own value; the session
 * then shows the model's defaults (the launcher's rule, `launchPending`).
 */
export function newChatPlaceholderOptions(
  cache: Pick<AgentOptionsCacheEntry, 'models' | 'modes' | 'configOptions'> | undefined,
  picks: PendingLauncherOptions
): ReturnType<typeof overlayPendingLauncherOptions> {
  const cached = {
    models: cache?.models,
    modes: cache?.modes,
    configOptions: cache?.configOptions ?? []
  }
  const cachedModel = optionsToPending(cached).modelId
  const otherModel = picks.modelId != null && picks.modelId !== cachedModel
  const configOptions = otherModel
    ? cached.configOptions.filter(
        (option) => !isScopedOption(option) || picks.configValues[option.id] != null
      )
    : cached.configOptions
  return overlayPendingLauncherOptions({ ...cached, configOptions, pending: picks })
}

/** The checkout of the Workspace-switcher pick, else the project root. */
function pickedCheckout(projectId: string): LaunchCheckout | null {
  const root = getDefaultCwdForProject(projectId)
  if (!root) return null
  const worktree = getActiveWorktreeForProject(projectId)
  return worktree
    ? { launchCwd: worktree.path, worktreePath: worktree.path, worktreeBranch: worktree.branch }
    : { launchCwd: root }
}

const inFlight = new Map<string, Promise<OpenNewChatResult>>()

/**
 * The one way to start a chat: a new EMPTY chat in the pane, on the last
 * picked agent with its saved options (model, mode, option values), in the
 * Workspace-switcher pick (else the project root). The chat tab opens at once
 * on a launch placeholder (`launchChat`); the session starts behind it, and a
 * start failure shows in the chat with Retry. A message typed before the
 * session is ready waits in the chat's queue.
 *
 * When the pane already shows an empty chat of the project, that chat is
 * focused instead. The launcher opens only for states a chat cannot show: no
 * agent can start without a choice (none configured or installed; on web an
 * agent nobody configured never spawns, #840), or the agent needs a sign-in.
 */
/**
 * No active project: the same empty chat as a project New chat (last agent
 * and its saved model), persisted as a quick chat. The host owns the folder.
 * This path does not open the agent launcher.
 */
function openQuickNewChat(reason: NewChatReason): Promise<OpenNewChatResult> {
  const view = useQuickChatStore.getState().view
  if (view.mode === 'chat' && !view.readOnly && isEmptyStartChat(view.sessionId)) {
    const session = useAcpStore.getState().sessions[view.sessionId]
    if (session?.kind === 'quick') {
      log('info', `New chat (reason=${reason}) focused the empty quick chat ${view.sessionId}`)
      return Promise.resolve({ kind: 'focused', sessionId: view.sessionId })
    }
  }
  const pending = inFlight.get('quick')
  if (pending) return pending
  const run = startQuick(reason).finally(() => inFlight.delete('quick'))
  inFlight.set('quick', run)
  return run
}

async function startQuick(reason: NewChatReason): Promise<OpenNewChatResult> {
  const agent = await resolveNewChatAgent()
  if (agent.kind === 'none') {
    toast.error('No agent is ready to start a chat')
    log('warn', `Quick chat (reason=${reason}) skipped: ${agent.reason}`)
    return { kind: 'skipped' }
  }
  if (agent.configToSave) {
    try {
      await useAcpStore.getState().saveAgentConfig(agent.configToSave)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Could not set up ${agent.name}: ${message}`)
      log('warn', `Quick chat (reason=${reason}) could not save ${agent.configId}: ${message}`)
      return { kind: 'skipped' }
    }
  }
  rememberNewChatAgent(agent.configId)
  const picks = await savedPicks(agent.configId)
  const cache = useAcpStore.getState().agentOptionsCache[agent.configId]
  const shown = newChatPlaceholderOptions(cache, picks)
  const store = useAcpStore.getState()
  const placeholderId = store.createLaunchPlaceholder({
    configId: agent.configId,
    cwd: '',
    projectId: UNASSIGNED_PROJECT_ID,
    models: shown.models,
    modes: shown.modes,
    configOptions: shown.configOptions,
    kind: 'quick'
  })
  useQuickChatStore.getState().openChat(placeholderId)
  const workspace = useWorkspaceStore.getState()
  if (workspace.agentLauncherPaneId) workspace.hideAgentLauncher()
  log(
    'info',
    `Quick chat ${placeholderId} (reason=${reason}) opened on ${agent.configId} with no project`
  )
  void store
    .finalizeChatLaunch({
      placeholderId,
      configId: agent.configId,
      cwd: '',
      projectId: UNASSIGNED_PROJECT_ID,
      pending: hasPendingLauncherOptions(picks) ? picks : null,
      initialText: null,
      initialBlocks: null,
      adoptSession: (from, to) => {
        const current = useQuickChatStore.getState().view
        if (current.mode === 'chat' && current.sessionId === from) {
          useQuickChatStore.getState().openChat(to)
        }
      }
    })
    .then((sessionId) => log('info', `Quick chat ${placeholderId} started as ${sessionId}`))
    .catch((err: unknown) => {
      if (err instanceof ChatLaunchCancelledError) return
      // The empty chat shows the error and Retry. This path does not open the launcher.
      log(
        'warn',
        `Quick chat ${placeholderId} did not start: ${err instanceof Error ? err.message : String(err)}`
      )
    })
  return { kind: 'opened', sessionId: placeholderId }
}

export function openNewChat(request: OpenNewChatRequest): Promise<OpenNewChatResult> {
  const workspace = useWorkspaceStore.getState()
  const paneId = request.paneId ?? workspace.activePaneId
  const explicitProject = request.projectId !== undefined
  const projectId = explicitProject ? request.projectId : useProjectStore.getState().activeProjectId
  if (newChatKind(projectId ?? '') === 'quick') {
    return openQuickNewChat(request.reason)
  }
  if (!paneId || !projectId) {
    log('warn', `New chat (reason=${request.reason}) skipped: no pane or no active project`)
    return Promise.resolve({ kind: 'skipped' })
  }
  const existing = emptyChatInPane(paneId, projectId)
  if (existing) {
    if (workspace.agentLauncherPaneId === paneId) workspace.hideAgentLauncher()
    workspace.addAgentChatTab(existing, paneId)
    log('info', `New chat (reason=${request.reason}) focused the empty chat ${existing}`)
    return Promise.resolve({ kind: 'focused', sessionId: existing })
  }
  const key = `${paneId}:${projectId}`
  const pending = inFlight.get(key)
  if (pending) return pending
  const run = start(paneId, projectId, request.reason).finally(() => inFlight.delete(key))
  inFlight.set(key, run)
  return run
}

async function start(
  paneId: string,
  projectId: string,
  reason: NewChatReason
): Promise<OpenNewChatResult> {
  const agent = await resolveNewChatAgent()
  if (agent.kind === 'none') {
    useWorkspaceStore.getState().showAgentLauncher(paneId)
    log('info', `New chat (reason=${reason}) opened the launcher: ${agent.reason}`)
    return { kind: 'launcher' }
  }
  const checkout = pickedCheckout(projectId)
  if (!checkout) {
    toast.error('Could not start a chat: the project has no folder')
    log('warn', `New chat (reason=${reason}) skipped: project ${projectId} has no folder`)
    return { kind: 'skipped' }
  }
  if (agent.configToSave) {
    try {
      await useAcpStore.getState().saveAgentConfig(agent.configToSave)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error(`Could not set up ${agent.name}: ${message}`)
      log('warn', `New chat (reason=${reason}) could not save ${agent.configId}: ${message}`)
      useWorkspaceStore.getState().showAgentLauncher(paneId)
      return { kind: 'launcher' }
    }
  }
  rememberNewChatAgent(agent.configId)

  const picks = await savedPicks(agent.configId)
  // The awaits above can outlive the pane or the project the user was in.
  const now = useWorkspaceStore.getState()
  if (
    findPaneById(now.root, paneId)?.type !== 'leaf' ||
    useProjectStore.getState().activeProjectId !== projectId
  ) {
    log('info', `New chat (reason=${reason}) skipped: its pane or project changed while it started`)
    return { kind: 'skipped' }
  }
  const cache = useAcpStore.getState().agentOptionsCache[agent.configId]
  const shown = newChatPlaceholderOptions(cache, picks)
  const dropped = (cache?.configOptions.length ?? 0) - shown.configOptions.length
  if (dropped > 0) {
    log(
      'info',
      `New chat on ${agent.configId}: ${dropped} cached option(s) of another model hidden until the session starts`
    )
  }
  const workspace = useWorkspaceStore.getState()
  if (workspace.agentLauncherPaneId === paneId) workspace.hideAgentLauncher()
  const { placeholderId, started } = launchChat({
    configId: agent.configId,
    projectId,
    paneId,
    checkout,
    placeholder: shown,
    beforeStart: async () => ({ pending: hasPendingLauncherOptions(picks) ? picks : null })
  })
  log(
    'info',
    `New chat ${placeholderId} (reason=${reason}) opened on ${agent.configId} in the ${checkout.worktreePath ? 'picked worktree' : 'project folder'}`
  )
  void started
    .then((sessionId) => log('info', `New chat ${placeholderId} started as ${sessionId}`))
    .catch((err: unknown) => {
      if (err instanceof ChatLaunchCancelledError) return
      if (!isAuthRetriableSessionError(err)) return // the chat shows the error and Retry
      // A sign-in has no home in the chat: the launcher shows the agent's
      // sign-in methods. The failed empty chat goes away under it; a message
      // that waited in its queue moves to the launcher's draft.
      const waiting = queuedText(placeholderId)
      // The launcher reads its draft when it mounts: write it first.
      const keepDraft = waiting
        ? persistenceApi
            .write(PersistenceKeys.lastLaunchDraft(projectId), waiting)
            .then(() => undefined)
            .catch((writeErr: unknown) =>
              log(
                'warn',
                `New chat ${placeholderId}: could not keep the queued message: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`
              )
            )
        : Promise.resolve()
      return keepDraft.then(() => {
        log(
          'info',
          `New chat ${placeholderId} needs a sign-in to ${agent.configId}: opened the launcher${waiting ? ' with the queued message as its draft' : ''}`
        )
        useWorkspaceStore.getState().removeTab(agentChatTabId(placeholderId))
        void discardEmptyChat(placeholderId)
        useWorkspaceStore.getState().showAgentLauncher(paneId)
      })
    })
  return { kind: 'opened', sessionId: placeholderId }
}
