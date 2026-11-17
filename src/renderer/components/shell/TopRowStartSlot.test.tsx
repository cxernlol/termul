import { render, renderHook, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { selectTopRowRoles, type TopRowPlatform } from '@/lib/top-row'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { TopRowStartSlot, useTopRowStartSlotVisible } from './TopRowStartSlot'
import { TopRowProvider } from './top-row-context'

const roles = selectTopRowRoles({
  root: { type: 'leaf', id: 'pane-1', tabs: [], activeTabId: null },
  fullscreenPaneId: null,
  mode: 'panes'
})
const platform: TopRowPlatform = { dragRegions: true, windowControls: false, trafficLights: true }

function wrapper(railToggleInMain: boolean) {
  return ({ children }: { children: React.ReactNode }) => (
    <TopRowProvider roles={roles} platform={platform} railToggleInMain={railToggleInMain}>
      {children}
    </TopRowProvider>
  )
}

beforeEach(() => {
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ status: 'unavailable', railExpanded: false })
})

describe('TopRowStartSlot', () => {
  it('holds the expand toggle after the 6px bar padding, with no traffic-light inset', () => {
    render(<TopRowStartSlot />, { wrapper: wrapper(true) })
    const slot = screen.getByTestId('top-row-start-slot')
    expect(slot).toHaveClass('pl-1.5')
    expect(slot.style.paddingLeft).toBe('')
    expect(
      within(slot).getByRole('button', { name: 'Expand or collapse projects' })
    ).toBeInTheDocument()
    // The Side panel opens from the tool strip, never from here.
    expect(screen.queryByRole('button', { name: 'Show side panel' })).toBeNull()
  })

  it('renders nothing with the Rail expanded, or without a provider', () => {
    const { unmount } = render(<TopRowStartSlot />, { wrapper: wrapper(false) })
    expect(screen.queryByTestId('top-row-start-slot')).toBeNull()
    unmount()
    render(<TopRowStartSlot />)
    expect(screen.queryByTestId('top-row-start-slot')).toBeNull()
  })

  it('reports its visibility', () => {
    expect(
      renderHook(() => useTopRowStartSlotVisible(), { wrapper: wrapper(false) }).result.current
    ).toBe(false)
    expect(
      renderHook(() => useTopRowStartSlotVisible(), { wrapper: wrapper(true) }).result.current
    ).toBe(true)
  })
})
