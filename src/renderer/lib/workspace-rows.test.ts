import { describe, expect, it } from 'vitest'
import type { WorkspaceTab } from '@/stores/workspace-store'
import type { Worktree } from '@/types/project'
import {
  type BuildWorkspaceRowsInput,
  buildWorkspaceRows,
  filterWorkspaceRows,
  type WorkspaceRowSession,
  type WorkspaceRowTerminal,
  worktreeNameFromQuery
} from './workspace-rows'

function worktree(id: string, path: string, extra: Partial<Worktree> = {}): Worktree {
  return {
    id,
    name: id,
    branch: `branch-${id}`,
    path,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra
  }
}

const WT_A = worktree('a', 'E:\\p\\.termul\\worktrees\\a')
const WT_B = worktree('b', 'E:/p/.termul/worktrees/b')
const project: BuildWorkspaceRowsInput['project'] = {
  id: 'p1',
  path: 'E:/p',
  gitBranch: 'main',
  isGitRepo: true,
  worktrees: [WT_A, WT_B]
}

const chatTab = (sessionId: string): WorkspaceTab => ({
  type: 'agent-chat',
  id: `chat-${sessionId}`,
  sessionId
})
const termTab = (terminalId: string): WorkspaceTab => ({
  type: 'terminal',
  id: `term-${terminalId}`,
  terminalId
})

function session(id: string, cwd: string, extra: Partial<WorkspaceRowSession> = {}) {
  return { id, projectId: 'p1', cwd, busy: false, ephemeral: false, ...extra }
}
function terminal(id: string, cwd: string | undefined, extra: Partial<WorkspaceRowTerminal> = {}) {
  return { id, projectId: 'p1', cwd, healthStatus: 'running' as const, ...extra }
}

function build(over: Partial<BuildWorkspaceRowsInput> = {}) {
  return buildWorkspaceRows({ project, tabs: [], sessions: [], terminals: [], ...over })
}

describe('buildWorkspaceRows', () => {
  it('lists the project folder first, then the worktrees by branch in listed order', () => {
    const rows = build()
    expect(rows.map((r) => [r.kind, r.label])).toEqual([
      ['project', 'main'],
      ['worktree', 'branch-a'],
      ['worktree', 'branch-b']
    ])
    expect(rows.map((r) => r.key)).toEqual([
      'e:/p',
      'e:/p/.termul/worktrees/a',
      'e:/p/.termul/worktrees/b'
    ])
  })

  it('falls back to Workspace and to the worktree name for empty labels', () => {
    const rows = build({
      project: {
        ...project,
        gitBranch: undefined,
        worktrees: [worktree('c', 'E:/p/.termul/worktrees/c', { branch: '' })]
      }
    })
    expect(rows.map((r) => r.label)).toEqual(['Workspace', 'c'])
  })

  it('shows the project folder row only for a non-git project', () => {
    const rows = build({ project: { ...project, isGitRepo: false } })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('project')
  })

  it('flags outside-root worktrees', () => {
    const rows = build({
      project: { ...project, worktrees: [worktree('x', 'D:/x', { outsideProjectRoot: true })] }
    })
    expect(rows[1].outsideProjectRoot).toBe(true)
    expect(rows[0].outsideProjectRoot).toBe(false)
  })

  it('counts tabs under the deepest working copy, across Windows path forms', () => {
    const rows = build({
      tabs: [chatTab('s1'), chatTab('s2'), termTab('t1'), termTab('t2'), termTab('t3')],
      sessions: [session('s1', 'e:\\P\\.termul\\worktrees\\a\\src'), session('s2', 'E:/p/src')],
      terminals: [
        // `cd`'d out of the worktree: counts where it is now.
        terminal('t1', 'E:/p'),
        terminal('t2', 'E:/p/.termul/worktrees/b'),
        // No cwd yet: counts nowhere.
        terminal('t3', undefined)
      ]
    })
    expect(rows.map((r) => r.openTabCount)).toEqual([2, 1, 1])
  })

  it('counts neither path-less tabs nor unresolved managed paths', () => {
    const rows = build({
      tabs: [{ type: 'git', id: 'g', cwd: 'E:/p' }, chatTab('s1'), chatTab('missing')],
      sessions: [session('s1', 'E:/p/.termul/worktrees/pruned/src')]
    })
    expect(rows.map((r) => r.openTabCount)).toEqual([0, 0, 0])
  })

  it('does not double count when the project path has a trailing slash or other form', () => {
    const rows = build({
      project: { ...project, path: 'E:\\p\\' },
      tabs: [chatTab('s1')],
      sessions: [session('s1', 'e:/p')]
    })
    expect(rows[0].openTabCount).toBe(1)
    expect(rows.reduce((n, r) => n + r.openTabCount, 0)).toBe(1)
  })

  describe('running', () => {
    it('is set by a busy chat in a worktree, not by an idle one', () => {
      const rows = build({
        sessions: [
          session('s1', 'E:/p/.termul/worktrees/a', { busy: true }),
          session('s2', 'E:/p/.termul/worktrees/b')
        ]
      })
      expect(rows.map((r) => r.running)).toEqual([false, true, false])
    })

    it('ignores ephemeral sessions and sessions of other projects', () => {
      const rows = build({
        sessions: [
          session('s1', 'E:/p', { busy: true, ephemeral: true }),
          session('s2', 'E:/p', { busy: true, projectId: 'other' })
        ]
      })
      expect(rows.every((r) => !r.running)).toBe(true)
    })

    it('is set by a running terminal with activity only', () => {
      const rows = build({
        terminals: [
          terminal('t1', 'E:/p/.termul/worktrees/a', { hasActivity: true }),
          terminal('t2', 'E:/p/.termul/worktrees/b', { hasActivity: false }),
          terminal('t3', 'E:/p', { hasActivity: true, healthStatus: 'crashed' }),
          terminal('t4', 'E:/p', { hasActivity: true, projectId: 'other' })
        ]
      })
      expect(rows.map((r) => r.running)).toEqual([false, true, false])
    })
  })
})

describe('filterWorkspaceRows', () => {
  const rows = build()

  it('keeps every row for a blank query', () => {
    expect(filterWorkspaceRows(rows, '  ')).toHaveLength(3)
  })

  it('matches a case-insensitive substring of the label', () => {
    expect(filterWorkspaceRows(rows, 'BRANCH-A').map((r) => r.label)).toEqual(['branch-a'])
    expect(filterWorkspaceRows(rows, 'ranch').map((r) => r.label)).toEqual(['branch-a', 'branch-b'])
  })

  it('returns nothing when no label matches', () => {
    expect(filterWorkspaceRows(rows, 'zzz')).toEqual([])
  })
})

describe('worktreeNameFromQuery', () => {
  it('sanitizes like the New worktree modal', () => {
    expect(worktreeNameFromQuery(' fix login bug ')).toBe('fix-login-bug')
    expect(worktreeNameFromQuery('feat/a  b')).toBe('feat/a-b')
    expect(worktreeNameFromQuery('--x--')).toBe('x')
    expect(worktreeNameFromQuery('a!!b')).toBe('a-b')
  })

  it('returns an empty string when nothing usable is left', () => {
    expect(worktreeNameFromQuery('!!!')).toBe('')
    expect(worktreeNameFromQuery('   ')).toBe('')
  })
})
