import { describe, expect, it } from 'vitest'
import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import type { Worktree } from '@/types/project'
import { branchLineOf, buildChatCards, filterChatCards } from './chat-cards'

const worktree = (overrides: Partial<Worktree> = {}): Worktree => ({
  id: 'w1',
  name: 'feature',
  branch: 'feat/x',
  path: '/repo/.termul/worktrees/feature',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides
})

const project = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  path: '/repo',
  gitBranch: 'main',
  isGitRepo: true,
  worktrees: [worktree()],
  ...overrides
})

const entry = (id: string, overrides = {}) =>
  mockSessionIndexEntry({ id, title: `Chat ${id}`, cwd: '/repo', projectId: 'p1', ...overrides })

const agentNames = new Map([['cfg-1', 'Claude Code']])

describe('buildChatCards', () => {
  it('lists Workspace chats of the project newest first, id as tie-break, excluding discovered', () => {
    const cards = buildChatCards({
      sessionIndex: [
        entry('b', { lastActivityAt: 10 }),
        entry('a', { lastActivityAt: 10 }),
        entry('c', { lastActivityAt: 30 }),
        entry('d', { lastActivityAt: 99, discovered: true }),
        entry('e', { lastActivityAt: 50, projectId: 'p2' })
      ],
      project: project(),
      pick: undefined,
      agentNames
    })
    expect(cards.map((c) => c.entry.id)).toEqual(['c', 'a', 'b'])
  })

  it('keeps orphans and every working copy in Workspace scope', () => {
    const cards = buildChatCards({
      sessionIndex: [
        entry('root', { cwd: '/repo' }),
        entry('wt', { cwd: '/repo/.termul/worktrees/feature/src' }),
        entry('orphan', { cwd: '/elsewhere' })
      ],
      project: project(),
      pick: undefined,
      agentNames
    })
    expect(cards).toHaveLength(3)
  })

  it('narrows to the picked worktree only', () => {
    const cards = buildChatCards({
      sessionIndex: [
        entry('root', { cwd: '/repo' }),
        entry('wt', { cwd: '/repo/.termul/worktrees/feature/src' }),
        entry('orphan', { cwd: '/elsewhere' })
      ],
      project: project(),
      pick: '/repo/.termul/worktrees/feature',
      agentNames
    })
    expect(cards.map((c) => c.entry.id)).toEqual(['wt'])
  })

  it('falls back to every chat when the pick is pruned or outside the root', () => {
    const sessionIndex = [entry('root'), entry('wt', { cwd: '/repo/.termul/worktrees/feature' })]
    const pruned = buildChatCards({
      sessionIndex,
      project: project(),
      pick: '/repo/.termul/worktrees/gone',
      agentNames
    })
    expect(pruned).toHaveLength(2)
    const outside = buildChatCards({
      sessionIndex,
      project: project({ worktrees: [worktree({ outsideProjectRoot: true })] }),
      pick: '/repo/.termul/worktrees/feature',
      agentNames
    })
    expect(outside).toHaveLength(2)
  })

  it('resolves the agent name and the index model', () => {
    const [card] = buildChatCards({
      sessionIndex: [entry('a', { agentConfigId: 'cfg-1', modelId: 'm-1', modelName: 'Opus' })],
      project: project(),
      pick: undefined,
      agentNames
    })
    expect(card.agentName).toBe('Claude Code')
    expect(card.indexModel).toBe('Opus')
    const [byId] = buildChatCards({
      sessionIndex: [entry('a', { modelId: 'm-1' })],
      project: project(),
      pick: undefined,
      agentNames
    })
    expect(byId.indexModel).toBe('m-1')
    expect(byId.agentName).toBeNull()
  })
})

describe('branchLineOf', () => {
  it('shows the listed worktree branch, renamed or not', () => {
    const line = branchLineOf(
      entry('a', { cwd: '/repo/.termul/worktrees/feature', worktreeBranch: 'old-name' }),
      project()
    )
    expect(line).toBe('feat/x')
  })

  it('falls back to the stored branch when the listed worktree has no branch', () => {
    const line = branchLineOf(
      entry('a', { cwd: '/repo/.termul/worktrees/feature', worktreeBranch: 'stored' }),
      project({ worktrees: [worktree({ branch: '' })] })
    )
    expect(line).toBe('stored')
  })

  it('shows the stored branch for a deleted worktree', () => {
    const line = branchLineOf(
      entry('a', {
        cwd: '/repo/.termul/worktrees/gone',
        worktreePath: '/repo/.termul/worktrees/gone',
        worktreeBranch: 'feat/gone'
      }),
      project()
    )
    expect(line).toBe('feat/gone')
  })

  it('shows the project branch for a checkout chat', () => {
    expect(branchLineOf(entry('a', { cwd: '/repo/src' }), project())).toBe('main')
  })

  it('is empty on a project without git', () => {
    expect(branchLineOf(entry('a'), project({ isGitRepo: false }))).toBe('')
  })
})

describe('filterChatCards', () => {
  const cards = buildChatCards({
    sessionIndex: [
      entry('a', { title: 'Refactor Auth', agentConfigId: 'cfg-1', cwd: '/repo' }),
      entry('b', { title: 'Add tests', cwd: '/repo/.termul/worktrees/feature' })
    ],
    project: project(),
    pick: undefined,
    agentNames
  })

  it('returns everything for a blank query', () => {
    expect(filterChatCards(cards, '  ')).toHaveLength(2)
  })

  it('matches the title case-insensitively', () => {
    expect(filterChatCards(cards, 'AUTH').map((c) => c.entry.id)).toEqual(['a'])
  })

  it('matches only the agent name', () => {
    expect(filterChatCards(cards, 'claude').map((c) => c.entry.id)).toEqual(['a'])
  })

  it('matches only the branch line', () => {
    expect(filterChatCards(cards, 'feat/x').map((c) => c.entry.id)).toEqual(['b'])
  })

  it('returns nothing when no field matches', () => {
    expect(filterChatCards(cards, 'zzz')).toEqual([])
  })

  it('matches the visible model line: the recorded model, or the Agent fallback', () => {
    const modelCards = buildChatCards({
      sessionIndex: [
        entry('m', { title: 'One', cwd: '/repo', modelName: 'Opus 4' }),
        entry('n', { title: 'Two', cwd: '/repo' })
      ],
      project: project(),
      pick: undefined,
      agentNames
    })
    expect(filterChatCards(modelCards, 'opus').map((c) => c.entry.id)).toEqual(['m'])
    expect(filterChatCards(modelCards, 'agent').map((c) => c.entry.id)).toEqual(['n'])
  })
})
