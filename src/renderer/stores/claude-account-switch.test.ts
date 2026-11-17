import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeAccountFor } from '@/components/chat/claude-account/use-project-claude-account'
import { acpApi } from '@/lib/acp-api'
import { AcpTransportError } from '@/lib/acp-transport'
import { CLAUDE_AGENT_CONFIG_ID } from '@/lib/agents/registry-config-id'
import { logFrontendError } from '@/lib/log-api'
import { endedState, subagentToolCall } from '@/lib/test-utils/subagent'
import { agentReuseKey } from '@/stores/acp-reuse-keys'
import {
  _addEphemeralSessionIdForTesting,
  _resetEphemeralSessionIdsForTesting,
  useAcpStore
} from '@/stores/acp-store'
import { readReuseScope } from '@/stores/acp-store/chat-reuse-scope'
import { ensureLiveAgent } from '@/stores/acp-store/shared-state'
import { FRESH } from '@/stores/acp-store/testkit'
import { useAgentChatLifetimeStore } from '@/stores/agent-chat-lifetime-store'
import {
  buildProjectWorkspace,
  createProjectWorkspace,
  getAgentChatSessionIdsInAllTrees,
  useWorkspaceStore
} from '@/stores/workspace-store'
import {
  applyProjectClaudeAccount,
  applyRemovedClaudeAccount,
  chatSwitchNotice,
  isClaudeSession,
  restartClaudeSession,
  switchChatClaudeAccount,
  switchProjectClaudeAccount
} from './claude-account-switch'

const { api } = vi.hoisted(() => ({
  api: { setProjectAccount: vi.fn(), setChatAccount: vi.fn(), list: vi.fn() }
}))

const accounts = (chatAccounts: Record<string, string> = {}) => ({
  accounts: [
    { id: 'default', name: 'Default', builtin: true, signedIn: true },
    { id: 'work', name: 'Work', builtin: false, signedIn: true }
  ],
  defaultAccountId: 'default',
  projectAccounts: {},
  chatAccounts,
  autoSwitch: true
})
vi.mock('@/lib/claude-accounts-api', () => ({ claudeAccountsApi: api }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('@/lib/acp-api', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/acp-api')>()),
  acpRecordAgentSwitch: vi.fn(async () => undefined)
}))

const realKillAgent = useAcpStore.getState().killAgent
const killAgent = vi.fn()
const retryCrashedSession = vi.fn()
const cancelPrompt = vi.fn()
const sendPrompt = vi.fn()

const session = (id: string, o: { projectId?: string; agentId?: string; busy?: boolean } = {}) => ({
  id,
  agentId: o.agentId ?? `agent-${id}`,
  cwd: '/work',
  projectId: o.projectId ?? 'office',
  status: 'active' as const,
  title: null,
  activeTurn: Boolean(o.busy),
  openTurnId: o.busy ? 'turn-1' : null,
  modes: null,
  models: null,
  configOptions: [],
  lastError: null,
  createdAt: 1
})

const indexEntry = (id: string, agentConfigId: string) => ({
  id,
  agentId: `agent-${id}`,
  agentConfigId,
  title: id,
  cwd: '/work',
  projectId: 'office',
  createdAt: 1,
  lastActivityAt: 1,
  messageCount: 1,
  status: 'active' as const
})

function openChatTabs(sessionIds: string[]): void {
  useWorkspaceStore.setState({ activeProjectId: '', parkedTrees: {}, ...createProjectWorkspace() })
  useWorkspaceStore.getState().activateProject(
    'office',
    buildProjectWorkspace({
      type: 'leaf',
      id: 'pane-1',
      activeTabId: `chat-${sessionIds[0]}`,
      tabs: sessionIds.map((sessionId) => ({
        type: 'agent-chat' as const,
        id: `chat-${sessionId}`,
        sessionId
      }))
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  _resetEphemeralSessionIdsForTesting()
  useAgentChatLifetimeStore.setState({
    retainedByProject: {},
    activeSessionByProject: {},
    focusSessionByProject: {}
  })
  openChatTabs(['c1', 'c2', 'other', 'elsewhere'])
  killAgent.mockResolvedValue(undefined)
  retryCrashedSession.mockResolvedValue(undefined)
  sendPrompt.mockResolvedValue(undefined)
  cancelPrompt.mockImplementation(async (id: string) => {
    useAcpStore.setState((s) => ({
      sessions: { ...s.sessions, [id]: { ...s.sessions[id], activeTurn: false, openTurnId: null } }
    }))
  })
  api.setProjectAccount.mockResolvedValue(true)
  api.setChatAccount.mockResolvedValue(true)
  api.list.mockResolvedValue(accounts())
  useAcpStore.setState({
    ...FRESH,
    killAgent,
    retryCrashedSession,
    cancelPrompt,
    sendPrompt,
    sessions: {
      c1: session('c1'),
      c2: session('c2', { busy: true }),
      other: session('other'),
      elsewhere: session('elsewhere', { projectId: 'side' })
    },
    sessionIndex: [
      indexEntry('c1', CLAUDE_AGENT_CONFIG_ID),
      indexEntry('c2', CLAUDE_AGENT_CONFIG_ID),
      indexEntry('other', 'acp-registry:gemini'),
      indexEntry('elsewhere', CLAUDE_AGENT_CONFIG_ID)
    ],
    sessionUsage: {
      c1: {
        used: 1,
        size: 10,
        baselineUsed: 1,
        updatedAt: 1,
        source: 'reported',
        rateLimit: {
          status: 'rejected',
          resetsAt: 1,
          kind: 'five_hour',
          percent: 100,
          overageInUse: false
        }
      }
    }
  } as never)
})

describe('claude account switch', () => {
  it('knows a managed Claude chat from its agent config', () => {
    const state = useAcpStore.getState()
    expect(isClaudeSession(state, 'c1')).toBe(true)
    expect(isClaudeSession(state, 'other')).toBe(false)
  })

  it('restarts an idle chat on a fresh process without resending, and clears the old limit', async () => {
    await expect(restartClaudeSession('c1')).resolves.toBe(true)
    expect(killAgent).toHaveBeenCalledWith('agent-c1')
    expect(retryCrashedSession).toHaveBeenCalledWith('c1', { resend: false })
    expect(killAgent.mock.invocationCallOrder[0]).toBeLessThan(
      retryCrashedSession.mock.invocationCallOrder[0]
    )
    expect(useAcpStore.getState().sessionUsage.c1?.rateLimit).toBeUndefined()
  })

  it('keeps the limit of a chat that did not come back, so it can be retried', async () => {
    retryCrashedSession.mockImplementation(async (id: string) => {
      useAcpStore.setState((s) => ({
        sessions: { ...s.sessions, [id]: { ...s.sessions[id], status: 'closed' } }
      }))
    })
    await expect(restartClaudeSession('c1')).resolves.toBe(false)
    expect(useAcpStore.getState().sessionUsage.c1?.rateLimit?.status).toBe('rejected')
  })

  it('counts a restart as done when only its continuation notice fails to send', async () => {
    sendPrompt.mockRejectedValueOnce(new Error('socket closed'))
    await expect(restartClaudeSession('c1', { notice: 'go on' })).resolves.toBe(true)
    expect(useAcpStore.getState().sessionUsage.c1?.rateLimit).toBeUndefined()
    expect(vi.mocked(logFrontendError)).toHaveBeenCalledWith({
      level: 'warn',
      source: 'claudeAccountSwitch.restart',
      message: 'Chat c1 restarted, but its continuation notice failed: socket closed'
    })
  })

  it('leaves a chat of another agent alone', async () => {
    await expect(restartClaudeSession('other')).resolves.toBe(false)
    expect(killAgent).not.toHaveBeenCalled()
  })

  it('waits for a busy chat to finish its turn', async () => {
    const restart = restartClaudeSession('c2')
    await Promise.resolve()
    expect(killAgent).not.toHaveBeenCalled()
    useAcpStore.setState((s) => ({
      sessions: { ...s.sessions, c2: { ...s.sessions.c2, activeTurn: false, openTurnId: null } }
    }))
    await expect(restart).resolves.toBe(true)
    expect(retryCrashedSession).toHaveBeenCalledWith('c2', { resend: false })
  })

  describe('with a background subagent still running after the turn', () => {
    const launch = (state?: 'completed') =>
      subagentToolCall(
        { background: true, ...(state ? { state: endedState(state) } : {}) },
        { toolCallId: 'bg-1', status: 'completed', seq: 2 }
      )
    beforeEach(() => {
      useAcpStore.setState({
        messages: { c1: [{ id: 'u1', role: 'user', blocks: [], timestamp: 1, seq: 1 }] },
        toolCalls: { c1: [launch()] }
      } as never)
    })

    it('defers the restart until the subagent ends', async () => {
      const restart = restartClaudeSession('c1')
      await Promise.resolve()
      expect(killAgent).not.toHaveBeenCalled()
      useAcpStore.setState({ toolCalls: { c1: [launch('completed')] } } as never)
      await expect(restart).resolves.toBe(true)
      expect(killAgent).toHaveBeenCalledWith('agent-c1')
      expect(retryCrashedSession).toHaveBeenCalledWith('c1', { resend: false })
    })

    it('logs that the restart waits on the background subagent', async () => {
      const restart = restartClaudeSession('c1')
      await Promise.resolve()
      const deferred = vi
        .mocked(logFrontendError)
        .mock.calls.map(([entry]) => entry)
        .filter((entry) => entry.message.includes('background'))
      expect(deferred).toEqual([
        {
          level: 'info',
          source: 'claudeAccountSwitch.restart',
          message: 'Restart of chat c1 waits on 1 background subagent'
        }
      ])
      useAcpStore.setState({ toolCalls: { c1: [launch('completed')] } } as never)
      await restart
    })

    it('does not wait for it when continuing after a limit', async () => {
      await expect(restartClaudeSession('c1', { notice: 'go on', cancelTurn: true })).resolves.toBe(
        true
      )
      expect(retryCrashedSession).toHaveBeenCalledWith('c1', { resend: false })
      expect(sendPrompt.mock.calls).toEqual([['c1', 'go on']])
    })
  })

  describe('with a command still running in the background', () => {
    const commands = (state: 'running' | 'ended') => ({
      agentId: 'agent-c1',
      revision: state === 'running' ? 1 : 2,
      commands: [
        {
          toolCallId: 'exec-1',
          title: 'Watch CI',
          command: 'gh pr checks --watch',
          startedAtMs: 1_000,
          ...(state === 'running' ? { state } : { state, endedAtMs: 2_000 })
        }
      ]
    })
    const setCommands = (state: 'running' | 'ended') =>
      useAcpStore.setState((s) => ({
        sessions: { ...s.sessions, c1: { ...s.sessions.c1, backgroundCommands: commands(state) } }
      }))

    it('defers the restart until the command ends, and logs the wait', async () => {
      setCommands('running')
      const restart = restartClaudeSession('c1')
      await Promise.resolve()
      expect(killAgent).not.toHaveBeenCalled()
      expect(
        vi
          .mocked(logFrontendError)
          .mock.calls.map(([entry]) => entry.message)
          .filter((message) => message.includes('background'))
      ).toEqual(['Restart of chat c1 waits on 1 background command'])

      setCommands('ended')
      await expect(restart).resolves.toBe(true)
      expect(killAgent).toHaveBeenCalledWith('agent-c1')
    })

    it('stops waiting when the chat closes, like a subagent wait', async () => {
      setCommands('running')
      const restart = restartClaudeSession('c1')
      await Promise.resolve()
      useAcpStore.setState((s) => ({
        sessions: { ...s.sessions, c1: { ...s.sessions.c1, status: 'closed' } }
      }))
      await expect(restart).resolves.toBe(false)
      expect(killAgent).not.toHaveBeenCalled()
    })

    it('does not wait for it when continuing after a limit, like a subagent', async () => {
      setCommands('running')
      await expect(restartClaudeSession('c1', { notice: 'go on', cancelTurn: true })).resolves.toBe(
        true
      )
      expect(killAgent).toHaveBeenCalledWith('agent-c1')
    })
  })

  it('cancels a held turn and continues with the notice, never the last prompt again', async () => {
    await restartClaudeSession('c2', {
      notice: chatSwitchNotice('Work', 'Spare', '5-hour'),
      cancelTurn: true
    })
    expect(cancelPrompt).toHaveBeenCalledWith('c2')
    expect(retryCrashedSession.mock.calls).toEqual([['c2', { resend: false }]])
    expect(sendPrompt.mock.calls).toEqual([
      [
        'c2',
        'You moved this chat from Claude account Work to Spare because Work reached its 5-hour limit. Continue the task you were working on. Subagents and background commands that were running before the switch were stopped; restart the ones that are still needed.'
      ]
    ])
  })

  it('restarts only the idle Claude chats of the project now', async () => {
    await applyProjectClaudeAccount('office')
    expect(retryCrashedSession.mock.calls).toEqual([['c1', { resend: false }]])
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('does not reopen a busy chat whose tab closed while it waited', async () => {
    await applyProjectClaudeAccount('office')
    openChatTabs(['c1'])
    useAcpStore.setState((s) => ({
      sessions: { ...s.sessions, c2: { ...s.sessions.c2, activeTurn: false, openTurnId: null } }
    }))
    await vi.waitFor(() => expect(killAgent).toHaveBeenCalledWith('agent-c2'))
    expect(retryCrashedSession.mock.calls.map(([id]) => id)).toEqual(['c1'])
  })

  it('saves the project account on the host before restarting', async () => {
    await expect(switchProjectClaudeAccount('office', 'ab12')).resolves.toBe(true)
    expect(api.setProjectAccount).toHaveBeenCalledWith('office', 'ab12', {
      expectedAccountId: undefined
    })
    expect(api.setProjectAccount.mock.invocationCallOrder[0]).toBeLessThan(
      killAgent.mock.invocationCallOrder[0]
    )
  })
})

describe('claude account switch with chats that have no open tab', () => {
  const warmKey = agentReuseKey(CLAUDE_AGENT_CONFIG_ID, '/work', 'office')

  beforeEach(() => {
    vi.spyOn(acpApi, 'killAgent').mockResolvedValue(undefined)
    killAgent.mockImplementation((agentId: string) => realKillAgent(agentId))
    retryCrashedSession.mockImplementation(async (id: string) => {
      if (id === 'warm') throw new Error('unknown session')
    })
    _addEphemeralSessionIdForTesting('warm')
    useAcpStore.setState((s) => ({
      agents: { 'agent-warm': {} as never, 'agent-bg': {} as never, 'agent-c1': {} as never },
      agentStatus: {
        'agent-warm': 'connected',
        'agent-bg': 'connected',
        'agent-c1': 'connected'
      },
      configToLiveAgent: { [warmKey]: 'agent-warm' },
      preparedSessions: { [`${CLAUDE_AGENT_CONFIG_ID}\0/work\0`]: 'warm' },
      sessions: {
        c1: s.sessions.c1,
        warm: session('warm'),
        bg: session('bg')
      },
      sessionIndex: [
        indexEntry('c1', CLAUDE_AGENT_CONFIG_ID),
        indexEntry('bg', CLAUDE_AGENT_CONFIG_ID)
      ]
    }))
    openChatTabs(['c1'])
  })

  it('drops a warm-pool chat on the old account instead of restarting it', async () => {
    await applyProjectClaudeAccount('office')
    const state = useAcpStore.getState()
    expect(retryCrashedSession.mock.calls.map(([id]) => id)).toEqual(['c1'])
    expect(state.preparedSessions).toEqual({})
    expect(state.configToLiveAgent[warmKey]).toBeUndefined()
    expect(state.sessions.warm?.status).toBe('closed')
    expect(vi.mocked(logFrontendError).mock.calls.filter(([e]) => e.level === 'warn')).toEqual([])
  })

  it('stops the agent of an idle chat whose tab was closed and does not reopen it', async () => {
    await applyProjectClaudeAccount('office')
    expect(acpApi.killAgent).toHaveBeenCalledWith('agent-bg')
    expect(useAcpStore.getState().sessions.bg?.status).toBe('closed')
    expect(retryCrashedSession).not.toHaveBeenCalledWith('bg', expect.anything())
  })

  it('lets a closed-tab chat finish its turn before stopping its agent', async () => {
    useAcpStore.setState((s) => ({
      sessions: { ...s.sessions, bg: { ...s.sessions.bg, activeTurn: true, openTurnId: 'turn-1' } }
    }))
    await applyProjectClaudeAccount('office')
    expect(acpApi.killAgent).not.toHaveBeenCalledWith('agent-bg')
    expect(useAcpStore.getState().sessions.bg?.status).toBe('active')
    useAcpStore.setState((s) => ({
      sessions: { ...s.sessions, bg: { ...s.sessions.bg, activeTurn: false, openTurnId: null } }
    }))
    await vi.waitFor(() => expect(acpApi.killAgent).toHaveBeenCalledWith('agent-bg'))
    expect(useAcpStore.getState().sessions.bg?.status).toBe('closed')
    expect(retryCrashedSession).not.toHaveBeenCalledWith('bg', expect.anything())
  })

  it('still restarts the open chat on the new account', async () => {
    await applyProjectClaudeAccount('office')
    expect(acpApi.killAgent).toHaveBeenCalledWith('agent-c1')
    expect(retryCrashedSession).toHaveBeenCalledWith('c1', { resend: false })
  })

  it('treats a chat kept for an off-screen project as open', async () => {
    useAgentChatLifetimeStore.getState().retainProjectChats('office', ['bg'])
    await applyProjectClaudeAccount('office')
    expect(retryCrashedSession).toHaveBeenCalledWith('bg', { resend: false })
  })
})

describe('claude account switch when the new account cannot resume the session', () => {
  // The failed reopen left its agent under the project key: c1 follows its project.
  const projectKey = agentReuseKey(CLAUDE_AGENT_CONFIG_ID, '/work', 'office')
  const chatKey = (id: string) => agentReuseKey(CLAUDE_AGENT_CONFIG_ID, '/work', 'office', id)

  function failReopenWith(error: Error): void {
    retryCrashedSession.mockImplementation(async (id: string) => {
      useAcpStore.setState((s) => ({
        sessions: {
          ...s.sessions,
          [id]: {
            ...s.sessions[id],
            agentId: 'agent-new',
            status: 'closed',
            lastError: `Resume failed: ${String(error)}`
          }
        }
      }))
      throw error
    })
  }

  beforeEach(() => {
    vi.spyOn(acpApi, 'newSession').mockResolvedValue({ sessionId: 's-new' } as never)
    vi.spyOn(acpApi, 'sendPrompt').mockResolvedValue('end_turn' as never)
    vi.spyOn(acpApi, 'sendPromptBlocks').mockResolvedValue('end_turn' as never)
    useAcpStore.setState({
      agentConfigs: [
        { id: CLAUDE_AGENT_CONFIG_ID, name: 'Claude Agent', command: 'claude', args: [], env: {} }
      ],
      configToLiveAgent: { [projectKey]: 'agent-new' },
      agents: { 'agent-new': { id: 'agent-new', capabilities: {} } as never },
      agentStatus: { 'agent-new': 'connected' },
      messages: {
        c1: [
          {
            id: 'm1',
            role: 'user',
            blocks: [{ type: 'text', text: 'fix the login bug' }],
            streaming: false,
            timestamp: 1,
            seq: 1
          },
          {
            id: 'm2',
            role: 'agent',
            blocks: [{ type: 'text', text: 'Fixed in auth.ts' }],
            streaming: false,
            timestamp: 2,
            seq: 2
          }
        ]
      } as never
    })
    openChatTabs(['c1'])
  })

  it('continues the chat in a new session that keeps the transcript and gets a summary', async () => {
    failReopenWith(new AcpTransportError('not_found', 'Resource not found: {"uri": "c1"}'))

    await expect(restartClaudeSession('c1')).resolves.toBe(true)

    const state = useAcpStore.getState()
    expect([...getAgentChatSessionIdsInAllTrees(useWorkspaceStore.getState())]).toEqual(['s-new'])
    expect(state.messages['s-new']?.map((m) => m.id)).toEqual([
      'switch-splice:c1:m1',
      'switch-splice:c1:m2'
    ])
    expect(acpApi.sendPrompt).toHaveBeenCalledTimes(1)
    const [agentId, sessionId, wire] = vi.mocked(acpApi.sendPrompt).mock.calls[0]
    expect([agentId, sessionId]).toEqual(['agent-new', 's-new'])
    expect(wire).toContain('fix the login bug')
    expect(wire).toContain('Fixed in auth.ts')
    expect(state.configToLiveAgent).toEqual({ [projectKey]: 'agent-new' })
  })

  it('sends the notice in the new session when continuing after a limit', async () => {
    failReopenWith(new AcpTransportError('not_found', 'Resource not found: {"uri": "c1"}'))

    await restartClaudeSession('c1', { notice: 'go on' })

    expect(retryCrashedSession).toHaveBeenCalledWith('c1', { resend: false })
    const [, sessionId, wire, , display] = vi.mocked(acpApi.sendPromptBlocks).mock.calls[0]
    expect(sessionId).toBe('s-new')
    expect(wire.slice(1)).toEqual([{ type: 'text', text: 'go on' }])
    expect(display).toEqual([{ type: 'text', text: 'go on' }])
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  describe('of a chat on its own account', () => {
    beforeEach(() => {
      api.list.mockResolvedValue(accounts({ c1: 'work' }))
      // The failed reopen spawned the chat's own agent on the chat's Account.
      useAcpStore.setState({
        configToLiveAgent: { [chatKey('c1')]: 'agent-new', [projectKey]: 'agent-project' }
      })
      failReopenWith(new AcpTransportError('not_found', 'Resource not found: {"uri": "c1"}'))
    })

    it('continues on the agent of the chat account and keeps that account for the new session', async () => {
      await restartClaudeSession('c1')

      expect(vi.mocked(acpApi.sendPrompt).mock.calls[0]?.slice(0, 2)).toEqual([
        'agent-new',
        's-new'
      ])
      expect(api.setChatAccount.mock.calls).toEqual([['office', 's-new', 'work']])
    })

    it('hands its agent to the new session, so reopening that session finds the same agent', async () => {
      const spawn = vi.spyOn(acpApi, 'spawnAgent')

      await restartClaudeSession('c1')

      expect(useAcpStore.getState().configToLiveAgent).toEqual({
        [chatKey('s-new')]: 'agent-new',
        [projectKey]: 'agent-project'
      })
      api.list.mockResolvedValue(accounts({ c1: 'work', 's-new': 'work' }))
      useAcpStore.setState((s) => ({
        sessions: { ...s.sessions, 's-new': { ...s.sessions['s-new'], status: 'closed' } }
      }))
      await expect(
        ensureLiveAgent(
          useAcpStore.getState,
          useAcpStore.setState,
          CLAUDE_AGENT_CONFIG_ID,
          '/work',
          {
            projectId: 'office',
            sessionId: await readReuseScope(CLAUDE_AGENT_CONFIG_ID, 's-new'),
            holder: 'chat'
          }
        )
      ).resolves.toBe('agent-new')
      expect(spawn).not.toHaveBeenCalled()
      spawn.mockRestore()
    })

    it('binds the new session to the chat account when the first read of the accounts fails', async () => {
      api.list
        .mockRejectedValueOnce(new Error('socket closed'))
        .mockResolvedValue(accounts({ c1: 'work' }))

      await restartClaudeSession('c1')

      expect(api.setChatAccount.mock.calls).toEqual([['office', 's-new', 'work']])
      expect(useAcpStore.getState().configToLiveAgent).toEqual({
        [chatKey('s-new')]: 'agent-new',
        [projectKey]: 'agent-project'
      })
    })

    it('keeps the agent with the old chat when the new session cannot keep the account', async () => {
      api.setChatAccount.mockResolvedValue(false)

      await restartClaudeSession('c1')

      expect(useAcpStore.getState().configToLiveAgent).toEqual({
        [chatKey('c1')]: 'agent-new',
        [projectKey]: 'agent-project'
      })
    })
  })

  it('writes no account for the new session of a chat that follows its project', async () => {
    failReopenWith(new AcpTransportError('not_found', 'Resource not found: {"uri": "c1"}'))

    await restartClaudeSession('c1')

    expect(api.setChatAccount).not.toHaveBeenCalled()
  })

  it('keeps the chat stopped when the reopen fails for another reason', async () => {
    failReopenWith(new AcpTransportError('timeout', 'session/load timed out after 30s'))

    await restartClaudeSession('c1')

    expect([...getAgentChatSessionIdsInAllTrees(useWorkspaceStore.getState())]).toEqual(['c1'])
    expect(acpApi.newSession).not.toHaveBeenCalled()
    expect(useAcpStore.getState().sessions.c1?.lastError).toBe(
      'Resume failed: AcpTransportError: session/load timed out after 30s'
    )
  })
})

describe('a switch the host refuses', () => {
  it('leaves the open chats and their agents untouched', async () => {
    const before = useAcpStore.getState().sessions
    api.setProjectAccount.mockRejectedValue(
      new AcpTransportError(
        'claude_account_signed_out',
        'The Claude account "Work" is not signed in. Sign in to it in Settings → Accounts, then choose it again.'
      )
    )
    await expect(switchProjectClaudeAccount('office', 'ab12')).rejects.toMatchObject({
      code: 'claude_account_signed_out'
    })
    expect(killAgent).not.toHaveBeenCalled()
    expect(retryCrashedSession).not.toHaveBeenCalled()
    expect(useAcpStore.getState().sessions).toBe(before)
    expect(useAcpStore.getState().sessions.c1.status).toBe('active')
  })

  it('restarts nothing when another client switched the project first', async () => {
    const before = useAcpStore.getState().sessions
    api.setProjectAccount.mockResolvedValue(false)
    await expect(
      switchProjectClaudeAccount('office', 'ab12', { expectedAccountId: 'default' })
    ).resolves.toBe(false)
    expect(api.setProjectAccount).toHaveBeenCalledWith('office', 'ab12', {
      expectedAccountId: 'default'
    })
    expect(killAgent).not.toHaveBeenCalled()
    expect(retryCrashedSession).not.toHaveBeenCalled()
    expect(useAcpStore.getState().sessions).toBe(before)
  })
})

describe('a chat with its own account', () => {
  const c1 = {
    sessionId: 'c1',
    projectId: 'office',
    runsOn: 'default',
    ownAccountId: null,
    projectAccountId: 'default'
  }

  it('restarts nothing when the chat account changed elsewhere first', async () => {
    const before = useAcpStore.getState().sessions
    api.setChatAccount.mockResolvedValue(false)
    await expect(switchChatClaudeAccount(c1, 'work')).resolves.toBe('lost')
    expect(api.setChatAccount).toHaveBeenCalledWith('office', 'c1', 'work', {
      expectedAccountId: 'default'
    })
    expect(killAgent).not.toHaveBeenCalled()
    expect(retryCrashedSession).not.toHaveBeenCalled()
    expect(useAcpStore.getState().sessions).toBe(before)
  })

  it('writes and restarts nothing when the pick is the choice the chat already has', async () => {
    await expect(
      switchChatClaudeAccount({ ...c1, runsOn: 'work', ownAccountId: 'work' }, 'work')
    ).resolves.toBe('unchanged')
    await expect(switchChatClaudeAccount(c1, null)).resolves.toBe('unchanged')
    expect(api.setChatAccount).not.toHaveBeenCalled()
    expect(killAgent).not.toHaveBeenCalled()
    expect(retryCrashedSession).not.toHaveBeenCalled()
  })

  it('pins a chat that follows its project to the account it runs without a restart', async () => {
    await expect(switchChatClaudeAccount(c1, 'default')).resolves.toBe('kept')
    expect(api.setChatAccount.mock.calls).toEqual([
      ['office', 'c1', 'default', { expectedAccountId: 'default' }]
    ])
    expect(killAgent).not.toHaveBeenCalled()
    expect(retryCrashedSession).not.toHaveBeenCalled()
    // A reopen of the pinned chat looks its own key up and finds its agent.
    expect(useAcpStore.getState().configToLiveAgent).toEqual({
      [agentReuseKey(CLAUDE_AGENT_CONFIG_ID, '/work', 'office', 'c1')]: 'agent-c1'
    })
  })

  it('reports a pin as lost when the host moved the chat first', async () => {
    api.setChatAccount.mockResolvedValue(false)
    await expect(switchChatClaudeAccount(c1, 'default')).resolves.toBe('lost')
    expect(killAgent).not.toHaveBeenCalled()
  })

  it('keeps its agent when following the project lands on the account it runs', async () => {
    await expect(
      switchChatClaudeAccount(
        { ...c1, runsOn: 'work', ownAccountId: 'work', projectAccountId: 'work' },
        null
      )
    ).resolves.toBe('kept')
    expect(api.setChatAccount).toHaveBeenCalledWith('office', 'c1', null, {
      expectedAccountId: 'work'
    })
    expect(killAgent).not.toHaveBeenCalled()
    expect(retryCrashedSession).not.toHaveBeenCalled()
  })

  it('restarts only that chat on its new account', async () => {
    await expect(switchChatClaudeAccount(c1, 'work')).resolves.toBe('restarted')
    expect(api.setProjectAccount).not.toHaveBeenCalled()
    expect(killAgent.mock.calls).toEqual([['agent-c1']])
    expect(retryCrashedSession.mock.calls).toEqual([['c1', { resend: false }]])
    expect(sendPrompt).not.toHaveBeenCalled()
  })

  it('continues a chat at its limit with the notice', async () => {
    await expect(
      switchChatClaudeAccount({ ...c1, sessionId: 'c2' }, 'work', { notice: 'go on' })
    ).resolves.toBe('restarted')
    expect(cancelPrompt).toHaveBeenCalledWith('c2')
    expect(retryCrashedSession.mock.calls).toEqual([['c2', { resend: false }]])
    expect(sendPrompt.mock.calls).toEqual([['c2', 'go on']])
  })

  it('closes only its session when other chats run on the same agent', async () => {
    const closeSession = vi.spyOn(acpApi, 'closeSession').mockResolvedValue(undefined)
    useAcpStore.setState((s) => ({
      sessions: {
        ...s.sessions,
        c1: { ...s.sessions.c1, agentId: 'agent-shared' },
        c2: { ...s.sessions.c2, agentId: 'agent-shared' }
      }
    }))
    await expect(
      switchChatClaudeAccount({ ...c1, runsOn: 'work', ownAccountId: 'work' }, null)
    ).resolves.toBe('restarted')
    expect(closeSession).toHaveBeenCalledWith('agent-shared', 'c1')
    expect(killAgent).not.toHaveBeenCalled()
    expect(retryCrashedSession.mock.calls).toEqual([['c1', { resend: false }]])
    closeSession.mockRestore()
  })

  describe('when its project account changes', () => {
    beforeEach(() => {
      useAcpStore.setState((s) => ({
        sessions: { ...s.sessions, c2: { ...s.sessions.c2, activeTurn: false, openTurnId: null } }
      }))
    })

    it('is left alone', async () => {
      api.list.mockResolvedValue(accounts({ c1: 'work' }))
      await applyProjectClaudeAccount('office')
      expect(retryCrashedSession.mock.calls.map(([id]) => id)).toEqual(['c2'])
      expect(killAgent.mock.calls).toEqual([['agent-c2']])
    })

    it('follows its project when its own account no longer exists', async () => {
      api.list.mockResolvedValue(accounts({ c1: 'gone' }))
      await applyProjectClaudeAccount('office')
      expect(retryCrashedSession.mock.calls.map(([id]) => id).sort()).toEqual(['c1', 'c2'])
    })

    it('restarts every chat of the project when the accounts cannot be listed', async () => {
      api.list.mockRejectedValue(new Error('offline'))
      await applyProjectClaudeAccount('office')
      expect(retryCrashedSession.mock.calls.map(([id]) => id).sort()).toEqual(['c1', 'c2'])
    })
  })

  describe('when its own account is removed', () => {
    it('restarts the chat on its project account and leaves the project alone', async () => {
      const snapshot = { ...accounts(), projectAccounts: { office: 'work' } }
      api.list.mockResolvedValue(snapshot)
      await applyRemovedClaudeAccount({ movedProjectIds: [], movedChatIds: ['c1', 'closed'] })
      expect(killAgent.mock.calls).toEqual([['agent-c1']])
      expect(retryCrashedSession.mock.calls).toEqual([['c1', { resend: false }]])
      expect(claudeAccountFor(snapshot, 'office', 'c1')).toBe('work')
    })

    it('restarts a chat of a moved project once, with its project', async () => {
      useAcpStore.setState((s) => ({
        sessions: { ...s.sessions, c2: { ...s.sessions.c2, activeTurn: false, openTurnId: null } }
      }))
      await applyRemovedClaudeAccount(
        { movedProjectIds: ['office'], movedChatIds: ['c1', 'elsewhere'] },
        []
      )
      expect(retryCrashedSession.mock.calls.map(([id]) => id).sort()).toEqual([
        'c1',
        'c2',
        'elsewhere'
      ])
      expect(killAgent.mock.calls.map(([id]) => id).sort()).toEqual([
        'agent-c1',
        'agent-c2',
        'agent-elsewhere'
      ])
    })
  })
})
