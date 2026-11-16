import type { SessionId } from '@/lib/acp-api'
import type { AcpState } from '@/stores/acp-store'

/**
 * `isEmptyStartChat` on a given state, for store selectors. Reads a
 * partial state the way the composer's other selectors do.
 */
export function chatNotStarted(
  state: Partial<Pick<AcpState, 'sessions' | 'messages' | 'promptQueues'>>,
  sessionId: SessionId
): boolean {
  const session = state.sessions?.[sessionId]
  if (!session) return false
  if (session.status === 'closed' || session.status === 'error') return false
  if (session.activeTurn || session.openTurnId) return false
  if ((state.promptQueues?.[sessionId]?.length ?? 0) > 0) return false
  return (state.messages?.[sessionId]?.length ?? 0) === 0
}
