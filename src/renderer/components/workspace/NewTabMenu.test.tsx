import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAvailableShellsForTests } from '@/components/shell/tool-strip/use-available-shells'
import {
  resetNativeWebviewOcclusionForTests,
  useNativeWebviewOccluded
} from '@/hooks/use-native-webview-occlusion'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { NewTabMenu } from './NewTabMenu'
import { type NewTabActions, NewTabActionsProvider } from './new-tab-actions'

const { tauriRef, projectRef, paneTarget, openNewChat, getShells } = vi.hoisted(() => ({
  tauriRef: { current: true as boolean },
  projectRef: {
    current: undefined as { id: string; path?: string; defaultShell?: string } | undefined
  },
  // The pane's committed project, and whether the visible tree is the selected project's.
  paneTarget: { project: 'p1' as string | null, settled: true },
  openNewChat: vi.fn(),
  getShells: vi.fn()
}))

vi.mock('@/lib/tauri-runtime', () => ({ isTauriContext: () => tauriRef.current }))
vi.mock('@/stores/project-store', () => ({ useActiveProject: () => projectRef.current }))
vi.mock('@/stores/app-settings-store', () => ({ useDefaultShell: () => 'bash' }))
vi.mock('@/lib/pane-target', () => ({
  committedPaneProject: () => paneTarget.project,
  useWorkspaceSettled: () => paneTarget.settled
}))
vi.mock('@/components/shell/use-shortcut-label', () => ({
  useShortcutLabel: (id: string) => (id === 'newTerminal' ? 'Ctrl+T' : undefined)
}))
vi.mock('@/components/chat/new-chat/open-new-chat', () => ({ openNewChat }))
vi.mock('@/lib/api', () => ({ shellApi: { getAvailableShells: getShells } }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const ZSH = { name: 'zsh', displayName: 'Zsh', path: '/bin/zsh' }
const BASH = { name: 'bash', displayName: 'Bash', path: '/bin/bash' }
const SHELLS = { available: [ZSH, BASH] }

function Occluded(): React.JSX.Element {
  return <span data-testid="occluded">{String(useNativeWebviewOccluded())}</span>
}

function renderMenu(actions: NewTabActions | null) {
  return render(
    <NewTabActionsProvider value={actions}>
      <NewTabMenu paneId="pane-1" />
      <Occluded />
    </NewTabActionsProvider>
  )
}

function makeActions(): NewTabActions {
  return { addTerminal: vi.fn(), addBrowserTab: vi.fn() }
}

async function openMenu(): Promise<void> {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'New tab' }), {
    button: 0,
    ctrlKey: false
  })
  await screen.findByRole('menu')
}

async function openShells(): Promise<HTMLElement> {
  await openMenu()
  const sub = screen.getByRole('menuitem', { name: 'New terminal with' })
  act(() => sub.focus())
  fireEvent.keyDown(sub, { key: 'ArrowRight' })
  return sub
}

const subRows = (sub: HTMLElement) =>
  screen
    .getAllByRole('menuitem')
    .filter(
      (item) =>
        item.closest('[data-radix-menu-content]') !== sub.closest('[data-radix-menu-content]')
    )
    .map((item) => item.textContent)

const itemLabels = () =>
  screen.getAllByRole('menuitem').map((item) => item.textContent?.replace('Ctrl+T', '').trim())

describe('NewTabMenu', () => {
  beforeEach(() => {
    tauriRef.current = true
    projectRef.current = { id: 'p1', path: '/proj' }
    paneTarget.project = 'p1'
    paneTarget.settled = true
    resetAvailableShellsForTests()
    getShells.mockReset()
    getShells.mockResolvedValue({ success: true, data: SHELLS })
    openNewChat.mockReset()
    useWorkspaceStore.setState({ activePaneId: 'pane-1' })
  })

  afterEach(() => {
    cleanup()
    resetNativeWebviewOcclusionForTests()
  })

  it('renders one New tab trigger with menu semantics', () => {
    renderMenu(makeActions())
    const trigger = screen.getByRole('button', { name: 'New tab' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('offers a new chat, a new terminal, another shell and a new browser tab', async () => {
    renderMenu(makeActions())
    await openMenu()
    expect(itemLabels()).toEqual([
      'New chat',
      'New terminal',
      'New terminal with',
      'New browser tab'
    ])
  })

  it('opens each kind in its own pane, for the project that owns the pane', async () => {
    const actions = makeActions()
    renderMenu(actions)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /New chat/ }))
    expect(openNewChat).toHaveBeenCalledWith({
      paneId: 'pane-1',
      projectId: 'p1',
      reason: 'new-tab-menu'
    })

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New browser tab' }))
    expect(actions.addBrowserTab).toHaveBeenCalledWith('pane-1')
  })

  it('opens a plain new terminal with the shell the submenu marks Default', async () => {
    const actions = makeActions()
    renderMenu(actions)
    const sub = await openShells()
    await waitFor(() => expect(subRows(sub)).toEqual(['BashDefault', 'Zsh']))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New terminal' }))
    expect(actions.addTerminal).toHaveBeenCalledWith('pane-1', BASH)
  })

  it('detects shells only when the menu opens, and opens the picked one', async () => {
    const actions = makeActions()
    renderMenu(actions)
    expect(getShells).not.toHaveBeenCalled()
    const sub = await openShells()
    await waitFor(() => expect(subRows(sub)).toEqual(['BashDefault', 'Zsh']))
    fireEvent.click(screen.getByRole('menuitem', { name: /Zsh/ }))
    expect(actions.addTerminal).toHaveBeenCalledWith('pane-1', ZSH)
  })

  it('tells a failed detection apart from no shells, and retries it', async () => {
    getShells.mockResolvedValueOnce({ success: false, error: 'offline' })
    renderMenu(makeActions())
    const sub = await openShells()
    const retry = await screen.findByRole('menuitem', {
      name: 'Could not detect shells. Try again'
    })
    fireEvent.click(retry)
    await waitFor(() => expect(subRows(sub)).toEqual(['BashDefault', 'Zsh']))
    expect(getShells).toHaveBeenCalledTimes(2)
  })

  it('says when the detection found no shell', async () => {
    getShells.mockResolvedValue({ success: true, data: { available: [] } })
    renderMenu(makeActions())
    await openShells()
    expect(await screen.findByRole('menuitem', { name: 'No shells detected' })).toHaveAttribute(
      'data-disabled'
    )
  })

  it('shows the active-pane shortcuts only in the active pane menu', async () => {
    renderMenu(makeActions())
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /New chat/ })).toHaveTextContent('Ctrl+T')
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })

    act(() => useWorkspaceStore.setState({ activePaneId: 'pane-2' }))
    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'New chat' })).not.toHaveTextContent('Ctrl+T')
  })

  it('disables every item while a project switch is in flight', async () => {
    paneTarget.settled = false
    renderMenu(makeActions())
    await openMenu()
    for (const name of ['New chat', 'New terminal', 'New terminal with', 'New browser tab']) {
      expect(
        screen.getByRole('menuitem', { name: new RegExp(`^${name}($|Ctrl)`) })
      ).toHaveAttribute('data-disabled')
    }
  })

  it('opens nothing when the pane no longer belongs to the selected project', async () => {
    const actions = makeActions()
    renderMenu(actions)
    await openMenu()
    paneTarget.project = null
    fireEvent.click(screen.getByRole('menuitem', { name: /New chat/ }))
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New terminal' }))
    expect(openNewChat).not.toHaveBeenCalled()
    expect(actions.addTerminal).not.toHaveBeenCalled()
  })

  it('hides New browser tab off the desktop app (browser tabs are native webviews)', async () => {
    tauriRef.current = false
    renderMenu(makeActions())
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: 'New browser tab' })).toBeNull()
  })

  it('disables New chat without a project folder', async () => {
    projectRef.current = undefined
    renderMenu(makeActions())
    await openMenu()
    expect(screen.getByRole('menuitem', { name: /New chat/ })).toHaveAttribute('data-disabled')
  })

  it('occludes the native browser webview while the menu is open', async () => {
    renderMenu(makeActions())
    expect(screen.getByTestId('occluded').textContent).toBe('false')
    await openMenu()
    await waitFor(() => expect(screen.getByTestId('occluded').textContent).toBe('true'))
  })
})
