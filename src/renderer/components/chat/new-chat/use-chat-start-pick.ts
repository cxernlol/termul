import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  type LaunchIsolationMode,
  persistedIsolationMode
} from '@/components/agents/launcher/prepare-launch-worktree'
import {
  type BaseBranchChoices,
  useBaseBranchChoices
} from '@/components/agents/launcher/use-base-branch-choices'
import { useCurrentAgentConfigId } from '@/components/chat/agent-model-selector/use-agent-switch'
import { useServerAdmitsRemoteWrites } from '@/hooks/use-server-admits-remote-writes'
import { logFrontendError } from '@/lib/log-api'
import { workingCopyOf } from '@/lib/working-copy'
import { type AcpSession, persistComposerOptions } from '@/stores/acp-store'
import { readComposerOptions } from '@/stores/acp-store/composer-options'
import { type ChatStartPick, useChatStartPickStore } from '@/stores/chat-start-pick-store'
import { useProjectStore } from '@/stores/project-store'
import type { Worktree } from '@/types/project'

const EMPTY_WORKTREES: readonly Worktree[] = []

export interface ChatStartPickState extends BaseBranchChoices {
  /** A git project whose folder the chat runs in is known: the row is interactive. */
  interactive: boolean
  serverAdmitsWrites: boolean
  worktrees: readonly Worktree[]
  pick: ChatStartPick
  workspace: {
    isolationMode: LaunchIsolationMode
    setIsolationMode: Dispatch<SetStateAction<LaunchIsolationMode>>
    existingWorktreeId: string | null
    setExistingWorktreeId: Dispatch<SetStateAction<string | null>>
  }
  setBaseBranch: (branch: string | null) => void
}

function resolveAction<T>(next: SetStateAction<T>, current: T): T {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next
}

/**
 * The working-copy pick of an empty chat's context row. It starts at the
 * folder the chat runs in (its worktree, else Current checkout) and, like the
 * launcher, at the agent's saved New worktree preference when the chat runs
 * in the project folder. Changes are only recorded here and in the agent's
 * saved options (`lastComposerOptions`); the first send applies them
 * (`sendFromChatStart`).
 */
export function useChatStartPick(
  session: Pick<AcpSession, 'id' | 'projectId' | 'cwd'>
): ChatStartPickState {
  const { id: sessionId, projectId, cwd } = session
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  const configId = useCurrentAgentConfigId(sessionId)
  const serverAdmitsWrites = useServerAdmitsRemoteWrites()
  const isGitRepo = Boolean(project?.isGitRepo)
  const canUseWorktree = isGitRepo && serverAdmitsWrites
  const here = workingCopyOf(cwd, project)
  const inProjectFolder = here?.state === 'resolved' && here.kind === 'project'
  const hereWorktreeId =
    here?.state === 'resolved' && here.kind === 'worktree' ? (here.worktreeId ?? null) : null
  const worktrees = project?.worktrees ?? EMPTY_WORKTREES
  const firstSelectable = worktrees.find((w) => w.outsideProjectRoot !== true)?.id ?? null

  const fallback = useMemo<ChatStartPick>(
    () =>
      hereWorktreeId
        ? { isolationMode: 'existing', existingWorktreeId: hereWorktreeId, baseBranch: null }
        : { isolationMode: 'current', existingWorktreeId: null, baseBranch: null },
    [hereWorktreeId]
  )
  const stored = useChatStartPickStore((s) => s.picks[sessionId])
  const pick = stored ?? fallback

  const update = useCallback(
    (patch: (current: ChatStartPick) => Partial<ChatStartPick>) => {
      const current = useChatStartPickStore.getState().picks[sessionId] ?? fallback
      const next = { ...current, ...patch(current) }
      if (
        next.isolationMode === current.isolationMode &&
        next.existingWorktreeId === current.existingWorktreeId &&
        next.baseBranch === current.baseBranch &&
        useChatStartPickStore.getState().picks[sessionId]
      ) {
        return
      }
      useChatStartPickStore.getState().setPick(sessionId, next)
      // The next chat starts with the same worktree preference (launcher parity).
      if (configId && canUseWorktree) {
        persistComposerOptions(configId, {
          isolationMode: persistedIsolationMode(next.isolationMode),
          baseBranch: next.isolationMode === 'worktree' ? next.baseBranch : null
        })
      }
    },
    [sessionId, fallback, configId, canUseWorktree]
  )

  const setIsolationMode = useCallback<Dispatch<SetStateAction<LaunchIsolationMode>>>(
    (action) =>
      update((current) => {
        const isolationMode = resolveAction(action, current.isolationMode)
        return {
          isolationMode,
          existingWorktreeId:
            isolationMode === 'existing'
              ? (current.existingWorktreeId ?? hereWorktreeId ?? firstSelectable)
              : current.existingWorktreeId
        }
      }),
    [update, hereWorktreeId, firstSelectable]
  )
  const setExistingWorktreeId = useCallback<Dispatch<SetStateAction<string | null>>>(
    (action) =>
      update((current) => ({
        existingWorktreeId: resolveAction(action, current.existingWorktreeId)
      })),
    [update]
  )
  const setBaseBranch = useCallback(
    (baseBranch: string | null) => update(() => ({ baseBranch })),
    [update]
  )

  // Launcher parity: a saved New worktree preference applies to a chat that
  // runs in the project folder. Once per chat, and never over a user pick.
  const restoredForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!configId || !canUseWorktree || !inProjectFolder) return
    if (restoredForRef.current === sessionId) return
    restoredForRef.current = sessionId
    void readComposerOptions(configId)
      .then((saved) => {
        if (useChatStartPickStore.getState().picks[sessionId]) return
        if (saved?.isolationMode !== 'worktree' || !saved.baseBranch) return
        useChatStartPickStore.getState().setPick(sessionId, {
          isolationMode: 'worktree',
          existingWorktreeId: null,
          baseBranch: saved.baseBranch
        })
      })
      .catch((err: unknown) => {
        void logFrontendError({
          level: 'warn',
          source: 'chatStart.restorePick',
          message: `Could not read the saved worktree preference: ${String(err)}`
        })
      })
  }, [configId, canUseWorktree, inProjectFolder, sessionId])

  const choices = useBaseBranchChoices({
    projectRoot: project?.path,
    canUseWorktree,
    projectGitBranch: project?.gitBranch ?? null,
    isolationMode: pick.isolationMode,
    baseBranch: pick.baseBranch,
    setBaseBranch,
    logSource: 'chatStart.resolveBaseBranch'
  })

  return {
    ...choices,
    interactive: isGitRepo && here?.state === 'resolved',
    serverAdmitsWrites,
    worktrees,
    pick,
    workspace: {
      isolationMode: pick.isolationMode,
      setIsolationMode,
      existingWorktreeId: pick.existingWorktreeId,
      setExistingWorktreeId
    },
    setBaseBranch
  }
}
