import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetReconciledUnresolvedForTests } from '@/lib/active-working-copy'
import { mockAcpSession } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { useFileExplorerStore } from '@/stores/file-explorer-store'
import { useProjectStore } from '@/stores/project-store'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useWorkspaceStore, type WorkspaceTab } from '@/stores/workspace-store'
import type { Project, Worktree } from '@/types/project'
import { useProjectRootWatch } from './use-project-root-watch'

const { fs } = vi.hoisted(() => ({
  fs: {
    readDirectory: vi.fn(),
    watchDirectory: vi.fn(),
    unwatchDirectory: vi.fn(),
    searchContentStreamCancel: vi.fn(async () => {}),
    searchFileNamesStreamCancel: vi.fn(async () => {}),
    onSearchContentBatch: vi.fn(() => () => {}),
    onSearchContentDone: vi.fn(() => () => {}),
    onSearchFileNamesBatch: vi.fn(() => () => {}),
    onSearchFileNamesDone: vi.fn(() => () => {})
  }
}))
vi.mock('@/lib/api', () => ({ filesystemApi: fs }))

const { logFrontendError } = vi.hoisted(() => ({ logFrontendError: vi.fn(async () => {}) }))
vi.mock('@/lib/log-api', () => ({ logFrontendError }))

const { reconcile } = vi.hoisted(() => ({ reconcile: vi.fn(async () => 'unchanged') }))
vi.mock('@/lib/worktree-reconciler', () => ({ reconcileProjectWorktrees: reconcile }))

const ROOT_A = '/repo-a'
const ROOT_B = '/repo-b'
const WT_A = `${ROOT_A}/.termul/worktrees/a`
const WT_B = `${ROOT_B}/.termul/worktrees/b`

function wt(id: string, path: string): Worktree {
  return { id, name: id, branch: `b-${id}`, path, createdAt: '2026-01-01T00:00:00.000Z' }
}

function proj(id: string, path: string, worktrees: Worktree[] = []): Project {
  return { id, name: id, color: 'blue', path, worktrees } as Project
}

function seed(projects: Project[], activeProjectId: string): void {
  useProjectStore.setState({ projects, activeProjectId })
}

function setActiveTab(tab: WorkspaceTab | null): void {
  useWorkspaceStore.setState({
    root: { type: 'leaf', id: 'pane-1', tabs: tab ? [tab] : [], activeTabId: tab?.id ?? null },
    activePaneId: 'pane-1'
  })
}

function setPick(projectId: string, path: string | null): void {
  useShellLayoutStore.setState({
    worktreePickByProject: path === null ? {} : { [projectId]: path }
  })
}

/** Renders with props taken from the store each render, re-rendering on store change. */
function mountReactive() {
  return renderHook(() => {
    const activeProjectId = useProjectStore((s) => s.activeProjectId)
    const activeProject = useProjectStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
    useProjectRootWatch({ activeProject, activeProjectId })
  })
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

const explorer = () => useFileExplorerStore.getState()

beforeEach(() => {
  fs.watchDirectory.mockReset().mockResolvedValue({ success: true })
  fs.unwatchDirectory.mockReset()
  reconcile.mockClear()
  logFrontendError.mockClear()
  resetReconciledUnresolvedForTests()
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ status: 'unavailable' })
  useAcpStore.setState({ sessions: {} })
  setActiveTab(null)
  useFileExplorerStore.setState({ rootPath: null, scopeRoot: null, worktreeRoot: null })
  seed([proj('a', ROOT_A, [wt('wa', WT_A)]), proj('b', ROOT_B, [wt('wb', WT_B)])], 'a')
})

describe('useProjectRootWatch', () => {
  it('roots the explorer at the project folder and watches it', async () => {
    mountReactive()
    await flush()
    expect(fs.watchDirectory).toHaveBeenCalledWith(ROOT_A)
    expect(explorer()).toMatchObject({ scopeRoot: ROOT_A, rootPath: ROOT_A, worktreeRoot: null })
  })

  it('applies the picked worktree as the override and moves the watch', async () => {
    setPick('a', WT_A)
    mountReactive()
    await flush()
    expect(fs.watchDirectory).toHaveBeenCalledWith(WT_A)
    expect(explorer()).toMatchObject({ scopeRoot: ROOT_A, worktreeRoot: WT_A, rootPath: WT_A })
  })

  it('follows the active chat into a listed worktree, then back to the pick', async () => {
    useAcpStore.setState({ sessions: { s1: mockAcpSession({ id: 's1', cwd: `${WT_A}/src` }) } })
    mountReactive()
    await flush()
    expect(explorer().rootPath).toBe(ROOT_A)

    act(() => setActiveTab({ type: 'agent-chat', id: 'chat-s1', sessionId: 's1' }))
    await flush()
    expect(explorer()).toMatchObject({ scopeRoot: ROOT_A, worktreeRoot: WT_A })
    expect(fs.watchDirectory).toHaveBeenLastCalledWith(WT_A)
    expect(fs.unwatchDirectory).toHaveBeenCalledWith(ROOT_A)

    act(() => setActiveTab(null))
    await flush()
    expect(explorer()).toMatchObject({ worktreeRoot: null, rootPath: ROOT_A })
    expect(fs.unwatchDirectory).toHaveBeenCalledWith(WT_A)
  })

  it('keeps the current root, reconciles once and does not watch when unresolved', async () => {
    mountReactive()
    await flush()
    fs.watchDirectory.mockClear()

    useAcpStore.setState({
      sessions: { s1: mockAcpSession({ id: 's1', cwd: `${ROOT_A}/.termul/worktrees/gone` }) }
    })
    act(() => setActiveTab({ type: 'agent-chat', id: 'chat-s1', sessionId: 's1' }))
    await flush()

    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledWith('a')
    expect(fs.watchDirectory).not.toHaveBeenCalled()
    expect(explorer()).toMatchObject({ rootPath: ROOT_A, worktreeRoot: null })
    expect(logFrontendError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('[working-copy]') })
    )
  })

  it('applies the worktree once a reconcile lists it', async () => {
    useAcpStore.setState({
      sessions: { s1: mockAcpSession({ id: 's1', cwd: `${ROOT_A}/.termul/worktrees/new/src` }) }
    })
    setActiveTab({ type: 'agent-chat', id: 'chat-s1', sessionId: 's1' })
    mountReactive()
    await flush()
    // Project switch while unresolved: rooted at the project folder, no override.
    expect(explorer()).toMatchObject({ scopeRoot: ROOT_A, worktreeRoot: null })

    act(() =>
      seed([proj('a', ROOT_A, [wt('wa', WT_A), wt('new', `${ROOT_A}/.termul/worktrees/new`)])], 'a')
    )
    await flush()
    expect(explorer().worktreeRoot).toBe(`${ROOT_A}/.termul/worktrees/new`)
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it('on a project switch sets the scope root, then the override, and releases the old watch', async () => {
    setPick('a', WT_A)
    mountReactive()
    await flush()
    expect(explorer().worktreeRoot).toBe(WT_A)

    act(() => useProjectStore.setState({ activeProjectId: 'b' }))
    await flush()
    expect(explorer()).toMatchObject({ scopeRoot: ROOT_B, worktreeRoot: null, rootPath: ROOT_B })
    expect(fs.watchDirectory).toHaveBeenLastCalledWith(ROOT_B)
    expect(fs.unwatchDirectory).toHaveBeenCalledWith(WT_A)
  })

  it('ignores a stale watch completion after a newer switch', async () => {
    let releaseA: (value: { success: true }) => void = () => {}
    fs.watchDirectory.mockImplementation((path: string) =>
      path === ROOT_A
        ? new Promise((resolve) => {
            releaseA = resolve
          })
        : Promise.resolve({ success: true })
    )
    mountReactive()
    act(() => useProjectStore.setState({ activeProjectId: 'b' }))
    await flush()
    expect(explorer().scopeRoot).toBe(ROOT_B)

    await act(async () => {
      releaseA({ success: true })
      await Promise.resolve()
    })
    expect(explorer().scopeRoot).toBe(ROOT_B)
    expect(fs.unwatchDirectory).toHaveBeenCalledWith(ROOT_A)
  })

  it('reports a watch failure and still applies the root', async () => {
    fs.watchDirectory.mockResolvedValue({ success: false, error: 'denied', code: 'EACCES' })
    mountReactive()
    await flush()
    expect(explorer()).toMatchObject({
      rootPath: ROOT_A,
      rootLoadError: { message: 'denied', code: 'EACCES' }
    })
  })

  it('reports a thrown watch as WATCH_FAILED', async () => {
    fs.watchDirectory.mockRejectedValue(new Error('boom'))
    mountReactive()
    await flush()
    expect(explorer().rootLoadError).toEqual({ message: 'boom', code: 'WATCH_FAILED' })
  })

  it('clears the root and unwatches when the project has no path', async () => {
    mountReactive()
    await flush()
    act(() => seed([proj('a', '')], 'a'))
    await flush()
    expect(explorer().rootPath).toBeNull()
    expect(fs.unwatchDirectory).toHaveBeenCalledWith(ROOT_A)
  })

  it('releases the watch on unmount', async () => {
    const { unmount } = mountReactive()
    await flush()
    unmount()
    expect(fs.unwatchDirectory).toHaveBeenCalledWith(ROOT_A)
  })

  it('does not rewatch when the working copy resolves identically', async () => {
    mountReactive()
    await flush()
    fs.watchDirectory.mockClear()
    act(() => seed([proj('a', ROOT_A, [wt('wa', WT_A)]), proj('b', ROOT_B)], 'a'))
    await flush()
    expect(fs.watchDirectory).not.toHaveBeenCalled()
  })
})
