import { toast } from 'sonner'
import { type LaunchCheckout, launchChat } from '@/components/agents/launcher/launch-chat'
import {
  hasPendingLauncherOptions,
  optionsToPending,
  overlayPendingLauncherOptions,
  type PendingLauncherOptions
} from '@/components/agents/pending-launcher-options'
import { seedComposerDraft } from '@/components/chat/use-composer-draft'
import type { ContentBlock, SessionId } from '@/lib/acp-api'
import { moveSessionTempFiles } from '@/lib/attachment-temp-cleanup'
import { logFrontendError } from '@/lib/log-api'
import { serverAdmitsRemoteWrites } from '@/lib/tauri-runtime'
import { workingCopyOf } from '@/lib/working-copy'
import { type AcpSession, type AcpState, configIdForAgentId, useAcpStore } from '@/stores/acp-store'
import { type ChatStartPick, useChatStartPickStore } from '@/stores/chat-start-pick-store'
import { useProjectStore } from '@/stores/project-store'
import { agentChatTabId, findPaneContainingTab, useWorkspaceStore } from '@/stores/workspace-store'
import type { Project } from '@/types/project'
import { discardEmptyChat, isEmptyStartChat } from './open-new-chat'

const SOURCE = 'chat.sendFromChatStart'

function log(level: 'info' | 'warn' | 'error', message: string): void {
  void logFrontendError({ level, source: SOURCE, message })
}

/** Where the first send of an empty chat runs. */
type ChatStartTarget =
  | { kind: 'stay' }
  | { kind: 'move'; checkout: LaunchCheckout }
  | { kind: 'new-worktree'; projectRoot: string; baseBranch: string }
  /** The pick cannot apply; the message is not sent. */
  | { kind: 'blocked'; message: string }

/**
 * Compare an empty chat's pick with the folder it runs in. Current checkout
 * and an existing worktree move the chat only when it runs elsewhere; New
 * worktree always makes one (only where the server admits writes).
 */
export function chatStartTarget(
  session: Pick<AcpSession, 'cwd'>,
  pick: ChatStartPick,
  project: Pick<Project, 'worktrees' | 'isGitRepo'> & { path: string }
): ChatStartTarget {
  const here = workingCopyOf(session.cwd, project)
  if (pick.isolationMode === 'worktree') {
    if (!project.isGitRepo || !serverAdmitsRemoteWrites()) return { kind: 'stay' }
    if (!pick.baseBranch) {
      return { kind: 'blocked', message: 'Pick a base branch for the new worktree.' }
    }
    return { kind: 'new-worktree', projectRoot: project.path, baseBranch: pick.baseBranch }
  }
  if (pick.isolationMode === 'existing') {
    const worktree = project.worktrees?.find((w) => w.id === pick.existingWorktreeId)
    if (!worktree || worktree.outsideProjectRoot === true) {
      return { kind: 'blocked', message: 'That worktree is no longer available.' }
    }
    if (here?.state === 'resolved' && here.worktreeId === worktree.id) return { kind: 'stay' }
    return {
      kind: 'move',
      checkout: {
        launchCwd: worktree.path,
        worktreePath: worktree.path,
        worktreeBranch: worktree.branch
      }
    }
  }
  if (here?.state === 'resolved' && here.kind === 'project') return { kind: 'stay' }
  return { kind: 'move', checkout: { launchCwd: project.path } }
}

/** The chat's agent config: an armed switch's target, else the live agent's, else the launch's. */
function chatConfigId(state: AcpState, session: AcpSession): string | null {
  if (session.switching?.toConfigId) return session.switching.toConfigId
  if (session.agentId) {
    const live = configIdForAgentId(state, session.agentId)
    if (live) return live
  }
  return (
    session.launchConfigId ??
    state.sessionIndex.find((entry) => entry.id === session.id)?.agentConfigId ??
    null
  )
}

/** The options on screen (the armed switch target's when one is armed) and the picks to carry. */
function shownOptions(
  state: AcpState,
  session: AcpSession,
  configId: string
): { shown: ReturnType<typeof overlayPendingLauncherOptions>; pending: PendingLauncherOptions } {
  if (session.switching) {
    const cache = state.agentOptionsCache[configId]
    const pending = session.switching.pendingOptions ?? { configValues: {} }
    const shown = overlayPendingLauncherOptions({
      models: cache?.models,
      modes: cache?.modes,
      configOptions: cache?.configOptions ?? [],
      pending
    })
    return { shown, pending: optionsToPending(shown) }
  }
  const shown = {
    models: session.models ?? null,
    modes: session.modes ?? null,
    configOptions: session.configOptions
  }
  return { shown, pending: optionsToPending(shown) }
}

function textOf(blocks: readonly ContentBlock[]): string {
  return blocks
    .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
    .join('')
    .trim()
}

/** What the first send of an empty chat did. */
export type ChatStartSend =
  /** The pick changes nothing: send as usual. */
  | 'normal'
  /** The chat starts again in the picked place with this message. */
  | 'restarted'
  /** The pick cannot apply: nothing was sent, the composer keeps its draft. */
  | 'blocked'

/**
 * Apply an empty chat's working-copy pick on its first send. The chat has no
 * history, so it starts again in the picked place through `launchChat` (the
 * launcher's path): an existing worktree or the current checkout starts the
 * session there; New worktree makes the worktree first while git's progress
 * streams into the timeline card. The new chat takes the old chat's tab in
 * place, with the message and the same agent and options.
 *
 * The old empty chat stays until the new one started. When the new worktree
 * fails, the tab goes back to it with the message text in its composer (and
 * its pasted files, still its own); nothing opens over other work.
 */
export function sendFromChatStart(args: {
  sessionId: SessionId
  blocks: ContentBlock[]
  displayBlocks?: ContentBlock[]
}): ChatStartSend {
  const { sessionId, blocks } = args
  const displayBlocks = args.displayBlocks ?? blocks
  const pick = useChatStartPickStore.getState().picks[sessionId]
  if (!pick) return 'normal'
  if (!isEmptyStartChat(sessionId)) {
    // The chat already started: the pick no longer applies.
    useChatStartPickStore.getState().clearPick(sessionId)
    return 'normal'
  }
  const state = useAcpStore.getState()
  const session = state.sessions[sessionId]
  const project = useProjectStore.getState().projects.find((p) => p.id === session?.projectId)
  if (!session || !project?.path) return 'normal'
  const target = chatStartTarget(session, pick, { ...project, path: project.path })
  if (target.kind === 'stay') {
    useChatStartPickStore.getState().clearPick(sessionId)
    return 'normal'
  }
  if (target.kind === 'blocked') {
    toast.error(target.message)
    log('warn', `Empty chat ${sessionId}: the pick (${pick.isolationMode}) cannot apply`)
    return 'blocked'
  }
  const configId = chatConfigId(state, session)
  if (!configId) {
    log('warn', `Empty chat ${sessionId}: no agent config; sent in place`)
    return 'normal'
  }

  const projectId = session.projectId
  const paneId = findPaneContainingTab(
    useWorkspaceStore.getState().root,
    agentChatTabId(sessionId)
  )?.id
  const { shown, pending } = shownOptions(state, session, configId)
  const { placeholderId, started } = launchChat({
    configId,
    projectId,
    paneId,
    checkout: target.kind === 'move' ? target.checkout : { launchCwd: target.projectRoot },
    newWorktree:
      target.kind === 'new-worktree'
        ? { projectRoot: target.projectRoot, baseBranch: target.baseBranch }
        : undefined,
    placeholder: { ...shown, initialUserBlocks: displayBlocks },
    // The new chat takes the old chat's tab (same mount, same place)…
    onOpened: (id) => useWorkspaceStore.getState().remapAgentChatSession(sessionId, id, paneId),
    // …and gives it back when it cannot start.
    onRollback: (id) => useWorkspaceStore.getState().remapAgentChatSession(id, sessionId, paneId),
    beforeStart: async () => ({
      blocks,
      pending: hasPendingLauncherOptions(pending) ? pending : null
    }),
    onWorktreeFailed: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create worktree')
      const text = textOf(displayBlocks)
      if (text) seedComposerDraft(projectId, sessionId, text)
      log('warn', `Empty chat ${sessionId}: the new worktree failed; the chat stays as it was`)
    }
  })
  log(
    'info',
    `Empty chat ${sessionId} starts again as ${placeholderId} (${target.kind === 'move' ? 'moved to the picked folder' : `new worktree from ${target.baseBranch}`})`
  )
  void started.then(
    (realId) => {
      // Pasted files were staged for the old chat; they belong to the new one.
      moveSessionTempFiles(sessionId, realId)
      void discardEmptyChat(sessionId)
    },
    () => {
      // A start failure after the worktree shows in the new chat with Retry;
      // the old empty chat is no longer on screen.
      const root = useWorkspaceStore.getState().root
      if (!findPaneContainingTab(root, agentChatTabId(sessionId))) {
        void discardEmptyChat(sessionId)
      }
    }
  )
  return 'restarted'
}
