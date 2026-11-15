/**
 * One execution plan per chat session.
 *
 * The sticky plan panel is the only place a plan renders. Adapters differ in
 * how they send that plan; this module turns each of them into one list.
 *
 * New plan vs in-place update
 * ---------------------------
 * ACP `session/update` `plan`, the host `plan` tool, and Codex `update_plan`
 * each send the **whole list**. There is no merge flag on those wires.
 *
 * - No current list, or the incoming list shares no entry with it: a **new
 *   plan**. The stored list is replaced. The panel opens.
 * - At least one entry matches (`id` when present, otherwise the text): an
 *   **in-place update**. The stored list is still the incoming full list
 *   (items absent from it are removed). The panel keeps its open or closed
 *   state, and closes when every item is finished.
 * - An empty list clears the plan.
 *
 * Claude Code `TodoWrite` and Cursor `updateTodos` / `update_todos` send a
 * `merge` flag:
 *
 * - `merge: false` (or omitted): the array replaces the list. The same
 *   overlap rule decides new vs update.
 * - `merge: true`: items merge by `id` (or by text when there is no id).
 *   Items missing from the call stay. An empty merge changes nothing.
 *
 * Turn end
 * --------
 * When a turn ends for any reason, `in_progress` items return to `pending`.
 * The agent is no longer running them. A reload of a finished turn does the
 * same, so a spinner cannot survive the turn.
 */
import type { PlanEntry } from '@/lib/acp-api'

/** Tool names that carry a plan. The leaf after `__`, `/`, or `:` is enough. */
const PLAN_TOOL_NAMES = new Set([
  'plan',
  'todowrite',
  'todo_write',
  'update_plan',
  'updatetodos',
  'update_todos'
])

/** Tools whose `merge` flag is part of the wire contract. */
const MERGE_TOOL_NAMES = new Set(['todowrite', 'todo_write', 'updatetodos', 'update_todos'])

export interface PlanToolFields {
  title?: string
  status?: string
  rawInput?: unknown
  _meta?: unknown
  planTool?: boolean
  /** Bounded plan list kept on the durable tool record after arguments are dropped. */
  planEntries?: unknown
  /** Durable `merge: true` from TodoWrite / updateTodos. The tool name is not kept. */
  planMerge?: boolean
}

export interface ResolvedPlanTool {
  entries: PlanEntry[]
  kind: 'new' | 'update' | 'clear'
}

interface PlanListChange {
  plans: Record<string, PlanEntry[]>
  kind: 'new' | 'update' | 'clear'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** Leaf tool name: `mcp__server__plan` and `server:plan` both become `plan`. */
export function planToolLeaf(name: string): string {
  const slashed = name.split(/[/:]/).pop() ?? name
  const leaf = slashed.split('__').pop() ?? slashed
  return leaf.trim().toLowerCase().replaceAll('-', '_')
}

function candidateNames(tool: PlanToolFields): string[] {
  const names: string[] = []
  const push = (value: unknown): void => {
    const text = asString(value)
    if (text) names.push(text)
  }
  push(tool.title)
  const meta = asRecord(tool._meta)
  push(asRecord(meta?.claudeCode)?.toolName)
  const input = asRecord(tool.rawInput)
  push(input?._toolName)
  push(input?.toolName)
  return names
}

function leaves(tool: PlanToolFields): string[] {
  return candidateNames(tool).map(planToolLeaf)
}

/** True when this tool call is a plan/todo write and must not render as a card. */
export function isPlanToolCall(tool: PlanToolFields): boolean {
  if (tool.planTool === true) return true
  return leaves(tool).some((leaf) => PLAN_TOOL_NAMES.has(leaf))
}

function usesMergeFlag(tool: PlanToolFields): boolean {
  return leaves(tool).some((leaf) => MERGE_TOOL_NAMES.has(leaf))
}

/** Stamp `planTool` so a restored call stays hidden after its name is dropped. */
export function markPlanTool<T extends PlanToolFields>(tool: T): T {
  if (tool.planTool === true || !isPlanToolCall(tool)) return tool
  return { ...tool, planTool: true }
}

/** React key and merge identity. An id wins; otherwise the text. */
export function planEntryIdentity(entry: PlanEntry): string {
  const id = entry.id
  if (typeof id === 'string' && id.trim().length > 0) return `id:${id.trim()}`
  return `content:${entry.content.trim()}`
}

/**
 * Keys used to tell a new plan from an update. A shared id or the same text
 * is the same entry, so a Codex step with no id still matches a TodoWrite row
 * that has an id and the same text.
 */
export function planEntryKeys(entry: PlanEntry): string[] {
  const keys = [`content:${entry.content.trim()}`]
  const id = entry.id
  if (typeof id === 'string' && id.trim().length > 0) keys.push(`id:${id.trim()}`)
  return keys
}

export function isSettledStatus(status: string | undefined): boolean {
  return status === 'completed' || status === 'cancelled'
}

/** True when the list has items and none of them are still to do or running. */
export function isSettledPlan(entries: PlanEntry[]): boolean {
  return entries.length > 0 && entries.every((entry) => isSettledStatus(entry.status))
}

/**
 * True when both lists are non-empty and share no entry. That is a new plan.
 * An empty list is a clear, not a new plan.
 */
export function isNewPlanList(previousIds: string[], nextIds: string[]): boolean {
  if (previousIds.length === 0 || nextIds.length === 0) return false
  const previous = new Set(previousIds)
  return !nextIds.some((id) => previous.has(id))
}

export function classifyFullPlan(
  current: PlanEntry[] | undefined,
  incoming: PlanEntry[]
): 'new' | 'update' | 'clear' {
  if (incoming.length === 0) return 'clear'
  if (!current || current.length === 0) return 'new'
  return isNewPlanList(current.flatMap(planEntryKeys), incoming.flatMap(planEntryKeys))
    ? 'new'
    : 'update'
}

function normalizeStatus(value: string | undefined): PlanEntry['status'] | undefined {
  if (!value) return undefined
  const status = value.toLowerCase().replaceAll(/[\s-]/g, '_')
  if (status === 'in_progress' || status === 'inprogress' || status === 'running') {
    return 'in_progress'
  }
  if (status === 'completed' || status === 'complete' || status === 'done') return 'completed'
  if (status === 'cancelled' || status === 'canceled') return 'cancelled'
  if (status === 'pending' || status === 'todo' || status === 'not_started') return 'pending'
  return value
}

function normalizePriority(value: string | undefined): PlanEntry['priority'] | undefined {
  if (!value) return undefined
  const priority = value.toLowerCase()
  return priority === 'high' || priority === 'medium' || priority === 'low' ? priority : undefined
}

function entryFromItem(item: unknown): PlanEntry | null {
  const record = asRecord(item)
  if (!record) return null
  const content = asString(record.content) ?? asString(record.step) ?? asString(record.text)
  if (!content) return null
  const entry: PlanEntry = { content }
  const id = asString(record.id)
  if (id) entry.id = id
  const status = normalizeStatus(asString(record.status))
  if (status) entry.status = status
  const priority = normalizePriority(asString(record.priority))
  if (priority) entry.priority = priority
  const detail = asString(record.detail) ?? asString(record.description)
  if (detail && detail !== content) entry.detail = detail
  return entry
}

/** Parse a todo/plan array. `null` when the key is absent. `[]` when it is empty. */
function entriesFromValue(value: unknown): PlanEntry[] | null {
  if (!Array.isArray(value)) return null
  return value.flatMap((item) => {
    const entry = entryFromItem(item)
    return entry ? [entry] : []
  })
}

function listFromInput(input: Record<string, unknown>): PlanEntry[] | null {
  for (const key of ['todos', 'plan', 'entries', 'tasks']) {
    const parsed = entriesFromValue(input[key])
    if (parsed) return parsed
  }
  return null
}

function mergePlan(current: PlanEntry[] | undefined, incoming: PlanEntry[]): PlanEntry[] {
  const next = (current ?? []).map((entry) => ({ ...entry }))
  for (const item of incoming) {
    const id = typeof item.id === 'string' ? item.id : ''
    const index = id
      ? next.findIndex((entry) => entry.id === id)
      : next.findIndex((entry) => entry.content === item.content)
    if (index >= 0) next[index] = { ...next[index], ...item }
    else next.push(item)
  }
  return next
}

function samePlan(current: PlanEntry[] | undefined, next: PlanEntry[]): boolean {
  if (!current || current.length !== next.length) return false
  return current.every((entry, index) => {
    const other = next[index]
    return (
      entry.content === other?.content &&
      entry.status === other.status &&
      entry.priority === other.priority &&
      entry.id === other.id &&
      entry.detail === other.detail
    )
  })
}

/**
 * Read a plan tool call. `null` when it is not a plan tool, or when the
 * arguments are not ready (an in-flight call with an empty list must not
 * wipe the panel).
 */
export function resolvePlanToolCall(
  current: PlanEntry[] | undefined,
  tool: PlanToolFields
): ResolvedPlanTool | null {
  if (!isPlanToolCall(tool)) return null
  const input = asRecord(tool.rawInput)
  if (!input) return null
  const incoming = listFromInput(input)
  if (!incoming) return null
  const merge = input.merge === true && (usesMergeFlag(tool) || tool.planMerge === true)
  if (incoming.length === 0) {
    if (merge) return null
    if (tool.status !== 'completed' && tool.status !== 'failed') return null
    return { entries: [], kind: 'clear' }
  }
  const entries = merge ? mergePlan(current, incoming) : incoming
  return { entries, kind: classifyFullPlan(current, entries) }
}

const PLAN_LIST_KEYS = ['todos', 'plan', 'entries', 'tasks'] as const

/** True when this event itself carries a plan list. Retained arguments do not count. */
export function planEventHasList(tool: PlanToolFields): boolean {
  const input = asRecord(tool.rawInput)
  if (!input) return false
  return PLAN_LIST_KEYS.some((key) => Array.isArray(input[key]))
}

/**
 * A durable plan tool keeps `planEntries` after `rawInput` is dropped. Rebuild
 * the list input so a reload can replay the call. A live event that already
 * has a list is unchanged.
 */
export function withDurablePlanInput<T extends PlanToolFields>(tool: T): T {
  if (planEventHasList(tool) || !Array.isArray(tool.planEntries)) return tool
  return {
    ...tool,
    planMerge: tool.planMerge === true,
    rawInput: { todos: tool.planEntries, merge: tool.planMerge === true }
  }
}

/** Apply one plan tool call onto the session map. `null` when nothing changes. */
export function plansAfterToolCall(
  plans: Record<string, PlanEntry[]>,
  sessionId: string,
  tool: PlanToolFields
): PlanListChange | null {
  const resolved = resolvePlanToolCall(plans[sessionId], tool)
  if (!resolved) return null
  if (resolved.kind === 'clear') {
    if (!(sessionId in plans)) return null
    const next = { ...plans }
    delete next[sessionId]
    return { plans: next, kind: 'clear' }
  }
  if (samePlan(plans[sessionId], resolved.entries)) return null
  return {
    plans: { ...plans, [sessionId]: resolved.entries },
    kind: resolved.kind
  }
}

/**
 * The agent is no longer running the turn. `in_progress` returns to `pending`.
 * Completed and cancelled items stay. The same array is returned when nothing
 * was running.
 */
export function settleRunningPlan(entries: PlanEntry[] | undefined): PlanEntry[] | undefined {
  if (!entries?.some((entry) => entry.status === 'in_progress')) return entries
  return entries.map((entry) =>
    entry.status === 'in_progress' ? { ...entry, status: 'pending' } : entry
  )
}

const PLAN_FENCE = /(?:^|\n)```termul-plan\r?\n[\s\S]*?\r?\n```\n?/g

/**
 * Remove persisted `termul-plan` fences from text that is about to render or
 * be copied. The fence stays on the message so a reopened chat can restore
 * the panel. It is not part of the reply.
 */
function entriesFromPlanUpdate(payload: unknown): PlanEntry[] | null {
  const record = asRecord(payload)
  const plan = asRecord(record?.plan)
  if (!plan || !Array.isArray(plan.entries)) return null
  return entriesFromValue(plan.entries) ?? []
}

/**
 * Replay plan events from a reconnect snapshot, in order. `null` when the
 * snapshot never mentions a plan, so the in-memory plan stays. A `plan_update`
 * replaces the list. A plan tool applies only when that event carries a list
 * (or the durable `planEntries`). A later `prompt_complete` returns running
 * items to pending.
 */
export function foldRecoveredPlan(
  events: ReadonlyArray<{ type: string; payload?: unknown }>
): PlanEntry[] | null {
  let entries: PlanEntry[] | undefined
  let seen = false
  for (const event of events) {
    if (event.type === 'plan_update') {
      const next = entriesFromPlanUpdate(event.payload)
      if (next === null) continue
      entries = next
      seen = true
      continue
    }
    if (event.type === 'tool_call' || event.type === 'tool_call_update') {
      const payload = asRecord(event.payload)
      const raw = event.type === 'tool_call' ? payload?.toolCall : payload?.update
      const tool = asRecord(raw)
      if (!tool) continue
      const folded = withDurablePlanInput(tool as PlanToolFields)
      if (!planEventHasList(folded)) continue
      const next = plansAfterToolCall({ session: entries ?? [] }, 'session', folded)
      if (!next) continue
      entries = next.plans.session ?? []
      seen = true
      continue
    }
    if (event.type === 'prompt_complete' && seen) {
      entries = settleRunningPlan(entries) ?? []
    }
  }
  return seen ? (entries ?? []) : null
}

export function stripTermulPlanFences(text: string): string {
  if (!text.includes('termul-plan')) return text
  return text.replace(PLAN_FENCE, (match) => (match.startsWith('\n') ? '\n' : ''))
}
