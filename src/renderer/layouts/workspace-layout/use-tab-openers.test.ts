import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchWorktreeEvent, WORKTREE_EVENTS } from '@/hooks/use-worktree-shortcuts'
import { resetReconciledUnresolvedForTests } from '@/lib/active-working-copy'
import { mockAcpSession } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useWorkspaceStore, type WorkspaceTab } from '@/stores/workspace-store'
import type { Project, Worktree } from '@/types/project'
import { useTabOpeners } from './use-tab-openers'

const { spawnTerminalInPane } = vi.hoisted(() => ({ spawnTerminalInPane: vi.fn() }))
vi.mock('@/lib/terminal-spawn', () => ({ spawnTerminalInPane }))

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn(), info: vi.fn() } }))

const { reconcile } = vi.hoisted(() => ({ reconcile: vi.fn(async () => 'unchanged') }))
vi.mock('@/lib/worktree-reconciler', () => ({ reconcileProjectWorktrees: reconcile }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(async () => {}) }))

const ROOT = '/repo'
const WT = `${ROOT}/.termul/worktrees/a`
const GONE = `${ROOT}/.termul/worktrees/gone`

function wt(id: string, path: string): Worktree {
  return { id, name: id, branch: `b-${id}`, path, createdAt: '2026-01-01T00:00:00.000Z' }
}

function seed(): Project {
  const project = {
    id: 'p1',
    name: 'P',
    color: 'blue',
    path: ROOT,
    worktrees: [wt('a', WT)]
  } as Project
  useProjectStore.setState({ projects: [project], activeProjectId: 'p1' })
  return project
}

function setActiveTab(tab: WorkspaceTab | null, paneId = 'pane-1'): void {
  useWorkspaceStore.setState({
    root: { type: 'leaf', id: paneId, tabs: tab ? [tab] : [], activeTabId: tab?.id ?? null },
    activePaneId: paneId
  })
}

function setChatCwd(cwd: string): void {
  useAcpStore.setState({ sessions: { s1: mockAcpSession({ id: 's1', cwd }) } })
  setActiveTab({ type: 'agent-chat', id: 'chat-s1', sessionId: 's1' })
}

function mount(project: Project) {
  return renderHook(() =>
    useTabOpeners({
      activeProject: project,
      activeProjectId: project.id,
      pathname: '/',
      navigate: vi.fn(),
      setIsCommandPaletteOpen: vi.fn(),
      gitSheetOpen: false,
      gitSheetProjectId: null,
      closeGitSheet: vi.fn()
    })
  )
}

beforeEach(() => {
  spawnTerminalInPane.mockReset().mockResolvedValue({ success: true })
  toastError.mockClear()
  reconcile.mockClear()
  resetReconciledUnresolvedForTests()
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ status: 'unavailable' })
  useAcpStore.setState({ sessions: {} })
  setActiveTab(null)
})

describe('useTabOpeners working-copy cwd', () => {
  it('spawns a new terminal in the worktree the active chat sits in', async () => {
    const project = seed()
    setChatCwd(`${WT}/src`)
    const { result } = mount(project)
    await act(async () => {
      await result.current.handleCreateTerminalInPane('pane-1')
    })
    expect(spawnTerminalInPane).toHaveBeenCalledWith('pane-1', 'p1', WT, expect.anything())
  })

  it('uses the picked worktree for a tab without a path, and the project folder with no pick', async () => {
    const project = seed()
    const { result } = mount(project)
    await act(async () => {
      await result.current.handleCreateTerminalInPane('pane-1')
    })
    expect(spawnTerminalInPane).toHaveBeenLastCalledWith('pane-1', 'p1', ROOT, expect.anything())

    act(() => useShellLayoutStore.setState({ worktreePickByProject: { p1: WT } }))
    await act(async () => {
      await result.current.handleCreateTerminalInPane('pane-1')
    })
    expect(spawnTerminalInPane).toHaveBeenLastCalledWith('pane-1', 'p1', WT, expect.anything())
  })

  it('honours an explicit cwd argument', async () => {
    const project = seed()
    setChatCwd(`${WT}/src`)
    const { result } = mount(project)
    await act(async () => {
      await result.current.handleCreateTerminalInPane('pane-1', undefined, '/elsewhere')
    })
    expect(spawnTerminalInPane).toHaveBeenCalledWith(
      'pane-1',
      'p1',
      '/elsewhere',
      expect.anything()
    )
  })

  it('toasts, reconciles once and does not spawn when the working copy is unresolved', async () => {
    const project = seed()
    setChatCwd(`${GONE}/src`)
    const { result } = mount(project)
    await act(async () => {
      // Back to back: one reconcile in flight serves both.
      await Promise.all([
        result.current.handleCreateTerminalInPane('pane-1'),
        result.current.handleCreateTerminalInPane('pane-1')
      ])
    })
    expect(spawnTerminalInPane).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledTimes(2)
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('opens the git tab at the resolved working copy', () => {
    const project = seed()
    setChatCwd(`${WT}/src`)
    const addGitTab = vi.spyOn(useWorkspaceStore.getState(), 'addGitTab')
    useWorkspaceStore.setState({ addGitTab })
    const { result } = mount(project)
    act(() => result.current.handleAddGitTab())
    expect(addGitTab).toHaveBeenCalledWith(WT, 'pane-1')
  })

  it('does not open the git tab when unresolved', () => {
    const project = seed()
    setChatCwd(`${GONE}/src`)
    const addGitTab = vi.fn()
    useWorkspaceStore.setState({ addGitTab })
    const { result } = mount(project)
    act(() => result.current.handleAddGitTab())
    expect(addGitTab).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('keeps the project root for git history', () => {
    const project = seed()
    setChatCwd(`${WT}/src`)
    const addGitHistoryTab = vi.fn()
    useWorkspaceStore.setState({ addGitHistoryTab })
    const { result } = mount(project)
    act(() => result.current.handleAddGitHistoryTab())
    expect(addGitHistoryTab).toHaveBeenCalledWith(ROOT, 'pane-1')
  })
})

describe('worktree:open-terminal', () => {
  const fire = async (): Promise<void> => {
    await act(async () => {
      dispatchWorktreeEvent(WORKTREE_EVENTS.OPEN_TERMINAL, { projectId: 'p1' })
      await Promise.resolve()
    })
  }

  it('opens a terminal at the resolved working copy without writing the pick', async () => {
    const project = seed()
    useShellLayoutStore.setState({ worktreePickByProject: { p1: WT } })
    mount(project)
    await fire()
    expect(spawnTerminalInPane).toHaveBeenCalledWith('pane-1', 'p1', WT, expect.anything())
    expect(useShellLayoutStore.getState().worktreePickByProject).toEqual({ p1: WT })
    expect(toastError).not.toHaveBeenCalled()
  })

  it('applies the project default shell and env vars', async () => {
    const project = { ...seed(), defaultShell: 'zsh', envVars: { FOO: 'bar' } } as Project
    useProjectStore.setState({ projects: [project] })
    mount(project)
    await fire()
    expect(spawnTerminalInPane).toHaveBeenCalledWith(
      'pane-1',
      'p1',
      ROOT,
      expect.objectContaining({ shell: 'zsh', envVars: { FOO: 'bar' } })
    )
  })

  it('follows the active chat ahead of the pick', async () => {
    const project = seed()
    setChatCwd(`${WT}/src`)
    mount(project)
    await fire()
    expect(spawnTerminalInPane).toHaveBeenCalledWith('pane-1', 'p1', WT, expect.anything())
  })

  it('toasts "No active pane" when there is no pane', async () => {
    const project = seed()
    useWorkspaceStore.setState({ activePaneId: '' })
    mount(project)
    await fire()
    expect(toastError).toHaveBeenCalledWith('No active pane', expect.anything())
    expect(spawnTerminalInPane).not.toHaveBeenCalled()
  })

  it('toasts the spawn error when the spawn fails', async () => {
    const project = seed()
    spawnTerminalInPane.mockResolvedValue({ success: false, error: 'nope' })
    mount(project)
    await fire()
    expect(toastError).toHaveBeenCalledWith('nope')
  })

  it('does nothing but toast and reconcile when unresolved', async () => {
    const project = seed()
    setChatCwd(GONE)
    mount(project)
    await fire()
    expect(spawnTerminalInPane).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('stops listening after unmount', async () => {
    const project = seed()
    const { unmount } = mount(project)
    unmount()
    await fire()
    expect(spawnTerminalInPane).not.toHaveBeenCalled()
  })
})
