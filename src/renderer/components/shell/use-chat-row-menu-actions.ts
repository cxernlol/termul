import { useCallback } from 'react'
import { toast } from 'sonner'
import { deleteConversation } from '@/components/chat/delete-conversation'
import type { ProjectChatEntry } from '@/components/sidebar/project-chat-row'
import { openerApi } from '@/lib/api'
import { copyChatReference } from '@/lib/chat-reference'
import { copyTextWithToast } from '@/lib/copy-text'
import { logFrontendError } from '@/lib/log-api'
import { openAgentChatPlaced } from '@/lib/open-agent-chat'
import { openTerminalAtCwd } from '@/lib/terminal-spawn'
import { useWorkspaceStore } from '@/stores/workspace-store'

const LOG_SOURCE = 'shell-chat-row-menu'

export interface ChatRowMenuActions {
  onOpenInSplit: (entry: ProjectChatEntry) => void
  onOpenTerminal: (entry: ProjectChatEntry) => Promise<void>
  onOpenInFileExplorer: (cwd: string) => Promise<void>
  onCopyPath: (cwd: string) => Promise<void>
  onCopyChatReference: (entry: ProjectChatEntry) => Promise<void>
  onCopyChatId: (entry: ProjectChatEntry) => Promise<void>
  /** Deletes the whole conversation. Call it only after the user confirms. */
  onDelete: (entry: ProjectChatEntry) => void
}

/**
 * The actions of the Rail chat row menu (Paper "Chat row menu"): open in a
 * split, open a terminal or the folder at the chat's cwd, copy its path,
 * reference or id, and delete it.
 */
export function useChatRowMenuActions(projectId: string): ChatRowMenuActions {
  const onOpenInSplit = useCallback((entry: ProjectChatEntry) => {
    // Read at call time: the active pane can change after the render.
    const { activePaneId } = useWorkspaceStore.getState()
    openAgentChatPlaced(entry.id, LOG_SOURCE, { paneId: activePaneId, zone: 'right' })
  }, [])

  const onOpenTerminal = useCallback(
    async (entry: ProjectChatEntry) => {
      if (!entry.cwd) return
      const outcome = await openTerminalAtCwd(projectId, entry.cwd)
      if (outcome.status === 'opened') return
      if (outcome.status === 'no-pane') {
        toast.error('No active pane', { description: 'Open a pane first, then try again.' })
        return
      }
      toast.error('Could not open a terminal', {
        description: outcome.error || 'Try again.'
      })
    },
    [projectId]
  )

  const onCopyPath = useCallback(async (cwd: string) => {
    await copyTextWithToast(cwd, {
      title: 'Path copied',
      description: cwd,
      failureTitle: 'Could not copy the path',
      logSource: LOG_SOURCE
    })
  }, [])

  const onOpenInFileExplorer = useCallback(
    async (cwd: string) => {
      const result = await openerApi.revealInFileManager(cwd)
      if (result.success) return
      // The browser client has no file manager: copy the path instead.
      if (result.code === 'WEB_UNSUPPORTED') {
        await onCopyPath(cwd)
        return
      }
      void logFrontendError({
        level: 'warn',
        source: LOG_SOURCE,
        message: `[rail-chats] reveal in file manager failed (code=${result.code ?? 'UNKNOWN'})`
      })
      toast.error('Could not open the folder', { description: cwd })
    },
    [onCopyPath]
  )

  const onCopyChatReference = useCallback(async (entry: ProjectChatEntry) => {
    await copyChatReference(entry.id, entry.title, LOG_SOURCE)
  }, [])

  const onCopyChatId = useCallback(async (entry: ProjectChatEntry) => {
    await copyTextWithToast(entry.id, {
      title: 'Chat ID copied',
      description: entry.id,
      failureTitle: 'Could not copy the chat ID',
      logSource: LOG_SOURCE
    })
  }, [])

  const onDelete = useCallback(
    (entry: ProjectChatEntry) => deleteConversation(entry.id, LOG_SOURCE),
    []
  )

  return {
    onOpenInSplit,
    onOpenTerminal,
    onOpenInFileExplorer,
    onCopyPath,
    onCopyChatReference,
    onCopyChatId,
    onDelete
  }
}
