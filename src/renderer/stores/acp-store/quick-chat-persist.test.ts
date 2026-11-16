import { describe, expect, it } from 'vitest'
import type { SessionIndexEntry } from '@/lib/acp-history-persistence'
import { quickSessions } from '@/lib/acp-history-persistence'
import { persistSession } from './shared-state'
import type { AcpSession } from './types'

const NOW = 1_700_000_000_000

function quickEntry(): SessionIndexEntry {
  return {
    id: 's-quick',
    agentId: 'a1',
    title: 'Pwd output',
    cwd: '/home/me/.troupe/quick-chats/folder-1',
    projectId: '__unassigned__',
    createdAt: NOW,
    lastActivityAt: NOW,
    messageCount: 1,
    status: 'active',
    kind: 'quick'
  }
}

describe('persistSession keeps a quick chat in the list', () => {
  it('copies kind through a local update so the chat stays in Quick chats', () => {
    const session = {
      id: 's-quick',
      agentId: 'a1',
      title: 'Pwd output',
      cwd: '/home/me/.troupe/quick-chats/folder-1',
      projectId: '__unassigned__',
      createdAt: NOW,
      status: 'active',
      activeTurn: true
    } as unknown as AcpSession
    let written: SessionIndexEntry[] = []
    persistSession(
      {
        sessions: { 's-quick': session },
        messages: {
          's-quick': [
            {
              id: 'm1',
              role: 'user',
              blocks: [],
              streaming: false,
              timestamp: NOW
            }
          ]
        },
        toolCalls: {},
        sessionIndex: [quickEntry()],
        configToLiveAgent: {}
      },
      's-quick',
      (entries) => {
        written = entries
      }
    )
    expect(written[0]?.kind).toBe('quick')
    expect(quickSessions(written).map((entry) => entry.id)).toEqual(['s-quick'])
  })

  it('keeps kind when the live session already carries it', () => {
    const session = {
      id: 's-quick',
      agentId: 'a1',
      title: null,
      cwd: '/home/me/.troupe/quick-chats/folder-1',
      projectId: '__unassigned__',
      createdAt: NOW,
      status: 'active',
      kind: 'quick'
    } as unknown as AcpSession
    let written: SessionIndexEntry[] = []
    persistSession(
      {
        sessions: { 's-quick': session },
        messages: { 's-quick': [] },
        toolCalls: {},
        sessionIndex: [],
        configToLiveAgent: {}
      },
      's-quick',
      (entries) => {
        written = entries
      }
    )
    expect(written[0]?.kind).toBe('quick')
  })
})
