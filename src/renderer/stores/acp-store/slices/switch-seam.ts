import type { SessionId } from '@/lib/acp-api'
import {
  type AgentSwitchRecord,
  loadSessionPayload,
  maxPayloadSeq,
  reloadSessionPayloadFromHost,
  restoredSwitches,
  type SessionPayload
} from '@/lib/acp-history-persistence'
import { logFrontendError } from '@/lib/log-api'
import {
  dropHiddenTranscriptTurns,
  normalizeUserMessages,
  SWITCH_SPLICE_ID_PREFIX
} from '../helpers'
import type { ChatMessage } from '../types'

/**
 * Source payloads for a switch re-splice, redirect walk, or seam scroll-back
 * must be current: the desktop cache is never refreshed by live events, so a
 * cached copy can predate the switch marker and the source's latest turns. A
 * failed or absent host re-read (`null` in server and `live_only` modes) falls
 * back to the normal load.
 */
export async function loadFreshSourcePayload(id: string): Promise<SessionPayload | null> {
  const fresh = await reloadSessionPayloadFromHost(id).catch((error: unknown) => {
    void logFrontendError({
      level: 'warn',
      source: 'acp.switchAgent.splice',
      message: `Host re-read of switch source ${id} failed; using the cached copy if there is one: ${error instanceof Error ? error.message : String(error)}`
    })
    return null
  })
  return fresh ?? (await loadSessionPayload(id))
}

/** Rows a payload renders, in the id dialect every install and splice uses. */
export function renderableRows(payload: SessionPayload): ChatMessage[] {
  return normalizeUserMessages(dropHiddenTranscriptTurns(payload.messages))
}

/**
 * Index of the payload row that holds a window head: by id, else the last row
 * at or below the head's host seq (a live bubble whose persisted twin carries
 * another id). -1 when neither anchors.
 */
export function anchorIndex(rows: ChatMessage[], id: string, hostSeq: number | undefined): number {
  const byId = rows.findIndex((m) => m.id === id)
  if (byId !== -1 || typeof hostSeq !== 'number' || !Number.isFinite(hostSeq)) return byId
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const seq = rows[i].seq
    if (typeof seq === 'number' && Number.isFinite(seq) && seq <= hostSeq) return i
  }
  return -1
}

/**
 * Where a spliced row lives: the session whose log holds it, its id there, and
 * the id prefix its band carries in this window. A live switch re-splices the
 * previous target's list, so an earlier hop's rows nest one prefix per hop
 * (`switch-splice:B:switch-splice:A:<id>`); the innermost source owns the row.
 */
export interface SpliceOrigin {
  sourceId: SessionId
  originalId: string
  prefix: string
}

export function spliceOrigin(id: string): SpliceOrigin | null {
  let origin: SpliceOrigin | null = null
  let prefix = ''
  let rest = id
  while (rest.startsWith(SWITCH_SPLICE_ID_PREFIX)) {
    const end = rest.indexOf(':', SWITCH_SPLICE_ID_PREFIX.length)
    if (end === -1) break
    prefix += rest.slice(0, end + 1)
    origin = {
      sourceId: rest.slice(SWITCH_SPLICE_ID_PREFIX.length, end),
      originalId: rest.slice(end + 1),
      prefix
    }
    rest = origin.originalId
  }
  return origin
}

/** Source rows re-stamped the way `spliceSwitchTranscript` installed their band. */
function restampBand(rows: ChatMessage[], prefix: string, seqOffset: number): ChatMessage[] {
  return rows.map((m) => ({
    ...m,
    id: `${prefix}${m.id}`,
    seq: (typeof m.seq === 'number' ? m.seq : 0) + seqOffset
  }))
}

/**
 * The page before a window head that sits inside a spliced band, read from the
 * band's source log. `[]` at the band's first row; `null` when the head cannot
 * be placed in that log. `switches` are the window's separators; the one whose
 * `newSessionId` names the source opens the band, and the page stays above it.
 */
export async function olderInSourceBand(
  origin: SpliceOrigin,
  head: ChatMessage,
  count: number,
  switches: AgentSwitchRecord[]
): Promise<ChatMessage[] | null> {
  const locate = (payload: SessionPayload | null) => {
    const rows = payload ? renderableRows(payload) : []
    return { rows, index: anchorIndex(rows, origin.originalId, head.hostSeq) }
  }
  let found = locate(await loadSessionPayload(origin.sourceId).catch(() => null))
  if (found.index === -1) {
    found = locate(await loadFreshSourcePayload(origin.sourceId).catch(() => null))
  }
  if (found.index === -1) {
    void logFrontendError({
      level: 'warn',
      source: 'acp.loadOlderMessages',
      message: `Spliced head of switch source ${origin.sourceId} is not in that session's log; older history will not load`
    })
    return null
  }
  const anchorSeq = found.rows[found.index].seq
  const headSeq = head.seq ?? 0
  const page = restampBand(
    found.rows.slice(Math.max(0, found.index - count), found.index),
    origin.prefix,
    headSeq - (typeof anchorSeq === 'number' ? anchorSeq : 0)
  )
  // A live-spliced band keeps the renderer seqs its bubbles had, while the
  // source log spaces the same rows by host seq, which grows per chunk. That
  // spacing can sink the page below the separator that opens the band, so the
  // page then packs right under the head instead.
  const bandFloor = switches.find(
    (sw) => sw.newSessionId === origin.sourceId && sw.id.startsWith(SWITCH_SPLICE_ID_PREFIX)
  )?.seq
  if (bandFloor === undefined || page.length === 0 || (page[0].seq ?? 0) > bandFloor) return page
  return page.map((m, i) => ({ ...m, seq: headSeq - (page.length - i) }))
}

/**
 * The newest page of the band spliced before `bandSessionId`'s band. Every
 * splice leaves a separator whose `newSessionId` names the session that came
 * next and whose namespaced id names the source; separators are never trimmed,
 * so they chain the hops for chats switched live and for reopened chains alike.
 * The page sits at the offset that puts the source's own separator on the
 * spliced one.
 */
export async function newestOfPreviousBand(
  switches: AgentSwitchRecord[],
  targetId: SessionId,
  bandSessionId: SessionId,
  count: number
): Promise<ChatMessage[]> {
  const visited = new Set<SessionId>([targetId, bandSessionId])
  let successor = bandSessionId
  for (;;) {
    const separator = switches.find(
      (sw) => sw.newSessionId === successor && sw.id.startsWith(SWITCH_SPLICE_ID_PREFIX)
    )
    const origin = separator ? spliceOrigin(separator.id) : null
    if (!separator || !origin || visited.has(origin.sourceId)) return []
    visited.add(origin.sourceId)
    const payload = await loadFreshSourcePayload(origin.sourceId).catch(() => null)
    if (!payload) {
      void logFrontendError({
        level: 'info',
        source: 'acp.loadOlderMessages',
        message: `Scroll-back for session ${targetId} stopped: switch source ${origin.sourceId} payload unavailable`
      })
      return []
    }
    const rows = renderableRows(payload)
    if (rows.length > 0) {
      const own = restoredSwitches(payload).find((sw) => sw.newSessionId === successor)
      const seqOffset = separator.seq - (own?.seq ?? maxPayloadSeq(payload) + 1)
      return restampBand(rows.slice(Math.max(0, rows.length - count)), origin.prefix, seqOffset)
    }
    successor = origin.sourceId
  }
}
