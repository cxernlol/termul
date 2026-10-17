import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewProjectModal } from '@/components/NewProjectModal'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { _resetSheetFocusReturnForTests } from '@/lib/sheet-focus-return'
import { useOverlayRegistration, useOverlayStackStore } from '@/stores/overlay-stack-store'
import { useSettingsModalStore, useSettingsModalView } from '@/stores/settings-modal-store'
import { MobileChatShell } from './MobileChatShell'

// The phone shell's hand-offs from a sheet to the Project settings modal or the
// New project modal, with the real Radix sheets, the real SettingsModal and the
// real NewProjectModal. The settings host below mirrors WorkspaceModals and the
// overlay back stack: the modal mounts while the store has a view, and
// registers as `settings-modal`.

const { workspaceRef, terminalsRef } = vi.hoisted(() => ({
  workspaceRef: {
    current: {
      leaves: [] as Array<{
        type: 'leaf'
        id: string
        tabs: Array<Record<string, unknown>>
        activeTabId: string | null
      }>,
      activePaneId: 'pane-1',
      removeTab: vi.fn()
    }
  },
  terminalsRef: { current: [] as Array<{ id: string; name: string }> }
}))

const project = { id: 'p1', name: 'Demo', path: '/demo', color: 'blue' }

vi.mock('@/stores/project-store', () => ({
  useActiveProject: () => project,
  useProjects: () => [project],
  useProjectStore: Object.assign(
    (sel: (s: unknown) => unknown) => sel({ projects: [project], activeProjectId: project.id }),
    { getState: () => ({ projects: [project], activeProjectId: project.id }) }
  )
}))

vi.mock('@/stores/workspace-store', () => ({
  getAllLeafPanes: () => workspaceRef.current.leaves,
  useWorkspaceStore: Object.assign(
    (sel: (s: unknown) => unknown) =>
      sel({
        root: { leaves: workspaceRef.current.leaves },
        activePaneId: workspaceRef.current.activePaneId
      }),
    { getState: () => workspaceRef.current }
  )
}))

vi.mock('@/stores/terminal-store', () => ({
  useTerminalStore: Object.assign(
    (sel: (s: { terminals: unknown[] }) => unknown) => sel({ terminals: terminalsRef.current }),
    { getState: () => ({ terminals: terminalsRef.current }) }
  )
}))

vi.mock('@/stores/acp-store', () => ({
  useAcpStore: (sel: (s: unknown) => unknown) => sel({ sessions: {}, sessionIndex: [] })
}))

vi.mock('@/stores/app-settings-store', () => ({
  useDefaultProjectColor: () => 'blue'
}))

vi.mock('@/hooks/use-mobile-attention-count', () => ({
  useMobileAttentionCount: () => 0
}))

vi.mock('@/hooks/use-shell-announcements', () => ({
  useShellAnnouncements: () => undefined
}))

vi.mock('@/hooks/use-project-switch', () => ({
  useProjectSwitch: () => ({ switchTo: () => 'selected' })
}))

vi.mock('@/lib/project-registry-api', () => ({
  projectRegistryApi: { setDefault: vi.fn() }
}))

vi.mock('@/lib/api', () => ({
  dialogApi: { selectDirectory: vi.fn() },
  filesystemApi: { readDirectory: vi.fn(async () => ({ success: true, data: [] })) },
  gitApi: {},
  shellApi: { getAvailableShells: vi.fn(async () => ({ success: false })) }
}))

vi.mock('./MobileFileExplorer', () => ({ MobileFileExplorer: () => null }))
vi.mock('./MobileTerminalControls', () => ({ MobileTerminalControls: () => null }))

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

// Web mode: the project sheet and the web-only sheet rows are mounted.
vi.mock('@/lib/tauri-runtime', () => ({ isTauriContext: () => false }))

const SETTINGS_TITLE = { project: 'Project Settings', app: 'Application Preferences' } as const

function SettingsHost(): React.JSX.Element | null {
  const view = useSettingsModalView()
  const close = useSettingsModalStore((s) => s.close)
  useOverlayRegistration('settings-modal', view !== null, close)
  if (view === null) return null
  return (
    <SettingsModal isOpen onClose={close} title={SETTINGS_TITLE[view]}>
      <input aria-label="Project name" />
    </SettingsModal>
  )
}

function renderShell(): void {
  function Host(): React.JSX.Element {
    const [newProjectOpen, setNewProjectOpen] = useState(false)
    return (
      <MemoryRouter>
        <MobileChatShell
          onNewChat={vi.fn()}
          canNewChat
          onOpenProjectSettings={() => useSettingsModalStore.getState().openProject()}
          onNewProject={() => setNewProjectOpen(true)}
        >
          <div>chat body</div>
        </MobileChatShell>
        <SettingsHost />
        <NewProjectModal
          isOpen={newProjectOpen}
          onClose={() => setNewProjectOpen(false)}
          onCreateProject={vi.fn()}
        />
      </MemoryRouter>
    )
  }
  render(<Host />)
}

function seedTabs(tabs: Array<Record<string, unknown>>, activeTabId: string): void {
  workspaceRef.current = {
    ...workspaceRef.current,
    leaves: [{ type: 'leaf', id: 'pane-1', tabs, activeTabId }]
  }
}

async function closeSettingsWithEscape(): Promise<void> {
  const dialog = await screen.findByRole('dialog', { name: 'Project Settings' })
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Project Settings' })).not.toBeInTheDocument()
  )
}

async function waitForSheetGone(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull())
  // Radix fires the sheet's close auto-focus in a timeout after it unmounts.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('MobileChatShell hand-off to a settings or New project modal', () => {
  beforeEach(() => {
    _resetSheetFocusReturnForTests()
    useSettingsModalStore.getState().close()
    useOverlayStackStore.setState({ stack: [] })
    useOverlayStackStore.getState().setMobileShell(true)
    terminalsRef.current = []
    seedTabs([{ type: 'agent-chat', id: 'tab-1', sessionId: 's1' }], 'tab-1')
  })

  it('project sheet gear: focus returns to the project subtitle once settings close', async () => {
    renderShell()
    const subtitle = screen.getByRole('button', { name: /switch project/ })
    subtitle.focus()
    fireEvent.click(subtitle)
    fireEvent.click(await screen.findByRole('button', { name: '"Demo" project settings' }))
    await waitForSheetGone()

    await closeSettingsWithEscape()

    await waitFor(() => expect(document.activeElement).toBe(subtitle))
  })

  it('project sheet Add project: focus returns to the project subtitle once the modal closes', async () => {
    renderShell()
    const subtitle = screen.getByRole('button', { name: /switch project/ })
    subtitle.focus()
    fireEvent.click(subtitle)
    fireEvent.click(await screen.findByRole('button', { name: 'Add project' }))
    await waitForSheetGone()

    const nameField = await screen.findByPlaceholderText('No directory selected')
    nameField.focus()
    const header = screen.getByText('Create New Project').parentElement as HTMLElement
    fireEvent.click(header.querySelector('button') as HTMLElement)
    await waitFor(() => expect(screen.queryByText('Create New Project')).not.toBeInTheDocument())

    await waitFor(() => expect(document.activeElement).toBe(subtitle))
  })

  it('header ⋯ Project settings: focus returns to ⋯ once settings close', async () => {
    renderShell()
    const more = screen.getByRole('button', { name: 'More' })
    more.focus()
    fireEvent.click(more)
    fireEvent.click(await screen.findByRole('button', { name: 'Project settings' }))
    await waitForSheetGone()

    await closeSettingsWithEscape()

    await waitFor(() => expect(document.activeElement).toBe(more))
  })

  it('terminal ⋯ Project settings: focus returns to Terminal actions once settings close', async () => {
    seedTabs([{ type: 'terminal', id: 'term-t1', terminalId: 't1' }], 'term-t1')
    terminalsRef.current = [{ id: 't1', name: 'zsh' }]
    renderShell()
    const actions = screen.getByRole('button', { name: 'Terminal actions' })
    actions.focus()
    fireEvent.click(actions)
    fireEvent.click(await screen.findByRole('button', { name: 'Project settings' }))
    await waitForSheetGone()

    await closeSettingsWithEscape()

    await waitFor(() => expect(document.activeElement).toBe(actions))
  })

  it('leaves focus alone when the user moved it somewhere real before settings closed', async () => {
    renderShell()
    const more = screen.getByRole('button', { name: 'More' })
    fireEvent.click(more)
    fireEvent.click(await screen.findByRole('button', { name: 'Project settings' }))
    await waitForSheetGone()
    const title = screen.getByRole('heading', { level: 1 })
    title.setAttribute('tabindex', '-1')

    await screen.findByRole('dialog', { name: 'Project Settings' })
    act(() => {
      useSettingsModalStore.getState().close()
      title.focus()
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.activeElement).toBe(title)
  })
})
