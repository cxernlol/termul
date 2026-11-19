/**
 * Read the host's canonical subagent record off a tool call. The host decides
 * what is a subagent and sends the full {@link Subagent} at
 * `_meta["termul/subagent"]` whenever it changes, and a
 * {@link SubagentControl} at `_meta["termul/subagentControl"]` on calls that
 * steer existing subagents. The store lifts both into `call.subagent` and
 * `call.subagentControl`. An event without the key leaves the stored record.
 */

import {
  SUBAGENT_CONTROL_META_KEY,
  SUBAGENT_META_KEY,
  type Subagent,
  type SubagentAgent,
  type SubagentCaps,
  type SubagentControl,
  type SubagentEnd,
  type SubagentEndReason,
  type SubagentId,
  type SubagentSource,
  type SubagentState,
  type SubagentUsage,
  type SubagentWorkspace
} from '@shared/types/subagent'
import { runningBackgroundSubagents } from '@/components/chat/subagent-strip'
import { asRecord } from '@/components/chat/tool-call-summary'
import type { ToolCall } from '@/lib/acp-api'
import { logFrontendError } from '@/lib/log-api'
import type { AcpState } from './types'

const SOURCES: ReadonlySet<string> = new Set<SubagentSource>([
  'acp-rfd',
  'acp-air',
  'claude-meta',
  'codex-collab',
  'cursor-task',
  'opencode-task',
  'gemini-agent',
  'tool-heuristic',
  'orchestrated'
])
const END_REASONS: ReadonlySet<string> = new Set<SubagentEndReason>([
  'completed',
  'cancelled',
  'failed',
  'unexplained'
])
const TRANSCRIPTS: ReadonlySet<string> = new Set<SubagentCaps['transcript']>([
  'live',
  'final',
  'none'
])
const WORKSPACE_MODES: ReadonlySet<string> = new Set<SubagentWorkspace['mode']>([
  'shared',
  'worktree'
])
const USAGE_FIELDS = [
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'toolUses',
  'durationMs'
] as const satisfies readonly (keyof SubagentUsage)[]

/** Thrown inside the parser; the message names the bad field, never its value. */
class Malformed extends Error {}

function fail(field: string): never {
  throw new Malformed(field)
}

function requiredString(raw: Record<string, unknown>, field: string): string {
  const value = raw[field]
  return typeof value === 'string' && value.length > 0 ? value : fail(field)
}

function optionalString(raw: Record<string, unknown>, field: string): string | undefined {
  const value = raw[field]
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value : fail(field)
}

function optionalNumber(raw: Record<string, unknown>, field: string): number | undefined {
  const value = raw[field]
  if (value === undefined || value === null) return undefined
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fail(field)
}

function oneOf<T extends string>(set: ReadonlySet<string>, value: unknown, field: string): T {
  return typeof value === 'string' && set.has(value) ? (value as T) : fail(field)
}

function parseEnd(value: unknown): SubagentEnd {
  const raw = asRecord(value) ?? fail('end')
  const error = optionalString(raw, 'error')
  return {
    reason: oneOf<SubagentEndReason>(END_REASONS, raw.reason, 'end.reason'),
    ...(error !== undefined && { error })
  }
}

function parseState(raw: Record<string, unknown>): SubagentState {
  const activity = raw.activity
  if (activity === 'idle') return { activity, end: parseEnd(raw.end) }
  if (raw.end !== undefined && raw.end !== null) fail('end')
  if (activity === 'running' || activity === 'requires_action' || activity === 'unknown') {
    return { activity }
  }
  return fail('activity')
}

function parseCaps(value: unknown): SubagentCaps {
  const raw = asRecord(value) ?? fail('caps')
  const { stop, liveProgress, usage } = raw
  if (stop !== null && stop !== 'session-cancel') fail('caps.stop')
  if (typeof liveProgress !== 'boolean') fail('caps.liveProgress')
  if (typeof usage !== 'boolean') fail('caps.usage')
  return {
    stop,
    transcript: oneOf<SubagentCaps['transcript']>(TRANSCRIPTS, raw.transcript, 'caps.transcript'),
    liveProgress,
    usage
  }
}

function parseUsage(value: unknown): SubagentUsage | undefined {
  if (value === undefined || value === null) return undefined
  const raw = asRecord(value) ?? fail('usage')
  const usage: SubagentUsage = {}
  for (const field of USAGE_FIELDS) {
    const n = optionalNumber(raw, field)
    if (n !== undefined) usage[field] = n
  }
  return usage
}

function parseAgent(value: unknown): SubagentAgent {
  const raw = asRecord(value) ?? fail('agent')
  return {
    name: requiredString(raw, 'name'),
    configId: optionalString(raw, 'configId'),
    agentId: requiredString(raw, 'agentId')
  }
}

function parseWorkspace(value: unknown): SubagentWorkspace {
  const raw = asRecord(value) ?? fail('workspace')
  return {
    mode: oneOf<SubagentWorkspace['mode']>(WORKSPACE_MODES, raw.mode, 'mode'),
    path: optionalString(raw, 'path'),
    branch: optionalString(raw, 'branch'),
    base: optionalString(raw, 'base'),
    diffStat: optionalString(raw, 'diffStat')
  }
}

/**
 * An optional object field with its own parse: malformed drops just the field
 * (warned once per call, like a dropped record), never the record it rides —
 * an orchestrated row keeps its title and status without its identity.
 */
function parseOptionalField<T>(
  toolCallId: string,
  field: string,
  value: unknown,
  parse: (value: unknown) => T
): T | undefined {
  if (value === undefined || value === null) return undefined
  try {
    return parse(value)
  } catch (error) {
    if (!(error instanceof Malformed)) throw error
    warnOnce(toolCallId, `${SUBAGENT_META_KEY}.${field}`, error.message)
    return undefined
  }
}

function parseSubagentRecord(toolCallId: string, value: unknown): Subagent {
  const raw = asRecord(value) ?? fail('record')
  const { background } = raw
  if (typeof background !== 'boolean') fail('background')
  return {
    id: requiredString(raw, 'id') as SubagentId,
    rootSessionId: requiredString(raw, 'rootSessionId'),
    parentId: optionalString(raw, 'parentId') as SubagentId | undefined,
    dispatchToolCallId: requiredString(raw, 'dispatchToolCallId'),
    source: oneOf<SubagentSource>(SOURCES, raw.source, 'source'),
    title: requiredString(raw, 'title'),
    description: optionalString(raw, 'description'),
    role: optionalString(raw, 'role'),
    prompt: optionalString(raw, 'prompt'),
    background,
    startedAt: optionalNumber(raw, 'startedAt'),
    endedAt: optionalNumber(raw, 'endedAt'),
    model: optionalString(raw, 'model'),
    usage: parseUsage(raw.usage),
    agent: parseOptionalField(toolCallId, 'agent', raw.agent, parseAgent),
    workspace: parseOptionalField(toolCallId, 'workspace', raw.workspace, parseWorkspace),
    outputFile: optionalString(raw, 'outputFile'),
    caps: parseCaps(raw.caps),
    ...parseState(raw)
  }
}

function parseSubagentControlRecord(value: unknown): SubagentControl {
  const ids = asRecord(value)?.subagentIds
  if (!Array.isArray(ids)) fail('subagentIds')
  return {
    subagentIds: ids.map((id) =>
      typeof id === 'string' && id.length > 0 ? (id as SubagentId) : fail('subagentIds')
    )
  }
}

/** Dedup cap for the warn log, FIFO-evicted (an evicted id may re-log once). */
const MAX_WARNED_KEYS = 256
const warnedKeys = new Set<string>()

function warnOnce(toolCallId: string, key: string, field: string): void {
  const id = toolCallId.slice(0, 128)
  const dedupKey = `${id}:${key}`
  if (warnedKeys.has(dedupKey)) return
  if (warnedKeys.size >= MAX_WARNED_KEYS) {
    const oldest = warnedKeys.values().next().value
    if (oldest !== undefined) warnedKeys.delete(oldest)
  }
  warnedKeys.add(dedupKey)
  void logFrontendError({
    level: 'warn',
    source: 'acp-store.subagentRecord',
    message: `Dropped malformed ${key} on tool call ${id}: bad ${field}`
  })
}

/** One `_meta` entry parsed; undefined when absent or malformed (logged once per call). */
function parseMetaEntry<T>(
  toolCallId: string,
  meta: unknown,
  key: string,
  parse: (value: unknown) => T
): T | undefined {
  const value = asRecord(meta)?.[key]
  if (value === undefined || value === null) return undefined
  try {
    return parse(value)
  } catch (error) {
    if (!(error instanceof Malformed)) throw error
    warnOnce(toolCallId, key, error.message)
    return undefined
  }
}

/** The subagent record a tool call or update carries, if valid. */
export function parseSubagent(toolCallId: string, meta: unknown): Subagent | undefined {
  return parseMetaEntry(toolCallId, meta, SUBAGENT_META_KEY, (value) =>
    parseSubagentRecord(toolCallId, value)
  )
}

/** The subagent control marker a tool call or update carries, if valid. */
export function parseSubagentControl(
  toolCallId: string,
  meta: unknown
): SubagentControl | undefined {
  return parseMetaEntry(toolCallId, meta, SUBAGENT_CONTROL_META_KEY, parseSubagentControlRecord)
}

/**
 * `call` with `subagent` and `subagentControl` lifted from its `_meta`; the
 * same object when it carries neither. Spread over the stored call, a present
 * record replaces the stored one and an absent one leaves it.
 */
export function withSubagentRecord<T extends { toolCallId: string; _meta?: unknown }>(call: T): T {
  const subagent = parseSubagent(call.toolCallId, call._meta)
  const subagentControl = parseSubagentControl(call.toolCallId, call._meta)
  if (!subagent && !subagentControl) return call
  return {
    ...call,
    ...(subagent && { subagent }),
    ...(subagentControl && { subagentControl })
  }
}

/** Running or waiting for input: the work has not ended. */
export function isSubagentActive(subagent: Subagent): boolean {
  return subagent.activity === 'running' || subagent.activity === 'requires_action'
}

/**
 * The agent process is gone, so a running subagent will never receive its
 * end: one its source reports live, or a background launch that never
 * reported one. Ends those records as `unexplained`. Returns the same map when
 * nothing was running.
 *
 * Orchestrated runs end here too: when the chat's agent goes, the host stops
 * their children, and no settle card can reach this chat without its agent.
 */
export function cancelRunningSubagents(
  state: Pick<AcpState, 'toolCalls' | 'messages'>,
  sessionIds: readonly string[],
  endedAt: number
): Record<string, ToolCall[]> {
  const { toolCalls } = state
  let next: Record<string, ToolCall[]> | null = null
  for (const sessionId of sessionIds) {
    const calls = toolCalls[sessionId]
    if (!calls) continue
    const background = new Set(runningBackgroundSubagents(calls, state.messages[sessionId]))
    let count = 0
    const settled = calls.map((call): ToolCall => {
      const record = call.subagent
      if (!record || !isSubagentActive(record)) return call
      if (!record.caps.liveProgress && !background.has(call)) return call
      count += 1
      return {
        ...call,
        subagent: {
          ...record,
          activity: 'idle',
          end: { reason: 'unexplained' },
          endedAt: record.endedAt ?? endedAt
        }
      }
    })
    if (count === 0) continue
    if (!next) next = { ...toolCalls }
    next[sessionId] = settled
    void logFrontendError({
      level: 'info',
      source: 'acp-store.subagentRecord',
      message: `Cancelled ${count} running subagents on chat ${sessionId}: the agent process is gone`
    })
  }
  return next ?? toolCalls
}

/** Reset the log dedup (tests). */
export function _resetSubagentRecordLogsForTesting(): void {
  warnedKeys.clear()
}
