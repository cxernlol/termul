import type { ClaudeRateLimit } from '@shared/types/claude-accounts.types'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAcpStore } from '@/stores/acp-store'
import { FRESH } from '@/stores/acp-store/testkit'
import { applyClaudeLimitAction, FOLLOW_WAIT_MS, useClaudeResumeAt } from './limit-actions'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }))

const rejected: ClaudeRateLimit = {
  status: 'rejected',
  resetsAt: 1_900_000_000,
  kind: 'five_hour',
  percent: 100,
  overageInUse: false
}

function seed(agentId: string, liveAgents: string[]): void {
  useAcpStore.setState({
    ...FRESH,
    sessions: {
      s1: {
        id: 's1',
        agentId,
        cwd: '/work',
        projectId: 'office',
        status: 'closed',
        title: null,
        activeTurn: false,
        openTurnId: null,
        modes: null,
        models: null,
        configOptions: [],
        lastError: null,
        createdAt: 1
      }
    },
    agentStatus: Object.fromEntries(liveAgents.map((id) => [id, 'connected'])),
    sessionUsage: {
      s1: {
        used: 1,
        size: 10,
        baselineUsed: 1,
        updatedAt: 1,
        source: 'reported',
        rateLimit: rejected
      }
    }
  } as never)
}

const switched = {
  sessionId: 's1',
  projectId: 'office',
  action: 'switched' as const,
  from: { id: 'ab12', name: 'Work' },
  to: { id: 'cd34', name: 'Side' },
  fromAgentId: 'old',
  newAgentId: 'new'
}

beforeEach(() => {
  vi.clearAllMocks()
  useClaudeResumeAt.setState({}, true)
})

describe('applyClaudeLimitAction', () => {
  it('points a chat the host moved at the new agent and clears its limit', () => {
    seed('old', ['new'])
    applyClaudeLimitAction(switched)
    const state = useAcpStore.getState()
    expect(state.sessions.s1.agentId).toBe('new')
    expect(state.sessions.s1.status).toBe('active')
    expect(state.sessionUsage.s1).toEqual({
      used: 1,
      size: 10,
      baselineUsed: 1,
      updatedAt: 1,
      source: 'reported'
    })
    expect(toast.success).toHaveBeenCalledWith('Work reached its limit. Continued on Side.')
  })

  it('leaves a chat alone when a replayed event names an agent it no longer runs on', () => {
    seed('later', ['later'])
    applyClaudeLimitAction(switched)
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('later')
    expect(useAcpStore.getState().sessionUsage.s1.rateLimit).toEqual(rejected)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('follows the new agent once it connects here after the event', () => {
    seed('old', [])
    applyClaudeLimitAction(switched)
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('old')
    expect(toast.success).not.toHaveBeenCalled()

    useAcpStore.setState((s) => ({ agentStatus: { ...s.agentStatus, new: 'connected' } }))
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('new')
    expect(useAcpStore.getState().sessionUsage.s1.rateLimit).toBeUndefined()
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it('stops waiting for a new agent that never connects here', () => {
    vi.useFakeTimers()
    try {
      seed('old', [])
      applyClaudeLimitAction(switched)
      vi.advanceTimersByTime(FOLLOW_WAIT_MS)
      useAcpStore.setState((s) => ({ agentStatus: { ...s.agentStatus, new: 'connected' } }))
      expect(useAcpStore.getState().sessions.s1.agentId).toBe('old')
      expect(toast.success).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops a waiting follow when the chat moved to another agent first', () => {
    seed('old', [])
    applyClaudeLimitAction(switched)
    useAcpStore.setState((s) => ({
      sessions: { ...s.sessions, s1: { ...s.sessions.s1, agentId: 'mine' } }
    }))
    useAcpStore.setState((s) => ({ agentStatus: { ...s.agentStatus, new: 'connected' } }))
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('mine')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('follows the agent a resume at the reset started, and clears the scheduled time', () => {
    seed('reaped', ['fresh'])
    applyClaudeLimitAction({
      sessionId: 's1',
      projectId: 'office',
      action: 'resume_scheduled',
      at: 1_900_000_000_000
    })
    expect(useClaudeResumeAt.getState()).toEqual({ s1: 1_900_000_000_000 })
    applyClaudeLimitAction({
      sessionId: 's1',
      projectId: 'office',
      action: 'resumed',
      fromAgentId: 'reaped',
      newAgentId: 'fresh'
    })
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('fresh')
    expect(useClaudeResumeAt.getState()).toEqual({})
  })

  it('reports each failed continue once, even when a later one has the same reason', () => {
    seed('old', [])
    const failed = {
      sessionId: 's1',
      projectId: 'office',
      action: 'failed' as const,
      reason: 'The host restarted while this chat waited for its limit to reset.'
    }
    applyClaudeLimitAction(failed, 7)
    applyClaudeLimitAction(failed, 7)
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(toast.warning).toHaveBeenCalledWith('Troupe could not continue the chat', {
      description: 'The host restarted while this chat waited for its limit to reset.'
    })
    applyClaudeLimitAction(failed, 12)
    expect(toast.warning).toHaveBeenCalledTimes(2)
  })
})
