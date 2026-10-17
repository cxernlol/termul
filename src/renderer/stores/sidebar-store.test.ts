import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from './shell-layout-store'
import { setSidebarVisible, toggleSidebarVisibility, useSidebarVisible } from './sidebar-store'

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

describe('sidebar-store (shell-layout projection)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteDebounced.mockResolvedValue({ success: true, data: undefined })
    resetShellLayoutStoreForTests()
    useShellLayoutStore.setState({ status: 'ready' })
  })

  it('reads railExpanded', () => {
    const { result } = renderHook(() => useSidebarVisible())
    expect(result.current).toBe(true)

    act(() => {
      useShellLayoutStore.setState({ railExpanded: false })
    })
    expect(result.current).toBe(false)
  })

  it('writes through the shell-layout action', () => {
    setSidebarVisible(false)
    expect(useShellLayoutStore.getState().railExpanded).toBe(false)
    expect(mockWriteDebounced).toHaveBeenCalledWith(
      'shell-layout',
      expect.objectContaining({ railExpanded: false })
    )
  })

  it('toggles', () => {
    toggleSidebarVisibility()
    expect(useShellLayoutStore.getState().railExpanded).toBe(false)
    toggleSidebarVisibility()
    expect(useShellLayoutStore.getState().railExpanded).toBe(true)
  })

  it('is ignored before hydration and never persists while unavailable', () => {
    resetShellLayoutStoreForTests()
    setSidebarVisible(false)
    expect(useShellLayoutStore.getState().railExpanded).toBe(true)

    useShellLayoutStore.setState({ status: 'unavailable' })
    setSidebarVisible(false)
    expect(useShellLayoutStore.getState().railExpanded).toBe(false)
    expect(mockWriteDebounced).not.toHaveBeenCalled()
  })
})
