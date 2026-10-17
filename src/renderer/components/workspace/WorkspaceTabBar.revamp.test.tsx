import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceTabBar } from './WorkspaceTabBar'

const { tauriRef, getShells } = vi.hoisted(() => ({
  tauriRef: { current: true as boolean },
  getShells: vi.fn()
}))

vi.mock('@/lib/tauri-runtime', () => ({ isTauriContext: () => tauriRef.current }))
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return { ...actual, shellApi: { getAvailableShells: getShells } }
})

function renderBar(props: Partial<React.ComponentProps<typeof WorkspaceTabBar>> = {}) {
  return render(
    <WorkspaceTabBar
      paneId="pane-a"
      tabs={[]}
      activeTabId={null}
      onAddTerminal={vi.fn()}
      onAddBrowserTab={vi.fn()}
      {...props}
    />
  )
}

describe('WorkspaceTabBar New tab menu', () => {
  beforeEach(() => {
    tauriRef.current = true
    getShells.mockResolvedValue({
      success: true,
      data: { available: [{ name: 'bash', displayName: 'Bash', path: '/bin/bash' }] }
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders exactly one New tab trigger and no separate terminal or browser button', () => {
    renderBar()
    expect(screen.getAllByRole('button', { name: 'New tab' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Open terminal menu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New browser tab' })).toBeNull()
  })

  it('menu adds a terminal through onAddTerminal', async () => {
    const onAddTerminal = vi.fn()
    renderBar({ onAddTerminal })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'New tab' }), {
      button: 0,
      ctrlKey: false
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Bash/ }))
    expect(onAddTerminal).toHaveBeenCalledWith(expect.objectContaining({ name: 'bash' }))
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
