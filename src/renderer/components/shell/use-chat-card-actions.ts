import { useCallback } from 'react'
import { toast } from 'sonner'
import type { ProjectChatEntry } from '@/components/sidebar/project-chat-row'
import { logFrontendError } from '@/lib/log-api'
import { openNoProjectChat } from '@/lib/no-project-chat'
import { openAgentChatInOwnProject } from '@/lib/open-agent-chat'
import { useAcpStore } from '@/stores/acp-store'

const LOG_SOURCE = 'shell-chat-open'

export interface ChatCardActions {
  onOpen: (entry: ProjectChatEntry) => void
}

/**
 * Opens or resumes a chat card's chat in a tab (the Rail rows and the command
 * palette Chats group), with one warn log per failed open. A chat of another
 * project (the Rail lists every project's chats) switches to that project
 * first, so its tab lands in its own pane tree.
 */
export function useChatCardActions(): ChatCardActions {
  const openHistorySession = useAcpStore((s) => s.openHistorySession)

  const onOpen = useCallback(
    (entry: ProjectChatEntry) => {
      const fail = (error: unknown): void => {
        // Never the chat title or any prompt text: the error message only.
        const reason = error instanceof Error ? error.message : 'unknown error'
        void logFrontendError({
          level: 'warn',
          source: LOG_SOURCE,
          message: `[shell-chats] open chat failed: ${reason}`
        })
        toast.error('Could not open that chat. Try again.')
      }
      try {
        const opening = openHistorySession(entry.id)
        if (!openNoProjectChat(entry.id, LOG_SOURCE)) {
          openAgentChatInOwnProject(entry.id, LOG_SOURCE)
        }
        void opening.catch(fail)
      } catch (error) {
        fail(error)
      }
    },
    [openHistorySession]
  )

  return { onOpen }
}
