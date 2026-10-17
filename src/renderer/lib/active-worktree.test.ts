import { describe, expect, it } from 'vitest'
import type { Project, Worktree } from '@/types/project'
import { activeWorktreeOf, OUTSIDE_PROJECT_ROOT_REASON } from './active-worktree'

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

const a = worktree('a', 'E:/p/.termul/worktrees/a')
const disabled = worktree('ext', 'D:/elsewhere/wt', { outsideProjectRoot: true })
const project: Pick<Project, 'path' | 'worktrees'> = { path: 'E:/p', worktrees: [a, disabled] }

describe('activeWorktreeOf', () => {
  it('returns the listed worktree for a pick in any path form', () => {
    expect(activeWorktreeOf(project, 'e:/p/.termul/worktrees/a')).toBe(a)
    expect(activeWorktreeOf(project, 'E:\\p\\.termul\\worktrees\\a')).toBe(a)
  })

  it('returns undefined with no pick or a pick equal to the project folder', () => {
    expect(activeWorktreeOf(project, undefined)).toBeUndefined()
    expect(activeWorktreeOf(project, null)).toBeUndefined()
    expect(activeWorktreeOf(project, 'e:/p')).toBeUndefined()
  })

  it('returns undefined for a pruned (unlisted) pick', () => {
    expect(activeWorktreeOf(project, 'e:/p/.termul/worktrees/gone')).toBeUndefined()
  })

  it('returns undefined for a pick naming an outsideProjectRoot worktree', () => {
    expect(activeWorktreeOf(project, 'd:/elsewhere/wt')).toBeUndefined()
  })

  it('returns undefined without a project', () => {
    expect(activeWorktreeOf(undefined, 'e:/p/.termul/worktrees/a')).toBeUndefined()
    expect(activeWorktreeOf(null, null)).toBeUndefined()
  })
})

describe('OUTSIDE_PROJECT_ROOT_REASON', () => {
  it('is the one user-facing reason for a worktree outside the project folder', () => {
    expect(OUTSIDE_PROJECT_ROOT_REASON).toBe(
      'Outside the project folder; open it on the desktop app.'
    )
  })
})
