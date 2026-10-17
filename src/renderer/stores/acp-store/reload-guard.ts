import type { SessionId } from '@/lib/acp-api'
import { ephemeralSessionIds } from './ephemeral-ids'
import type { AcpState } from './types'

/**
 * Chats whose old agent process is being released on purpose.
 * `_onSessionClosed` must not cancel the reopen that follows, and must not
 * drop the transcript the open chat is still showing.
 */
export const reloadInFlight = new Set<SessionId>()

/**
 * Other open chats on `agentId`. Releasing `sessionId` may stop the process
 * only when this is 0; otherwise only the session is closed on it.
 */
export function liveSiblingCount(
  sessions: AcpState['sessions'],
  sessionId: SessionId,
  agentId: string
): number {
  return Object.values(sessions).filter(
    (other) =>
      other.id !== sessionId &&
      other.agentId === agentId &&
      other.status !== 'closed' &&
      !ephemeralSessionIds.has(other.id)
  ).length
}
