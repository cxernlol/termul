import { toast } from 'sonner'
import { logFrontendError } from '@/lib/log-api'
import { conversationDeleteIds } from '@/lib/session-chain'
import { useAcpStore } from '@/stores/acp-store'
import { liveSwitchSources } from '@/stores/acp-store/shared-state'

/**
 * Delete a chat and every session folded into it (one conversation). Call it
 * only after the user confirms. Membership is read now, from the FULL index:
 * a switch that ended while the confirm was open adds a session, and a member
 * outside the current worktree scope would otherwise come back as its own
 * row. Project scoping keeps a malformed cross-project edge from deleting
 * another project's transcript; in-flight switch targets are swept too.
 * Returns the ids it deletes, so a caller can close a view of any of them.
 */
export function deleteConversation(chatId: string, logSource: string): ReadonlySet<string> {
  const { sessionIndex, deleteHistorySession } = useAcpStore.getState()
  const deletedIds = new Set(conversationDeleteIds(sessionIndex, chatId, liveSwitchSources))
  for (const memberId of deletedIds) {
    void deleteHistorySession(memberId).catch(() => {
      // Ids only: never the chat title, prompt text or error text.
      void logFrontendError({
        level: 'warn',
        source: logSource,
        message: `Failed to delete chat history session ${memberId}`
      })
      toast.error('Could not delete that chat. Try again.')
    })
  }
  return deletedIds
}
