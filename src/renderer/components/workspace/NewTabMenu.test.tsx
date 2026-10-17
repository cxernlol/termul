import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetNativeWebviewOcclusionForTests,
  useNativeWebviewOccluded
} from '@/hooks/use-native-webview-occlusion'
import { NewTabMenu } from './NewTabMenu'

const { tauriRef, projectRef, showAgentLauncher, openProjectCanvas, getShells } = vi.hoisted(
  () => ({
    tauriRef: { current: true as boolean },
    projectRef: { current: undefined as { id: string; path?: string } | undefined },
    showAgentLauncher: vi.fn(),
    openProjectCanvas: vi.fn(),
    getShells: vi.fn()
  })
)

vi.mock('@/lib/tauri-runtime', () => ({ isTauriContext: () => tauriRef.current }))
vi.mock('@/stores/project-store', () => ({ useActiveProject: () => projectRef.current }))
vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: { getState: () => ({ showAgentLauncher }) }
}))
vi.mock('@/lib/open-project-canvas', () => ({ openProjectCanvas }))
vi.mock('@/lib/api', () => ({ shellApi: { getAvailableShells: getShells } }))

const SHELLS = {
  available: [
    { name: 'zsh', displayName: 'Zsh', path: '/bin/zsh' },
    { name: 'bash', displayName: 'Bash', path: '/bin/bash' }
  ]
}

function Occluded(): React.JSX.Element {
  return <span data-testid="occluded">{String(useNativeWebviewOccluded())}</span>
}

function renderMenu(props: Partial<React.ComponentProps<typeof NewTabMenu>> = {}) {
  return render(
    <>
      <NewTabMenu
        paneId="pane-1"
        onAddTerminal={vi.fn()}
        onAddBrowserTab={vi.fn()}
        defaultShell="bash"
        {...props}
      />
      <Occluded />
    </>
  )
}

async function openMenu(): Promise<HTMLElement> {
  const trigger = screen.getByRole('button', { name: 'New tab' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  await screen.findByRole('menu')
  return trigger
}

describe('NewTabMenu', () => {
  beforeEach(() => {
    tauriRef.current = true
    projectRef.current = { id: 'p1', path: '/proj' }
    getShells.mockResolvedValue({ success: true, data: SHELLS })
    showAgentLauncher.mockClear()
    openProjectCanvas.mockClear()
  })

  afterEach(() => {
    cleanup()
    resetNativeWebviewOcclusionForTests()
  })

  it('renders one New tab trigger with menu semantics', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'New tab' })
    expect(trigger).toHaveAttribute('title', 'New tab')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger.className).toContain('h-7 w-7')
  })

  it('lists New chat, the Terminal shells (default first), New browser tab and Open canvas', async () => {
    renderMenu()
    await openMenu()
    await screen.findByRole('menuitem', { name: /Bash/ })
    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(labels).toEqual(['New chat', 'Bash(default)', 'Zsh', 'New browser tab', 'Open canvas'])
    expect(screen.getByText('Terminal')).toBeInTheDocument()
  })

  it('omits New browser tab on web', async () => {
    tauriRef.current = false
    renderMenu()
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: 'New browser tab' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Open canvas' })).toBeInTheDocument()
  })

  it('shows a message when no shells are detected', async () => {
    getShells.mockResolvedValue({ success: true, data: { available: [] } })
    renderMenu()
    await openMenu()
    expect(await screen.findByText('No shells detected')).toBeInTheDocument()
  })

  it('opens the agent launcher over this pane for New chat', async () => {
    renderMenu()
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New chat' }))
    expect(showAgentLauncher).toHaveBeenCalledWith('pane-1')
  })

  it('disables New chat and Open canvas without a project path', async () => {
    projectRef.current = { id: 'p1' }
    renderMenu()
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'New chat' })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: 'Open canvas' })).toHaveAttribute('data-disabled')
  })

  it('adds a terminal for the picked shell and closes the menu', async () => {
    const onAddTerminal = vi.fn()
    renderMenu({ onAddTerminal })
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: /Zsh/ }))
    expect(onAddTerminal).toHaveBeenCalledWith(SHELLS.available[0])
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('opens a browser tab', async () => {
    const onAddBrowserTab = vi.fn()
    renderMenu({ onAddBrowserTab })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New browser tab' }))
    expect(onAddBrowserTab).toHaveBeenCalledTimes(1)
  })

  it('opens the project canvas', async () => {
    renderMenu()
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open canvas' }))
    expect(openProjectCanvas).toHaveBeenCalledWith('p1', '/proj')
  })

  it('hides native webviews while open and releases them on close', async () => {
    renderMenu()
    expect(screen.getByTestId('occluded').textContent).toBe('false')
    await openMenu()
    await waitFor(() => expect(screen.getByTestId('occluded').textContent).toBe('true'))
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    })
    await waitFor(() => expect(screen.getByTestId('occluded').textContent).toBe('false'))
  })

  it('closes on Esc and returns focus to the trigger', async () => {
    renderMenu()
    const trigger = await openMenu()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})
