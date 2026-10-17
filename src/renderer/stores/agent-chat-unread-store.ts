import { create } from 'zustand'

/**
 * A position in one incarnation of a chat's host session log. `seq` counts
 * within the incarnation `logEpoch` names (`null` when the transport has none):
 * a host restart can start a new epoch whose seqs restart.
 */
export interface LogPoint {
  logEpoch: string | null
  seq: number
}

/**
 * Whether `point` comes after `earlier` (`null`: nothing seen yet). A point in
 * another epoch counts as after: a renderer only meets a new epoch once the
 * host moved to it, and the old epoch's seqs mean nothing in the new log.
 */
export function isAfter(point: LogPoint, earlier: LogPoint | null | undefined): boolean {
  return !earlier || point.logEpoch !== earlier.logEpoch || point.seq > earlier.seq
}

interface AgentChatUnreadState {
  /** Sessions whose turn finished while they were not the active chat ("New activity"). */
  unread: Record<string, true>
  /**
   * Per dot, the `seenTurnEnd` when its newest turn started (`null`: none
   * seen). A read elsewhere can clear the dot only once a turn end after this
   * was seen here.
   */
  unreadSince: Record<string, LogPoint | null>
  /** Host-stamped session-log point of the newest turn end this renderer has seen. */
  seenTurnEnd: Record<string, LogPoint>
  /**
   * The host's shared last-read marker: the newest point any surface (this
   * one, a shared-live phone, another browser) has read. Mirrors the
   * `chat_reads` watch.
   */
  sharedRead: Record<string, LogPoint>
  /** `since` defaults to the newest turn end seen now. */
  markUnread: (sessionId: string, since?: LogPoint | null) => void
  clearUnread: (sessionId: string) => void
  noteTurnEnd: (sessionId: string, point: LogPoint) => void
  setReadMarks: (marks: Record<string, LogPoint>) => void
  setReadMark: (sessionId: string, point: LogPoint) => void
}

type DotMaps = Pick<AgentChatUnreadState, 'unread' | 'unreadSince' | 'seenTurnEnd' | 'sharedRead'>

function readElsewhere(state: DotMaps, sessionId: string, since: LogPoint | null): boolean {
  const turnEnd = state.seenTurnEnd[sessionId]
  const read = state.sharedRead[sessionId]
  return (
    turnEnd !== undefined &&
    isAfter(turnEnd, since) &&
    read !== undefined &&
    read.logEpoch === turnEnd.logEpoch &&
    read.seq >= turnEnd.seq
  )
}

function withoutReadDots(state: DotMaps): Pick<DotMaps, 'unread' | 'unreadSince'> {
  let { unread, unreadSince } = state
  for (const sessionId of Object.keys(state.unread)) {
    if (!readElsewhere(state, sessionId, state.unreadSince[sessionId] ?? null)) continue
    if (unread === state.unread) {
      unread = { ...state.unread }
      unreadSince = { ...state.unreadSince }
    }
    delete unread[sessionId]
    delete unreadSince[sessionId]
  }
  return { unread, unreadSince }
}

/**
 * The single owner of the per-session "Done" ("New activity") flag. The desktop
 * `AgentChatTabInline` and the mobile Recents rows both read it, so a chat's
 * tab and card can never disagree. It is set and cleared by the one shell-level
 * `useAgentChatUnreadTracker` mount (`useShellUnreadTracker`), plus
 * `deleteHistorySession`.
 *
 * Lifetime: a flag is set when a turn finishes (or is cancelled) while the chat
 * is no pane's active tab. It clears when the chat becomes a pane's active tab,
 * when the host's shared last-read marker reaches the turn end that raised it
 * (the chat was read on another surface), or when the chat is deleted. It
 * survives the session leaving the live set and project switches. Never
 * persisted, so an app restart resets it.
 */
export const useAgentChatUnreadStore = create<AgentChatUnreadState>((set) => ({
  unread: {},
  unreadSince: {},
  seenTurnEnd: {},
  sharedRead: {},
  markUnread: (sessionId, sinceArg) => {
    if (!sessionId) return
    set((state) => {
      const since = sinceArg === undefined ? (state.seenTurnEnd[sessionId] ?? null) : sinceArg
      if (state.unread[sessionId]) {
        const current = state.unreadSince[sessionId] ?? null
        if (!since || !isAfter(since, current)) return state
        return { unreadSince: { ...state.unreadSince, [sessionId]: since } }
      }
      if (readElsewhere(state, sessionId, since)) return state
      return {
        unread: { ...state.unread, [sessionId]: true },
        unreadSince: { ...state.unreadSince, [sessionId]: since }
      }
    })
  },
  clearUnread: (sessionId) => {
    set((state) => {
      if (!state.unread[sessionId]) return state
      const unread = { ...state.unread }
      const unreadSince = { ...state.unreadSince }
      delete unread[sessionId]
      delete unreadSince[sessionId]
      return { unread, unreadSince }
    })
  },
  noteTurnEnd: (sessionId, point) => {
    set((state) => {
      if (!isAfter(point, state.seenTurnEnd[sessionId])) return state
      const seenTurnEnd = { ...state.seenTurnEnd, [sessionId]: point }
      return { seenTurnEnd, ...withoutReadDots({ ...state, seenTurnEnd }) }
    })
  },
  setReadMarks: (marks) => {
    set((state) => {
      const sharedRead = { ...marks }
      return { sharedRead, ...withoutReadDots({ ...state, sharedRead }) }
    })
  },
  setReadMark: (sessionId, point) => {
    set((state) => {
      const current = state.sharedRead[sessionId]
      if (current?.logEpoch === point.logEpoch && current.seq === point.seq) return state
      const sharedRead = { ...state.sharedRead, [sessionId]: point }
      return { sharedRead, ...withoutReadDots({ ...state, sharedRead }) }
    })
  }
}))
