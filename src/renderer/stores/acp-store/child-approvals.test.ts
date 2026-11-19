/**
 * An orchestrated subagent's approvals, questions and elicitations are raised
 * under its chat as its own agent: they outlive the chat's turn ending or
 * being stopped, and the run's settle card dismisses them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: vi.fn(() => true),
  cleanupTauriListener: vi.fn()
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(async () => undefined) }))
vi.mock('@/lib/acp-history-persistence', async (orig) => {
  const actual = await orig<typeof import('@/lib/acp-history-persistence')>()
  return {
    ...actual,
    loadSessionIndex: vi.fn(async () => []),
    saveSessionIndex: vi.fn(async () => {}),
    saveSessionPayload: vi.fn(async () => {}),
    queueSessionPayloadSave: vi.fn(async () => {}),
    queueSessionPayloadDelete: vi.fn(async () => {}),
    loadSessionPayload: vi.fn(async () => null),
    loadSessionPayloadTail: vi.fn(async () => null)
  }
})
vi.mock('@/lib/web-tab-session', () => ({
  setTabFocusedSessionId: vi.fn(),
  getTabFocusedSessionId: vi.fn(() => null)
}))

import type { Subagent } from '@shared/types/subagent'
import type {
  AskUserQuestionEvent,
  ElicitationRequestEvent,
  PermissionRequestEvent
} from '@/lib/acp-api'
import { endedState, orchestratedSubagentRecord, subagentMeta } from '@/lib/test-utils/subagent'
import {
  _flushCoalescedForTesting,
  _resetCoalesceForTesting,
  useAcpStore
} from '@/stores/acp-store'
import { FRESH, seedSession } from './testkit'

const CHAT = 'chat-1'
const CHAT_AGENT = 'chat-agent'
const CHILD_AGENT = 'agent-codex'
const DISPATCH = 'termul-subagent:sub-1'

const run = orchestratedSubagentRecord({
  dispatchToolCallId: DISPATCH,
  rootSessionId: CHAT,
  agent: { agentId: CHILD_AGENT },
  state: { activity: 'requires_action' }
})

function ask(requestId: string, agentId: string): void {
  const event: PermissionRequestEvent = {
    agentId,
    sessionId: CHAT,
    requestId,
    toolCall: { toolCallId: `tc-${requestId}`, title: 'Run tests' },
    options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }]
  }
  useAcpStore.getState()._onPermissionRequest(event)
}

/** A permission, a question and an elicitation from `agentId`, ids suffixed `-<who>`. */
function prompts(who: string, agentId: string): void {
  ask(`perm-${who}`, agentId)
  const question: AskUserQuestionEvent = {
    agentId,
    sessionId: CHAT,
    questionId: `q-${who}`,
    question: 'Which branch?',
    options: [{ value: 'main', label: 'main' }]
  }
  useAcpStore.getState()._onQuestionRequest(question)
  const elicitation: ElicitationRequestEvent = {
    agentId,
    sessionId: CHAT,
    requestId: `elicit-${who}`,
    mode: 'form',
    message: 'Pick a plan',
    fields: [{ name: 'plan', kind: 'string', required: true, options: [] }]
  }
  useAcpStore.getState()._onElicitationRequest(elicitation)
}

function card(record: Subagent): void {
  useAcpStore.getState()._onToolCallUpdate({
    agentId: CHAT_AGENT,
    sessionId: CHAT,
    update: { toolCallId: DISPATCH, _meta: subagentMeta(record) }
  })
  _flushCoalescedForTesting()
}

const pendingIds = (): string[] => {
  const state = useAcpStore.getState()
  return [
    ...Object.keys(state.pendingPermissions),
    ...Object.keys(state.pendingQuestions),
    ...Object.keys(state.pendingElicitations)
  ].sort()
}

describe('orchestrated subagent prompts', () => {
  beforeEach(() => {
    _resetCoalesceForTesting()
    useAcpStore.setState(FRESH)
    seedSession(CHAT, CHAT_AGENT)
    useAcpStore.getState()._onToolCall({
      agentId: CHAT_AGENT,
      sessionId: CHAT,
      toolCall: { toolCallId: DISPATCH, title: run.title, _meta: subagentMeta(run) }
    })
    _flushCoalescedForTesting()
    prompts('chat', CHAT_AGENT)
    prompts('child', CHILD_AGENT)
  })

  it.each([
    'end_turn',
    'cancelled'
  ] as const)('keeps the subagent prompts when the chat turn ends (%s)', (stopReason) => {
    useAcpStore.getState()._onPromptComplete({ agentId: CHAT_AGENT, sessionId: CHAT, stopReason })

    expect(pendingIds()).toEqual(['elicit-child', 'perm-child', 'q-child'])
  })

  it('dismisses the subagent prompts when its run settles, and only then', () => {
    card({ ...run, activity: 'running' })
    expect(pendingIds()).toEqual([
      'elicit-chat',
      'elicit-child',
      'perm-chat',
      'perm-child',
      'q-chat',
      'q-child'
    ])

    card({ ...run, ...endedState('cancelled'), endedAt: 9_000 })
    expect(pendingIds()).toEqual(['elicit-chat', 'perm-chat', 'q-chat'])
  })
})
