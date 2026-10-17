import { render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGitStatusStore } from '@/stores/git-status-store'
import type { Project } from '@/types/project'
import { ProjectDiffStat, useProjectDiffStat } from './ProjectDiffStat'

const unwatch = vi.fn()
const watchDiffStat = vi.fn(() => unwatch)
const refreshDiffStat = vi.fn(() => Promise.resolve())
const original = useGitStatusStore.getState()

function project(overrides: Partial<Project> = {}): Project {
  return { id: 'p1', name: 'One', color: 'blue', path: '/repo/one', isGitRepo: true, ...overrides }
}

describe('useProjectDiffStat', () => {
  beforeEach(() => {
    unwatch.mockClear()
    watchDiffStat.mockClear()
    refreshDiffStat.mockClear()
    useGitStatusStore.setState({ diffStats: {}, watchDiffStat, refreshDiffStat })
  })

  afterEach(() => {
    useGitStatusStore.setState({
      diffStats: original.diffStats,
      watchDiffStat: original.watchDiffStat,
      refreshDiffStat: original.refreshDiffStat
    })
  })

  it('watches while mounted, refreshes right after watching, and unwatches on unmount', () => {
    const { unmount } = renderHook(() => useProjectDiffStat(project(), true))

    expect(watchDiffStat).toHaveBeenCalledWith('/repo/one')
    expect(refreshDiffStat).toHaveBeenCalledWith('/repo/one')
    expect(watchDiffStat.mock.invocationCallOrder[0]).toBeLessThan(
      refreshDiffStat.mock.invocationCallOrder[0]
    )
    expect(unwatch).not.toHaveBeenCalled()

    unmount()
    expect(unwatch).toHaveBeenCalledTimes(1)
  })

  it('returns the store stat for the project path', () => {
    useGitStatusStore.setState({ diffStats: { '/repo/one': { added: 3, removed: 1 } } })
    const { result } = renderHook(() => useProjectDiffStat(project(), true))
    expect(result.current).toEqual({ added: 3, removed: 1 })
  })

  it('reads the store when the stat arrives after mount', () => {
    const { result } = renderHook(() => useProjectDiffStat(project(), true))
    expect(result.current).toBeNull()

    useGitStatusStore.setState({ diffStats: { '/repo/one': { added: 0, removed: 5 } } })
    return vi.waitFor(() => expect(result.current).toEqual({ added: 0, removed: 5 }))
  })

  it('returns null for a clean tree', () => {
    useGitStatusStore.setState({ diffStats: { '/repo/one': { added: 0, removed: 0 } } })
    const { result } = renderHook(() => useProjectDiffStat(project(), true))
    expect(result.current).toBeNull()
  })

  it('does nothing when disabled', () => {
    useGitStatusStore.setState({ diffStats: { '/repo/one': { added: 3, removed: 1 } } })
    const { result } = renderHook(() => useProjectDiffStat(project(), false))
    expect(result.current).toBeNull()
    expect(watchDiffStat).not.toHaveBeenCalled()
    expect(refreshDiffStat).not.toHaveBeenCalled()
  })

  it('does not watch a project that is not a git repo or has no path', () => {
    useGitStatusStore.setState({ diffStats: { '/repo/one': { added: 3, removed: 1 } } })
    const noGit = renderHook(() => useProjectDiffStat(project({ isGitRepo: false }), true))
    const noPath = renderHook(() => useProjectDiffStat(project({ path: undefined }), true))

    expect(noGit.result.current).toBeNull()
    expect(noPath.result.current).toBeNull()
    expect(watchDiffStat).not.toHaveBeenCalled()
  })

  it('watches a project whose git state is still unknown', () => {
    renderHook(() => useProjectDiffStat(project({ isGitRepo: undefined }), true))
    expect(watchDiffStat).toHaveBeenCalledWith('/repo/one')
  })

  it('shows nothing when the refresh failed (no stat in the store)', () => {
    useGitStatusStore.setState({ errors: { '/repo/one': { diffStat: 'boom' } } })
    const { result } = renderHook(() => useProjectDiffStat(project(), true))
    expect(result.current).toBeNull()
    useGitStatusStore.setState({ errors: original.errors })
  })
})

describe('ProjectDiffStat', () => {
  it('renders +N in success and −M in destructive, one space apart', () => {
    render(<ProjectDiffStat stat={{ added: 3, removed: 1 }} />)
    const el = screen.getByTestId('project-diff-stat')
    expect(el).toHaveTextContent('+3 −1')
    expect(el.querySelector('.text-success')).toHaveTextContent('+3')
    expect(el.querySelector('.text-destructive')).toHaveTextContent('−1')
  })

  it('omits a zero side', () => {
    render(<ProjectDiffStat stat={{ added: 0, removed: 7 }} />)
    expect(screen.getByTestId('project-diff-stat')).toHaveTextContent(/^−7$/)
  })
})
