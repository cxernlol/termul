import { toast } from 'sonner'
import { acpRenameQuickChat } from '@/lib/acp-api'
import { logFrontendError } from '@/lib/log-api'
import { useAcpStore } from '@/stores/acp-store'

/** Set a chat title in the index and in the open session record. */
function setChatTitle(sessionId: string, title: string): void {
  useAcpStore.setState((state) => ({
    sessionIndex: state.sessionIndex.map((entry) =>
      entry.id === sessionId ? { ...entry, title } : entry
    ),
    sessions: state.sessions[sessionId]
      ? { ...state.sessions, [sessionId]: { ...state.sessions[sessionId], title } }
      : state.sessions
  }))
}

/** The newest rename request per chat. An older request never rolls back. */
const latestRequest = new Map<string, number>()
/** The last title the host stored per chat, for the rollback of a failed rename. */
const confirmedTitle = new Map<string, string>()
let requestSeq = 0

/**
 * Rename a quick chat (a host `LocalAlias`). The new title shows at once. A
 * blank or unchanged title does nothing. Shared by the desktop Rail and the
 * phone Recents sheet.
 *
 * When the host refuses a rename, the title goes back to the last one the
 * host stored, and the user gets a toast. Only the newest request for the
 * chat rolls back: an older request that fails after a newer one started
 * cannot undo the newer title.
 */
export function renameQuickChat(sessionId: string, nextTitle: string, previous: string): void {
  const title = nextTitle.trim()
  if (!title || title === previous) return
  if (!latestRequest.has(sessionId)) confirmedTitle.set(sessionId, previous)
  const request = ++requestSeq
  latestRequest.set(sessionId, request)
  setChatTitle(sessionId, title)
  void acpRenameQuickChat(sessionId, title)
    .then(() => {
      confirmedTitle.set(sessionId, title)
      if (latestRequest.get(sessionId) === request) {
        latestRequest.delete(sessionId)
        confirmedTitle.delete(sessionId)
      }
    })
    .catch((error: unknown) => {
      void logFrontendError({
        level: 'error',
        source: 'quick-chat.rename',
        message: `Could not rename quick chat ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      })
      toast.error('Could not rename the chat. Try again.')
      if (latestRequest.get(sessionId) !== request) return
      setChatTitle(sessionId, confirmedTitle.get(sessionId) ?? previous)
      latestRequest.delete(sessionId)
      confirmedTitle.delete(sessionId)
    })
}
