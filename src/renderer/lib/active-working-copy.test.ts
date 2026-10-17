import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockAcpSession } from '@/lib/test-utils/acp'
import { mockTerminal } from '@/lib/test-utils/terminal'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { useWorkspaceStore, type WorkspaceTab } from '@/stores/workspace-store'
import type { Project, Worktree } from '@/types/project'
import {
  getActiveWorkingCopy,
  isGitWriteBlocked,
  reportUnresolvedWorkingCopy,
  resetReconciledUnresolvedForTests
} from './active-working-copy'

const { logFrontendError } = vi.hoisted(() => ({ logFrontendError: vi.fn(async () => {}) }))
vi.mock('@/lib/log-api', () => ({ logFrontendError }))

const { reconcile } = vi.hoisted(() => ({ reconcile: vi.fn(async () => 'unchanged') }))
vi.mock('@/lib/worktree-reconciler', () => ({ reconcileProjectWorktrees: reconcile }))

const ROOT = 'E:/p'
const WT_A = 'E:/p/.termul/worktrees/a'
const WT_B = 'E:/p/.termul/worktrees/b'

function wt(id: string, path: string): Worktree {
  return { id, name: id, branch: `b-${id}`, path, createdAt: '2026-01-01T00:00:00.000Z' }
}

function project(worktrees: Worktree[] = [wt('a', WT_A), wt('b', WT_B)]): Project {
  return { id: 'p1', name: 'P', color: 'blue', path: ROOT, worktrees } as Project
}

function seed(p: Project = project()): void {
  useProjectStore.setState({ projects: [p], activeProjectId: 'p1' })
}

function setActiveTab(tab: WorkspaceTab | null): void {
  useWorkspaceStore.setState({
    root: { type: 'leaf', id: 'pane-1', tabs: tab ? [tab] : [], activeTabId: tab?.id ?? null },
    activePaneId: 'pane-1'
  })
}

function setPick(path: string | null): void {
  useShellLayoutStore.setState({ worktreePickByProject: path === null ? {} : { p1: path } })
}

beforeEach(() => {
  logFrontendError.mockClear()
  reconcile.mockClear()
  reconcile.mockResolvedValue('unchanged')
  resetReconciledUnresolvedForTests()
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ status: 'unavailable' })
  useAcpStore.setState({ sessions: {} })
  useTerminalStore.setState({ terminals: [] })
  seed()
  setActiveTab(null)
})

describe('getActiveWorkingCopy', () => {
  it('resolves an active chat inside a listed worktree, ahead of the pick', () => {
    useAcpStore.setState({
      sessions: { s1: mockAcpSession({ id: 's1', cwd: `${WT_A}/src` }) }
    })
    setActiveTab({ type: 'agent-chat', id: 'chat-s1', sessionId: 's1' })
    setPick(ROOT)
    expect(getActiveWorkingCopy()).toMatchObject({
      state: 'resolved',
      kind: 'worktree',
      worktreeId: 'a',
      path: WT_A
    })
  })

  it('resolves an active terminal from its live cwd', () => {
    useTerminalStore.setState({
      terminals: [mockTerminal({ id: 't1', projectId: 'p1', cwd: `${WT_B}/x` })]
    })
    setActiveTab({ type: 'terminal', id: 'term-t1', terminalId: 't1' })
    expect(getActiveWorkingCopy('p1')).toMatchObject({ kind: 'worktree', worktreeId: 'b' })
  })

  it('uses the pick for a tab without a path', () => {
    setActiveTab({ type: 'browser', id: 'br-1' } as WorkspaceTab)
    setPick(WT_B)
    expect(getActiveWorkingCopy()).toMatchObject({ kind: 'worktree', worktreeId: 'b', path: WT_B })
  })

  it('resolves the project folder with no pick and an editor tab inside it', () => {
    setActiveTab({ type: 'editor', id: 'ed-1', filePath: `${ROOT}/src/a.ts` } as WorkspaceTab)
    expect(getActiveWorkingCopy()).toMatchObject({ state: 'resolved', kind: 'project', path: ROOT })
  })

  it('resolves a pruned pick as the project folder', () => {
    setPick('E:/p/.termul/worktrees/gone')
    expect(getActiveWorkingCopy()).toMatchObject({ kind: 'project' })
  })

  it('returns unresolved for a chat cwd in an unlisted managed worktree', () => {
    useAcpStore.setState({
      sessions: { s1: mockAcpSession({ id: 's1', cwd: 'E:/p/.termul/worktrees/gone/src' }) }
    })
    setActiveTab({ type: 'agent-chat', id: 'chat-s1', sessionId: 's1' })
    setPick(WT_A)
    expect(getActiveWorkingCopy()).toEqual({
      state: 'unresolved',
      key: 'e:/p/.termul/worktrees/gone',
      path: 'E:/p/.termul/worktrees/gone'
    })
  })

  it('is null without a project', () => {
    expect(getActiveWorkingCopy('missing')).toBeNull()
  })
})

describe('isGitWriteBlocked', () => {
  const projects = [project()]

  it('blocks an unlisted managed worktree path', () => {
    expect(isGitWriteBlocked('E:/p/.termul/worktrees/gone', projects)).toBe(true)
    expect(isGitWriteBlocked('E:\\p\\.termul\\worktrees\\gone\\src', projects)).toBe(true)
  })

  it('allows listed worktrees, the project folder and unknown explicit paths', () => {
    expect(isGitWriteBlocked(WT_A, projects)).toBe(false)
    expect(isGitWriteBlocked(ROOT, projects)).toBe(false)
    expect(isGitWriteBlocked('D:/elsewhere', projects)).toBe(false)
    expect(isGitWriteBlocked('', projects)).toBe(false)
    expect(isGitWriteBlocked(null, projects)).toBe(false)
  })

  it('allows a path another project resolves', () => {
    const other = { id: 'p2', name: 'Q', color: 'red', path: 'E:/p/.termul/worktrees/gone' }
    expect(isGitWriteBlocked('E:/p/.termul/worktrees/gone', [project(), other as Project])).toBe(
      false
    )
  })
})

describe('reportUnresolvedWorkingCopy', () => {
  const unresolved = {
    state: 'unresolved' as const,
    key: 'e:/p/.termul/worktrees/gone',
    path: 'E:/p/.termul/worktrees/gone'
  }

  it('reconciles once per distinct key and logs one [working-copy] record', async () => {
    expect(reportUnresolvedWorkingCopy('p1', unresolved)).toBe(true)
    expect(reportUnresolvedWorkingCopy('p1', unresolved)).toBe(false)
    await vi.waitFor(() => expect(logFrontendError).toHaveBeenCalledTimes(1))
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(reconcile).toHaveBeenCalledWith('p1')
    expect(logFrontendError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('[working-copy]') })
    )
    expect(
      reportUnresolvedWorkingCopy('p1', { ...unresolved, key: 'e:/p/.termul/worktrees/x' })
    ).toBe(true)
    expect(reconcile).toHaveBeenCalledTimes(2)
  })

  it('does nothing for a resolved or absent working copy', () => {
    expect(
      reportUnresolvedWorkingCopy('p1', {
        state: 'resolved',
        kind: 'project',
        key: 'e:/p',
        path: ROOT,
        worktreeId: null
      })
    ).toBe(false)
    expect(reportUnresolvedWorkingCopy('p1', null)).toBe(false)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('reconciles the same key again after an update changed the listing', async () => {
    reconcile.mockResolvedValueOnce('updated')
    reportUnresolvedWorkingCopy('p1', unresolved)
    await vi.waitFor(() => expect(logFrontendError).toHaveBeenCalledTimes(1))
    expect(reportUnresolvedWorkingCopy('p1', unresolved)).toBe(true)
  })

  it('retries the same key after an unchanged outcome', async () => {
    reportUnresolvedWorkingCopy('p1', unresolved)
    await vi.waitFor(() => expect(logFrontendError).toHaveBeenCalledTimes(1))
    expect(reportUnresolvedWorkingCopy('p1', unresolved)).toBe(true)
  })

  it('logs a rejected reconcile without an unhandled rejection and allows a retry', async () => {
    reconcile.mockRejectedValueOnce(new Error('boom'))
    expect(reportUnresolvedWorkingCopy('p1', unresolved)).toBe(true)
    await vi.waitFor(() => expect(logFrontendError).toHaveBeenCalledTimes(1))
    expect(logFrontendError).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('reconcile failed: boom')
      })
    )
    expect(reportUnresolvedWorkingCopy('p1', unresolved)).toBe(true)
  })
})
