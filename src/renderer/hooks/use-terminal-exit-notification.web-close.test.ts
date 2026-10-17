import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { FakeWS } = await vi.hoisted(async () => {
  const terminalFixtures = await import('@/lib/test-utils/terminal')
  type Request = { id: string; type: string; payload: Record<string, unknown> }

  class FakeWS {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    static instances: FakeWS[] = []

    readyState = 0
    onopen: ((ev: Event) => void) | null = null
    onmessage: ((ev: MessageEvent) => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    onclose: ((ev: CloseEvent) => void) | null = null
    held: Request | null = null

    constructor(public url: string) {
      FakeWS.instances.push(this)
      queueMicrotask(() => {
        this.readyState = FakeWS.OPEN
        this.onopen?.(new Event('open'))
      })
    }

    send(data: string): void {
      const req = JSON.parse(data) as Request
      if (req.type === 'kill') {
        this.held = req
        return
      }
      const result =
        req.type === 'spawn'
          ? terminalFixtures.mockSpawnedTerminal({
              id: 'pty-web-1',
              cwd: '/tmp',
              pid: 7,
              claim: 'claim-1'
            })
          : req.type === 'attach'
            ? terminalFixtures.mockAttachResult({
                id: req.payload.terminalId as string,
                cwd: '/tmp',
                pid: 7
              })
            : undefined
      queueMicrotask(() => this.push({ id: req.id, success: true, data: result }))
    }

    close(): void {}

    push(frame: unknown): void {
      this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(frame) }))
    }

    settleKill(): void {
      if (this.held) this.push({ id: this.held.id, success: true, data: undefined })
    }
  }

  vi.stubGlobal('WebSocket', FakeWS)
  return { FakeWS }
})

vi.mock('@/lib/api', async () => {
  const { createWebTerminalApi } = await import('@/lib/web-terminal-api')
  return { terminalApi: createWebTerminalApi() }
})
vi.mock('@/lib/tauri-notification-api', () => ({ sendDesktopNotification: vi.fn() }))

import { terminalApi } from '@/lib/api'
import { sendDesktopNotification } from '@/lib/tauri-notification-api'
import {
  mockProject,
  resetProjectStore,
  resetTerminalStore,
  seedProjectStore,
  seedTerminalStore
} from '@/lib/test-utils/store'
import { mockTerminal } from '@/lib/test-utils/terminal'
import { useTerminalExitNotification } from './use-terminal-exit-notification'

async function spawnTrackedTerminal(): Promise<FakeWS> {
  const spawned = await terminalApi.spawn({ cols: 80, rows: 24 })
  expect(spawned).toMatchObject({ success: true })
  return FakeWS.instances[0]
}

describe('web terminal exit notification when the user closes a terminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedProjectStore([mockProject({ id: 'proj-1', name: 'My Project' })], 'proj-1')
    seedTerminalStore(
      [mockTerminal({ id: 'term-1', ptyId: 'pty-web-1', name: 'Terminal 1', projectId: 'proj-1' })],
      { activeTerminalId: 'term-1' }
    )
    renderHook(() => useTerminalExitNotification())
  })

  afterEach(() => {
    resetProjectStore()
    resetTerminalStore()
  })

  it('stays silent when the exit event of a killed pty arrives before the kill reply', async () => {
    const socket = await spawnTrackedTerminal()

    const closing = terminalApi.kill('pty-web-1')
    await vi.waitFor(() => expect(socket.held).not.toBeNull())
    socket.push({
      type: 'event',
      payload: { type: 'exit', terminal_id: 'pty-web-1', exit_code: null }
    })
    socket.settleKill()
    await closing

    expect(sendDesktopNotification).not.toHaveBeenCalled()
  })

  it('still reports an exit nobody asked for', async () => {
    const socket = await spawnTrackedTerminal()

    socket.push({
      type: 'event',
      payload: { type: 'exit', terminal_id: 'pty-web-1', exit_code: null }
    })

    expect(sendDesktopNotification).toHaveBeenCalledWith(
      'My Project',
      'Terminal 1 — Failed (exit -1)'
    )
  })
})
