import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

import type { AcpTransport } from '@/lib/acp-transport'
import type { WatchHandlers } from '@/lib/acp-transport/watch-client'
import { useAgentChatUnreadStore } from '@/stores/agent-chat-unread-store'
import { markChatRead, noteTurnEndSeq, startChatReadSync } from './chat-read-sync'

function fakeSurface(
  markChatReadImpl = vi.fn(async (sessionId: string, seq: number, logEpoch: string | null) => ({
    sessionId,
    seq,
    logEpoch: logEpoch ?? undefined
  }))
) {
  let watch: WatchHandlers | null = null
  const transport = {
    watches: {
      subscribe: (name: string, handlers: WatchHandlers) => {
        expect(name).toBe('chat_reads')
        watch = handlers
        return () => {
          watch = null
        }
      }
    },
    markChatRead: markChatReadImpl
  } as unknown as AcpTransport
  return {
    transport,
    readState: (marks: Record<string, number>, logEpochs?: Record<string, string>) =>
      watch?.onState({ marks, logEpochs }),
    readDelta: (sessionId: string, seq: number, logEpoch?: string) =>
      watch?.onDelta?.({ sessionId, seq, logEpoch }),
    watching: () => watch !== null
  }
}

function unreadIds(): string[] {
  return Object.keys(useAgentChatUnreadStore.getState().unread).sort()
}

beforeEach(() => {
  useAgentChatUnreadStore.setState({
    unread: {},
    unreadSince: {},
    seenTurnEnd: {},
    sharedRead: {}
  })
})

describe('startChatReadSync', () => {
  it('clears the dot banked here when another surface reads the same turn end', () => {
    const desktop = fakeSurface()
    const stop = startChatReadSync(desktop.transport)
    desktop.readState({})
    useAgentChatUnreadStore.getState().markUnread('s1', null)
    useAgentChatUnreadStore.getState().markUnread('s2', null)
    noteTurnEndSeq('s1', 7, 'e1')
    noteTurnEndSeq('s2', 9, 'e1')

    desktop.readDelta('s1', 7, 'e1')

    expect(unreadIds()).toEqual(['s2'])
    stop()
    expect(desktop.watching()).toBe(false)
  })

  it('keeps the dot when the other surface is behind the newest turn end', () => {
    const desktop = fakeSurface()
    startChatReadSync(desktop.transport)
    useAgentChatUnreadStore.getState().markUnread('s1', null)
    noteTurnEndSeq('s1', 7, 'e1')
    noteTurnEndSeq('s1', 15, 'e1')

    desktop.readState({ s1: 7 }, { s1: 'e1' })

    expect(unreadIds()).toEqual(['s1'])
  })

  it('clears a dot once its turn end in the restarted host log is read elsewhere', () => {
    const phone = fakeSurface()
    startChatReadSync(phone.transport)
    phone.readState({})
    noteTurnEndSeq('s1', 50, 'e1')
    useAgentChatUnreadStore.getState().markUnread('s1')
    noteTurnEndSeq('s1', 3, 'e2')

    phone.readDelta('s1', 3, 'e2')

    expect(unreadIds()).toEqual([])
  })

  it('keeps a dot from the restarted host log that only a marker from the old log covers', () => {
    const phone = fakeSurface()
    startChatReadSync(phone.transport)
    noteTurnEndSeq('s1', 4, 'e2')
    useAgentChatUnreadStore.getState().markUnread('s1')
    noteTurnEndSeq('s1', 12, 'e2')

    phone.readState({ s1: 50 }, { s1: 'e1' })

    expect(unreadIds()).toEqual(['s1'])
  })
})

describe('noteTurnEndSeq', () => {
  it('ignores a turn end that carries no seq', () => {
    noteTurnEndSeq('s1', undefined, 'e1')
    noteTurnEndSeq('s1', 0, 'e1')

    expect(useAgentChatUnreadStore.getState().seenTurnEnd).toEqual({})
  })
})

describe('markChatRead', () => {
  it('applies the host marker from the reply', async () => {
    const reply = vi.fn(async (sessionId: string) => ({ sessionId, seq: 11, logEpoch: 'e1' }))
    const phone = fakeSurface(reply)

    markChatRead('s1', { logEpoch: 'e1', seq: 7 }, phone.transport)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(reply).toHaveBeenCalledWith('s1', 7, 'e1')
    expect(useAgentChatUnreadStore.getState().sharedRead).toEqual({
      s1: { logEpoch: 'e1', seq: 11 }
    })
  })

  it('never lowers the marker with a reply that lost the race to a newer delta', async () => {
    const reply = vi.fn(async (sessionId: string) => ({ sessionId, seq: 15, logEpoch: 'e1' }))
    const phone = fakeSurface(reply)
    startChatReadSync(phone.transport)
    phone.readState({})

    markChatRead('s3', { logEpoch: 'e1', seq: 15 }, phone.transport)
    phone.readDelta('s3', 20, 'e1')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useAgentChatUnreadStore.getState().sharedRead).toEqual({
      s3: { logEpoch: 'e1', seq: 20 }
    })
  })

  it('sends a seq once while it is in flight and again after a failure', async () => {
    const failing = vi.fn(async () => {
      throw new Error('host gone')
    })
    const phone = fakeSurface(failing)

    markChatRead('s2', { logEpoch: 'e1', seq: 7 }, phone.transport)
    markChatRead('s2', { logEpoch: 'e1', seq: 7 }, phone.transport)
    markChatRead('s2', { logEpoch: 'e1', seq: 5 }, phone.transport)
    expect(failing).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 0))

    markChatRead('s2', { logEpoch: 'e1', seq: 7 }, phone.transport)
    expect(failing).toHaveBeenCalledTimes(2)
    expect(failing).toHaveBeenLastCalledWith('s2', 7, 'e1')
  })
})
