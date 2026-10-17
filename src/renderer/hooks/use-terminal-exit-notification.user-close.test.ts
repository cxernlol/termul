import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetCommandEngineForTesting } from '@/lib/command-engine'
import { __clearCommandJournalForTesting } from '@/lib/command-journal'

const { mockInvoke, mockListen } = vi.hoisted(() => ({ mockInvoke: vi.fn(), mockListen: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke, Channel: class {} }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }))
vi.mock('@/lib/api', async () => {
  const { createTauriTerminalApi } = await import('@/lib/tauri-terminal-api')
  return { terminalApi: createTauriTerminalApi() }
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
import { useTerminalStore } from '@/stores/terminal-store'
import { useTerminalExitNotification } from './use-terminal-exit-notification'

type ExitPayload = { id: string; exitCode: number | null; signal: number | null }

describe('terminal exit notification when the user closes a terminal', () => {
  let emitNativeExit: (payload: ExitPayload) => void

  beforeEach(() => {
    vi.clearAllMocks()
    __clearCommandJournalForTesting()
    __resetCommandEngineForTesting()
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    mockListen.mockImplementation(
      (_event: string, handler: (event: { payload: ExitPayload }) => void) => {
        emitNativeExit = (payload) => handler({ payload })
        return Promise.resolve(() => {})
      }
    )
    seedProjectStore([mockProject({ id: 'proj-1', name: 'My Project' })], 'proj-1')
    seedTerminalStore(
      [mockTerminal({ id: 'term-1', ptyId: 'pty-1', name: 'Terminal 1', projectId: 'proj-1' })],
      { activeTerminalId: 'term-1' }
    )
    renderHook(() => useTerminalExitNotification())
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    resetProjectStore()
    resetTerminalStore()
  })

  it('stays silent when the exit of a killed pty arrives before the kill call returns', async () => {
    let finishKill: (value: { success: true; data: undefined }) => void = () => {}
    mockInvoke.mockReturnValue(new Promise((resolve) => (finishKill = resolve)))

    const closing = terminalApi.kill('pty-1')
    emitNativeExit({ id: 'pty-1', exitCode: null, signal: null })
    finishKill({ success: true, data: undefined })
    await closing

    expect(sendDesktopNotification).not.toHaveBeenCalled()
    expect(useTerminalStore.getState().terminals[0]?.needsAttention).toBeFalsy()
  })

  it('still reports an exit nobody asked for', () => {
    emitNativeExit({ id: 'pty-1', exitCode: null, signal: null })

    expect(sendDesktopNotification).toHaveBeenCalledWith(
      'My Project',
      'Terminal 1 — Failed (exit -1)'
    )
  })

  it('still reports a later exit when the kill was refused', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'pty busy', code: 'KILL_FAILED' })

    await terminalApi.kill('pty-1')
    emitNativeExit({ id: 'pty-1', exitCode: 1, signal: null })

    expect(sendDesktopNotification).toHaveBeenCalledWith(
      'My Project',
      'Terminal 1 — Failed (exit 1)'
    )
  })
})
