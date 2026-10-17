import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockAcpSession } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useWorkspaceStore, type WorkspaceTab } from '@/stores/workspace-store'
import type { Project, Worktree } from '@/types/project'
import { useActiveWorkingCopy } from './use-active-working-copy'

const ROOT = 'E:/p'
const WT_A = 'E:/p/.termul/worktrees/a'

function wt(id: string, path: string): Worktree {
  return { id, name: id, branch: `b-${id}`, path, createdAt: '2026-01-01T00:00:00.000Z' }
}

function seed(worktrees: Worktree[]): void {
  useProjectStore.setState({
    projects: [{ id: 'p1', name: 'P', color: 'blue', path: ROOT, worktrees } as Project],
    activeProjectId: 'p1'
  })
}

function setActiveTab(tab: WorkspaceTab | null): void {
  useWorkspaceStore.setState({
    root: { type: 'leaf', id: 'pane-1', tabs: tab ? [tab] : [], activeTabId: tab?.id ?? null },
    activePaneId: 'pane-1'
  })
}

beforeEach(() => {
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ status: 'unavailable' })
  useAcpStore.setState({ sessions: {} })
  useTerminalStore.setState({ terminals: [] })
  seed([wt('a', WT_A)])
  setActiveTab(null)
})

describe('useActiveWorkingCopy', () => {
  it('starts at the project folder and follows the switcher pick', () => {
    const { result } = renderHook(() => useActiveWorkingCopy())
    expect(result.current).toMatchObject({ kind: 'project', path: ROOT })

    act(() => useShellLayoutStore.setState({ worktreePickByProject: { p1: WT_A } }))
    expect(result.current).toMatchObject({ kind: 'worktree', worktreeId: 'a', path: WT_A })
  })

  it('follows the active tab and a session cwd change, ahead of the pick', () => {
    useAcpStore.setState({ sessions: { s1: mockAcpSession({ id: 's1', cwd: ROOT }) } })
    act(() => useShellLayoutStore.setState({ worktreePickByProject: { p1: WT_A } }))
    const { result } = renderHook(() => useActiveWorkingCopy())
    expect(result.current).toMatchObject({ kind: 'worktree' })

    act(() => setActiveTab({ type: 'agent-chat', id: 'chat-s1', sessionId: 's1' }))
    expect(result.current).toMatchObject({ kind: 'project', path: ROOT })

    act(() =>
      useAcpStore.setState({
        sessions: { s1: mockAcpSession({ id: 's1', cwd: 'E:/p/.termul/worktrees/gone' }) }
      })
    )
    expect(result.current).toMatchObject({ state: 'unresolved' })
  })

  it('re-resolves when the worktree list changes (reconcile resolves it)', () => {
    useAcpStore.setState({
      sessions: { s1: mockAcpSession({ id: 's1', cwd: 'E:/p/.termul/worktrees/new/src' }) }
    })
    setActiveTab({ type: 'agent-chat', id: 'chat-s1', sessionId: 's1' })
    const { result } = renderHook(() => useActiveWorkingCopy())
    expect(result.current).toMatchObject({ state: 'unresolved' })

    act(() => seed([wt('a', WT_A), wt('new', 'E:/p/.termul/worktrees/new')]))
    expect(result.current).toMatchObject({ state: 'resolved', worktreeId: 'new' })
  })

  it('keeps the same object while an unrelated project update resolves identically', () => {
    const { result } = renderHook(() => useActiveWorkingCopy())
    const first = result.current
    act(() => {
      const [p] = useProjectStore.getState().projects
      useProjectStore.setState({ projects: [{ ...p, name: 'Renamed' }] })
    })
    expect(result.current).toBe(first)
  })
})
