import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('@/lib/tauri-runtime', () => ({ isTauriContext: vi.fn(() => false) }))

import { seedProjectStore } from '@/lib/test-utils/store'
import type { Project } from '@/types/project'
import { agentReuseKey, detachedReuseKey } from '../acp-reuse-keys'
import { ephemeralSessionIds } from './ephemeral-ids'
import {
  _resetDefiniteSpawnRejectionsForTesting,
  _resetInFlightPreparedForTesting,
  ensureLiveAgent
} from './shared-state'
import type { AcpState } from './types'

type Config = AcpState['agentConfigs'][number]

const WORK_KEY = agentReuseKey('cfg-1', '/work/app', 'proj-1')

function makeStore(config: Partial<Config> = {}) {
  const state = {
    agentConfigs: [
      {
        id: 'cfg-1',
        name: 'Claude',
        command: 'claude-acp',
        args: [],
        env: {},
        allowTerminal: false,
        ...config
      }
    ],
    configToLiveAgent: {} as Record<string, string>,
    agentStatus: {} as Record<string, string>,
    sessions: {} as Record<string, { id: string; agentId: string; status: string }>,
    preparedSessions: {} as Record<string, string>,
    warmingConfigs: {},
    spawnAgent: vi.fn(),
    killAgent: vi.fn(async () => {})
  }
  const get = () => state as unknown as AcpState
  const set = (fn: (s: AcpState) => Partial<AcpState> | AcpState) => {
    Object.assign(state, fn(state as unknown as AcpState))
  }
  return { state, get, set }
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Work',
    color: 'blue',
    path: '/work/app',
    envVars: [{ key: 'CLAUDE_CONFIG_DIR', value: '/home/me/.claude-work', enabled: true }],
    ...overrides
  }
}

const spawnedEnv = (spawnAgent: ReturnType<typeof vi.fn>, call = 0): Record<string, string> =>
  spawnAgent.mock.calls[call]?.[0]?.env

describe('ensureLiveAgent — project environment variables (#1118)', () => {
  beforeEach(() => {
    _resetDefiniteSpawnRejectionsForTesting()
    seedProjectStore([])
  })

  it('spawns the agent with the env of the project that owns the cwd', async () => {
    seedProjectStore([project()])
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValue('agent-1')

    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-1')
    expect(spawnedEnv(state.spawnAgent)).toEqual({ CLAUDE_CONFIG_DIR: '/home/me/.claude-work' })
  })

  it('resolves a worktree and a nested cwd to their project', async () => {
    seedProjectStore([
      project({
        worktrees: [{ id: 'wt', name: 'wt', branch: 'b', path: '/tmp/wt', createdAt: '' }]
      })
    ])
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValue('agent-1')

    await ensureLiveAgent(get, set, 'cfg-1', '/tmp/wt')
    await ensureLiveAgent(get, set, 'cfg-1', '/work/app/packages/ui')
    expect(spawnedEnv(state.spawnAgent, 0)).toEqual({ CLAUDE_CONFIG_DIR: '/home/me/.claude-work' })
    expect(spawnedEnv(state.spawnAgent, 1)).toEqual({ CLAUDE_CONFIG_DIR: '/home/me/.claude-work' })
  })

  it('layers the agent config env on top of the project env and resolves $ references', async () => {
    seedProjectStore([
      project({
        envVars: [
          { key: 'CLAUDE_CONFIG_DIR', value: '/home/me/.claude-work', enabled: true },
          { key: 'TOKEN', value: 'from-project', enabled: true }
        ]
      })
    ])
    const { state, get, set } = makeStore({
      env: { CLAUDE_CONFIG_DIR: '/home/me/.claude-agent', AGENT_TOKEN: '$TOKEN', MISSING: '$NOPE' }
    })
    state.spawnAgent.mockResolvedValue('agent-1')

    await ensureLiveAgent(get, set, 'cfg-1', '/work/app')
    expect(spawnedEnv(state.spawnAgent)).toEqual({
      CLAUDE_CONFIG_DIR: '/home/me/.claude-agent',
      TOKEN: 'from-project',
      AGENT_TOKEN: 'from-project'
    })
  })

  it('sends only the agent config env when no project owns the cwd', async () => {
    seedProjectStore([project()])
    const { state, get, set } = makeStore({ env: { FOO: 'bar' } })
    state.spawnAgent.mockResolvedValue('agent-1')

    await ensureLiveAgent(get, set, 'cfg-1', '/elsewhere')
    expect(spawnedEnv(state.spawnAgent)).toEqual({ FOO: 'bar' })
  })

  it('gives the next chat a fresh agent when the project env changed and leaves the old one running', async () => {
    seedProjectStore([project()])
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValueOnce('agent-1').mockResolvedValueOnce('agent-2')

    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-1')
    state.agentStatus['agent-1'] = 'connected'
    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-1')
    expect(state.spawnAgent).toHaveBeenCalledTimes(1)

    seedProjectStore([
      project({ envVars: [{ key: 'CLAUDE_CONFIG_DIR', value: '/home/me/.claude-personal' }] })
    ])
    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-2')
    expect(spawnedEnv(state.spawnAgent, 1)).toEqual({
      CLAUDE_CONFIG_DIR: '/home/me/.claude-personal'
    })
    expect(state.configToLiveAgent[WORK_KEY]).toBe('agent-2')
    // A session/new on agent-1 may still be in flight with no session in view.
    expect(state.killAgent).not.toHaveBeenCalled()
    expect(state.configToLiveAgent[detachedReuseKey(WORK_KEY, 'agent-1')]).toBe('agent-1')
  })

  it('does not stop a commit message generation running on the stale agent', async () => {
    seedProjectStore([project()])
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValueOnce('agent-1').mockResolvedValueOnce('agent-2')
    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-1')
    state.agentStatus['agent-1'] = 'connected'
    state.sessions = { 'commit-msg': { id: 'commit-msg', agentId: 'agent-1', status: 'active' } }
    ephemeralSessionIds.add('commit-msg')

    try {
      seedProjectStore([
        project({ envVars: [{ key: 'CLAUDE_CONFIG_DIR', value: '/home/me/.claude-personal' }] })
      ])
      expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-2')
      expect(state.killAgent).not.toHaveBeenCalled()
      expect(state.configToLiveAgent[detachedReuseKey(WORK_KEY, 'agent-1')]).toBe('agent-1')
    } finally {
      ephemeralSessionIds.delete('commit-msg')
    }
  })

  it('takes the env, the Account and the reuse key from the explicit project', async () => {
    seedProjectStore([
      project(),
      project({
        id: 'proj-2',
        path: '/other',
        envVars: [{ key: 'CLAUDE_CONFIG_DIR', value: '/home/me/.claude-other', enabled: true }]
      })
    ])
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValue('agent-1')

    await ensureLiveAgent(get, set, 'cfg-1', '/work/app', { projectId: 'proj-2' })
    expect(spawnedEnv(state.spawnAgent)).toEqual({ CLAUDE_CONFIG_DIR: '/home/me/.claude-other' })
    expect(state.spawnAgent.mock.calls[0]?.[1]).toBe('proj-2')
    expect(state.configToLiveAgent[agentReuseKey('cfg-1', '/work/app', 'proj-2')]).toBe('agent-1')
  })

  it('gives a worktree outside the project root the project Account and reuse key', async () => {
    seedProjectStore([
      project({
        worktrees: [{ id: 'wt', name: 'wt', branch: 'b', path: '/tmp/wt', createdAt: '' }]
      })
    ])
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValue('agent-1')

    await ensureLiveAgent(get, set, 'cfg-1', '/tmp/wt')
    expect(spawnedEnv(state.spawnAgent)).toEqual({ CLAUDE_CONFIG_DIR: '/home/me/.claude-work' })
    expect(state.spawnAgent.mock.calls[0]?.[1]).toBe('proj-1')
    expect(state.configToLiveAgent[agentReuseKey('cfg-1', '/tmp/wt', 'proj-1')]).toBe('agent-1')
  })

  it('keeps reusing a live agent it did not spawn itself (no recorded launch)', async () => {
    seedProjectStore([project()])
    const { state, get, set } = makeStore()
    state.configToLiveAgent[WORK_KEY] = 'agent-host'
    state.agentStatus['agent-host'] = 'connected'

    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-host')
    expect(state.spawnAgent).not.toHaveBeenCalled()
    expect(state.killAgent).not.toHaveBeenCalled()
  })
})

describe('ensureLiveAgent — one Agent process per chat, warm sessions included', () => {
  beforeEach(() => {
    _resetDefiniteSpawnRejectionsForTesting()
    _resetInFlightPreparedForTesting()
    seedProjectStore([project()])
  })

  it('gives a chat its own agent while a warm prepare spawns one for the same project', async () => {
    const { state, get, set } = makeStore()
    let finishWarm!: (id: string) => void
    state.spawnAgent
      .mockImplementationOnce(() => new Promise((resolve) => (finishWarm = resolve)))
      .mockResolvedValueOnce('agent-chat')

    const warm = ensureLiveAgent(get, set, 'cfg-1', '/work/app', { holder: 'warm' })
    const chat = ensureLiveAgent(get, set, 'cfg-1', '/work/app', { holder: 'chat' })
    finishWarm('agent-warm')

    expect(await warm).toBe('agent-warm')
    expect(await chat).toBe('agent-chat')
  })

  it('gives a warm prepare its own agent while a chat spawns one for the same project', async () => {
    const { state, get, set } = makeStore()
    let finishChat!: (id: string) => void
    state.spawnAgent
      .mockImplementationOnce(() => new Promise((resolve) => (finishChat = resolve)))
      .mockResolvedValueOnce('agent-warm')

    const chat = ensureLiveAgent(get, set, 'cfg-1', '/work/app', { holder: 'chat' })
    const warm = ensureLiveAgent(get, set, 'cfg-1', '/work/app', { holder: 'warm' })
    finishChat('agent-chat')

    expect(await chat).toBe('agent-chat')
    expect(await warm).toBe('agent-warm')
  })

  it('does not reopen a chat on the agent that hosts the warm session', async () => {
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValueOnce('agent-warm').mockResolvedValueOnce('agent-chat')
    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app', { holder: 'warm' })).toBe(
      'agent-warm'
    )
    state.agentStatus['agent-warm'] = 'connected'
    state.sessions.warm = { id: 'warm', agentId: 'agent-warm', status: 'active' }
    ephemeralSessionIds.add('warm')
    state.preparedSessions['cfg-1\0/work/app\0'] = 'warm'
    try {
      // A commit message may share the warm agent; a chat may not.
      expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-warm')
      expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app', { holder: 'chat' })).toBe(
        'agent-chat'
      )
      expect(state.spawnAgent).toHaveBeenCalledTimes(2)
    } finally {
      ephemeralSessionIds.delete('warm')
    }
  })

  it('does not warm a session on an agent just handed to a chat', async () => {
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValueOnce('agent-chat').mockResolvedValueOnce('agent-warm')
    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app', { holder: 'chat' })).toBe(
      'agent-chat'
    )
    state.agentStatus['agent-chat'] = 'connected'
    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app', { holder: 'warm' })).toBe(
      'agent-warm'
    )
  })
})

describe('ensureLiveAgent — an agent opened for one existing chat', () => {
  beforeEach(() => {
    _resetDefiniteSpawnRejectionsForTesting()
    _resetInFlightPreparedForTesting()
    seedProjectStore([project()])
  })

  it('spawns for the chat, keys the agent to it, and a new chat does not reuse it', async () => {
    const { state, get, set } = makeStore()
    state.spawnAgent.mockResolvedValueOnce('agent-chat').mockResolvedValueOnce('agent-new')

    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app', { sessionId: 's1' })).toBe(
      'agent-chat'
    )
    expect(state.spawnAgent.mock.calls[0]?.slice(1)).toEqual(['proj-1', 's1'])
    expect(state.configToLiveAgent).toEqual({
      'cfg-1\0/work/app\0project\0proj-1\0chat\0s1': 'agent-chat'
    })

    state.agentStatus['agent-chat'] = 'connected'
    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app')).toBe('agent-new')
    expect(state.spawnAgent.mock.calls[1]?.slice(1)).toEqual(['proj-1', undefined])
  })

  it('reuses the chat agent for a later reopen of the same chat', async () => {
    const { state, get, set } = makeStore()
    state.configToLiveAgent[agentReuseKey('cfg-1', '/work/app', 'proj-1', 's1')] = 'agent-chat'
    state.agentStatus['agent-chat'] = 'connected'

    expect(await ensureLiveAgent(get, set, 'cfg-1', '/work/app', { sessionId: 's1' })).toBe(
      'agent-chat'
    )
    expect(state.spawnAgent).not.toHaveBeenCalled()
  })
})
