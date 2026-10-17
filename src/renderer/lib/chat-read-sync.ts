/**
 * Renderer facade for the host's shared chat last-read markers. Every carrier
 * speaks `/ws` (the desktop over its IPC Channel), so one client serves the
 * desktop, a shared-live phone and a `termul-server` browser alike.
 */
import type {
  ChatReadMark,
  ChatReadsWatchDelta,
  ChatReadsWatchState
} from '@shared/types/web-protocol.types'
import { type AcpTransport, getAcpTransport } from '@/lib/acp-transport'
import { logFrontendError } from '@/lib/log-api'
import { isAfter, type LogPoint, useAgentChatUnreadStore } from '@/stores/agent-chat-unread-store'

const SOURCE = 'chat-read-sync'

const unanswered = new Map<string, LogPoint>()

function markPoint(mark: Pick<ChatReadMark, 'seq' | 'logEpoch'>): LogPoint {
  return { logEpoch: mark.logEpoch ?? null, seq: mark.seq }
}

function markPoints(state: ChatReadsWatchState | undefined): Record<string, LogPoint> {
  const points: Record<string, LogPoint> = {}
  for (const [sessionId, seq] of Object.entries(state?.marks ?? {})) {
    points[sessionId] = markPoint({ seq, logEpoch: state?.logEpochs?.[sessionId] })
  }
  return points
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Record that this renderer has seen the turn end `seq` of `sessionId`, in the
 * host log incarnation `logEpoch`. The acp-store calls it for every
 * `prompt_complete` it receives, live, replayed or recovered from a snapshot,
 * before the turn end is applied.
 */
export function noteTurnEndSeq(
  sessionId: string,
  seq: number | undefined,
  logEpoch: string | null
): void {
  if (!sessionId || typeof seq !== 'number' || seq <= 0) return
  useAgentChatUnreadStore.getState().noteTurnEnd(sessionId, { logEpoch, seq })
}

/** Start mirroring the host's read markers. Returns the stop. */
export function startChatReadSync(transport: AcpTransport = getAcpTransport()): () => void {
  const store = useAgentChatUnreadStore.getState
  const offMarks = transport.watches?.subscribe<ChatReadsWatchState, ChatReadsWatchDelta>(
    'chat_reads',
    {
      onState: (state) => store().setReadMarks(markPoints(state)),
      onDelta: (delta) => {
        if (delta?.sessionId && typeof delta.seq === 'number') {
          store().setReadMark(delta.sessionId, markPoint(delta))
        }
      },
      onRefused: (error) => {
        void logFrontendError({
          level: 'warn',
          source: SOURCE,
          message: `chat_reads watch refused; reads on other surfaces will not clear dots here: ${describe(error)}`
        })
      }
    }
  )
  return () => offMarks?.()
}

/**
 * Tell the host this surface read `sessionId` up to `read`. A point already in
 * flight for the session is not sent again; a failure is logged and lets the
 * next call retry.
 */
export function markChatRead(
  sessionId: string,
  read: LogPoint,
  transport: AcpTransport = getAcpTransport()
): void {
  if (!transport.markChatRead || !isAfter(read, unanswered.get(sessionId))) return
  unanswered.set(sessionId, read)
  const settle = () => {
    if (unanswered.get(sessionId) === read) unanswered.delete(sessionId)
  }
  transport.markChatRead(sessionId, read.seq, read.logEpoch).then(
    (mark) => {
      settle()
      // Replies race the watch deltas, so a reply only ever raises the marker.
      const store = useAgentChatUnreadStore.getState()
      const point = markPoint(mark)
      if (isAfter(point, store.sharedRead[mark.sessionId])) {
        store.setReadMark(mark.sessionId, point)
      }
    },
    (error: unknown) => {
      settle()
      void logFrontendError({
        level: 'warn',
        source: SOURCE,
        message: `mark_chat_read failed for a chat at seq ${read.seq}: ${describe(error)}`
      })
    }
  )
}
