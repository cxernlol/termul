import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from './shell-layout-store'
import { setSSHPanelVisible, toggleSSHPanelVisibility, useSSHPanelVisible } from './ssh-panel-store'

const { mockWriteDebounced } = vi.hoisted(() => ({ mockWriteDebounced: vi.fn() }))

vi.mock('@/lib/api', () => ({
  persistenceApi: {
    read: vi.fn(),
    write: vi.fn(),
    delete: vi.fn(),
    writeDebounced: mockWriteDebounced
  }
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

describe('ssh-panel-store (shell-layout projection)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteDebounced.mockResolvedValue({ success: true, data: undefined })
    resetShellLayoutStoreForTests()
    useShellLayoutStore.setState({ status: 'ready' })
  })

  it('reads sshSectionVisible', () => {
    const { result } = renderHook(() => useSSHPanelVisible())
    expect(result.current).toBe(true)

    act(() => {
      useShellLayoutStore.setState({ sshSectionVisible: false })
    })
    expect(result.current).toBe(false)
  })

  it('writes through the shell-layout action', () => {
    setSSHPanelVisible(false)
    expect(useShellLayoutStore.getState().sshSectionVisible).toBe(false)
    expect(mockWriteDebounced).toHaveBeenCalledWith(
      'shell-layout',
      expect.objectContaining({ sshSectionVisible: false })
    )
  })

  it('toggles', () => {
    toggleSSHPanelVisibility()
    expect(useShellLayoutStore.getState().sshSectionVisible).toBe(false)
    toggleSSHPanelVisibility()
    expect(useShellLayoutStore.getState().sshSectionVisible).toBe(true)
  })

  it('is ignored before hydration and never persists while unavailable', () => {
    resetShellLayoutStoreForTests()
    setSSHPanelVisible(false)
    expect(useShellLayoutStore.getState().sshSectionVisible).toBe(true)

    useShellLayoutStore.setState({ status: 'unavailable' })
    setSSHPanelVisible(false)
    expect(useShellLayoutStore.getState().sshSectionVisible).toBe(false)
    expect(mockWriteDebounced).not.toHaveBeenCalled()
  })
})
