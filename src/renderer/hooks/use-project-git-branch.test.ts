import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectGitBranch } from './use-project-git-branch'

// Hoisted mocks: the git facade + log sink are module-level imports of the git
// status store the hook goes through, so they must be stubbed before the module
// graph loads.
const { mockGetCommitContext, mockLogFrontendError } = vi.hoisted(() => ({
  mockGetCommitContext: vi.fn(),
  mockLogFrontendError: vi.fn()
}))

vi.mock('@/lib/git-api', () => ({
  gitApi: {
    getCommitContext: mockGetCommitContext
  }
}))

vi.mock('@/lib/log-api', () => ({
  logFrontendError: mockLogFrontendError
}))

// Real zustand store: the hook reads live state and writes via updateProject,
// so assertions observe actual store mutations (no echo of the mock inputs).
import { resetGitStatusStoreControlForTests, useGitStatusStore } from '@/stores/git-status-store'
import { useProjectStore } from '@/stores/project-store'

describe('useProjectGitBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogFrontendError.mockClear()
    resetGitStatusStoreControlForTests()
    useGitStatusStore.setState({ paths: {}, commitContexts: {}, errors: {} })
    useProjectStore.setState({
      projects: [],
      activeProjectId: '',
      isLoaded: true
    })
  })

  afterEach(() => {
    useProjectStore.setState({
      projects: [],
      activeProjectId: '',
      isLoaded: false
    })
  })

  it('stamps isGitRepo true and seeds gitBranch when commit context resolves', async () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'p1',
          name: 'Repo',
          color: 'blue',
          path: '/work/repo'
          // isGitRepo intentionally absent: the web mirror carries no git
          // fields, so the flag arrives undefined (the launcher gate reads
          // Boolean(undefined) === false until this probe flips it).
        }
      ],
      activeProjectId: 'p1'
    })
    mockGetCommitContext.mockResolvedValue({
      branch: 'master',
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      hasHead: true,
      lastSubject: 'init',
      lastBody: ''
    })

    renderHook(() => useProjectGitBranch())

    await waitFor(() => {
      const project = useProjectStore.getState().projects.find((p) => p.id === 'p1')
      expect(project?.isGitRepo).toBe(true)
      expect(project?.gitBranch).toBe('master')
    })
  })

  it('keeps isGitRepo true on a detached HEAD (branch null) — HEAD exists', async () => {
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'Repo', color: 'blue', path: '/work/repo' }],
      activeProjectId: 'p1'
    })
    mockGetCommitContext.mockResolvedValue({
      branch: null,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      hasHead: true,
      lastSubject: 'init',
      lastBody: ''
    })

    renderHook(() => useProjectGitBranch())

    await waitFor(() => {
      const project = useProjectStore.getState().projects.find((p) => p.id === 'p1')
      // A detached HEAD still resolves a commit context: the project IS a git
      // repo even though there is no branch name to show.
      expect(project?.isGitRepo).toBe(true)
      expect(project?.gitBranch).toBeUndefined()
    })
  })

  it('does NOT stamp isGitRepo when the context resolves but hasHead is false (non-repo path)', async () => {
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'Plain', color: 'blue', path: '/work/plain' }],
      activeProjectId: 'p1'
    })
    // The route succeeds even for a non-repo path (branch null, hasHead
    // false) — the success alone must NOT flip the worktree gate on.
    mockGetCommitContext.mockResolvedValue({
      branch: null,
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      hasHead: false,
      lastSubject: '',
      lastBody: ''
    })

    renderHook(() => useProjectGitBranch())

    await waitFor(() => {
      // gitBranch is cleared (null branch) but isGitRepo stays untouched.
      expect(
        useProjectStore.getState().projects.find((p) => p.id === 'p1')?.gitBranch
      ).toBeUndefined()
    })
    expect(
      useProjectStore.getState().projects.find((p) => p.id === 'p1')?.isGitRepo
    ).toBeUndefined()
  })

  it('leaves isGitRepo untouched when the probe fails (best-effort)', async () => {
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'Repo', color: 'blue', path: '/work/repo' }],
      activeProjectId: 'p1'
    })
    mockGetCommitContext.mockRejectedValue(new Error('NOT_A_GIT_REPO'))

    renderHook(() => useProjectGitBranch())

    await waitFor(() => {
      expect(mockLogFrontendError).toHaveBeenCalledTimes(1)
    })
    const project = useProjectStore.getState().projects.find((p) => p.id === 'p1')
    expect(project?.isGitRepo).toBeUndefined()
    expect(project?.gitBranch).toBeUndefined()
    // The failure is stored in the git status store, not swallowed.
    expect(useGitStatusStore.getState().errors['/work/repo']?.commitContext).toBe('NOT_A_GIT_REPO')
  })

  it('reads the branch through the git status store cache', async () => {
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'Repo', color: 'blue', path: '/work/repo' }],
      activeProjectId: 'p1'
    })
    mockGetCommitContext.mockResolvedValue({
      branch: 'dev',
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      hasHead: true,
      lastSubject: 'init',
      lastBody: ''
    })

    renderHook(() => useProjectGitBranch())

    await waitFor(() => {
      expect(useGitStatusStore.getState().commitContexts['/work/repo']?.branch).toBe('dev')
    })
  })

  it('still seeds gitBranch when another surface supersedes the hook fetch', async () => {
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'Repo', color: 'blue', path: '/work/repo' }],
      activeProjectId: 'p1'
    })
    mockGetCommitContext.mockResolvedValue({
      branch: 'main',
      hasUpstream: false,
      ahead: 0,
      behind: 0,
      hasHead: true,
      lastSubject: 'init',
      lastBody: ''
    })

    renderHook(() => useProjectGitBranch())
    // The status bar / Changes panel fetch the same working copy right away:
    // the store hands the earlier (hook) fetch `null` as superseded.
    void useGitStatusStore.getState().fetchCommitContext('/work/repo')

    await waitFor(() => {
      const project = useProjectStore.getState().projects.find((p) => p.id === 'p1')
      expect(project?.gitBranch).toBe('main')
      expect(project?.isGitRepo).toBe(true)
    })
  })

  it('does not probe a project already known to be non-git', async () => {
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'Plain', color: 'blue', path: '/work/plain', isGitRepo: false }],
      activeProjectId: 'p1'
    })

    renderHook(() => useProjectGitBranch())
    // Flush any accidental microtask work from the effect.
    await Promise.resolve()

    expect(mockGetCommitContext).not.toHaveBeenCalled()
    const project = useProjectStore.getState().projects.find((p) => p.id === 'p1')
    expect(project?.isGitRepo).toBe(false)
  })

  it('does not probe a project without a path', async () => {
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'NoPath', color: 'blue' }],
      activeProjectId: 'p1'
    })

    renderHook(() => useProjectGitBranch())
    await Promise.resolve()

    expect(mockGetCommitContext).not.toHaveBeenCalled()
  })
})
