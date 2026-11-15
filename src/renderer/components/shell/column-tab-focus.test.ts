import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { openChangesTab } from './column-tab-focus'

const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }))

vi.mock('@/lib/api', () => ({
  persistenceApi: {
    read: vi.fn(),
    write: vi.fn(),
    writeDebounced: vi.fn(() => Promise.resolve({ success: true })),
    delete: vi.fn()
  }
}))

vi.mock('@/lib/log-api', () => ({ logFrontendError: mockLog }))

describe('openChangesTab', () => {
  beforeEach(() => {
    mockLog.mockClear()
    resetShellLayoutStoreForTests()
    useShellLayoutStore.setState({
      status: 'ready',
      sidePanelVisible: false,
      lastColumnTabByProject: {}
    })
    document.body.replaceChildren()
    const button = document.createElement('button')
    button.id = 'tool-strip-changes'
    document.body.append(button)
  })

  it('opens Changes in the right panel for the chat working copy and focuses the strip button', () => {
    openChangesTab('p1', '/repo/wt-a')

    const state = useShellLayoutStore.getState()
    expect(state.sidePanelVisible).toBe(true)
    expect(state.lastColumnTabByProject.p1).toBe('changes')
    expect(state.worktreePickByProject.p1).toBe('/repo/wt-a')
    expect(document.activeElement).toBe(document.getElementById('tool-strip-changes'))
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        source: 'column-tab-focus',
        message: 'openChangesTab: show Changes in the right panel for project p1'
      })
    )
  })
})
