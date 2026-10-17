import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGitStatusStore } from '@/stores/git-status-store'
import {
  isPathWithinRepo,
  resetGitStatusRefreshSchedulerForTests,
  scheduleGitStatusRefreshForPath
} from './schedule-git-status-refresh'

vi.mock('@/stores/git-status-store', async (importOriginal) => ({
  deepestTrackedKey: (await importOriginal<typeof import('@/stores/git-status-store')>())
    .deepestTrackedKey,
  useGitStatusStore: {
    getState: vi.fn()
  }
}))

const REPO = 'C:/project'
const refreshStatus = vi.fn().mockResolvedValue(undefined)
const refreshDiffStat = vi.fn().mockResolvedValue(undefined)

function track(paths: Record<string, string>) {
  vi.mocked(useGitStatusStore.getState).mockReturnValue({
    paths,
    refreshStatus,
    refreshDiffStat
  } as unknown as ReturnType<typeof useGitStatusStore.getState>)
}

beforeEach(() => {
  vi.useFakeTimers()
  resetGitStatusRefreshSchedulerForTests()
  refreshStatus.mockClear()
  refreshDiffStat.mockClear()
  track({ 'c:/project': REPO })
})

afterEach(() => {
  vi.useRealTimers()
  resetGitStatusRefreshSchedulerForTests()
})

describe('isPathWithinRepo', () => {
  it('matches file under repo with mixed separators', () => {
    expect(isPathWithinRepo('C:\\project\\src\\a.ts', REPO)).toBe(true)
  })

  it('rejects paths outside repo', () => {
    expect(isPathWithinRepo('C:/other/file.ts', REPO)).toBe(false)
  })

  it('matches Windows paths case-insensitively', () => {
    expect(isPathWithinRepo('c:/project/src/a.ts', 'C:/project')).toBe(true)
  })
})

describe('scheduleGitStatusRefreshForPath', () => {
  it('debounces refreshStatus for the matching tracked working copy', async () => {
    scheduleGitStatusRefreshForPath(`${REPO}/src/foo.ts`)
    scheduleGitStatusRefreshForPath(`${REPO}/src/bar.ts`)

    expect(refreshStatus).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)

    expect(refreshStatus).toHaveBeenCalledTimes(1)
    expect(refreshStatus).toHaveBeenCalledWith(REPO)
    expect(refreshDiffStat).toHaveBeenCalledWith(REPO)
  })

  it('matches a different path spelling of the tracked key', async () => {
    scheduleGitStatusRefreshForPath('c:\\Project\\src\\foo.ts')
    await vi.advanceTimersByTimeAsync(1000)

    expect(refreshStatus).toHaveBeenCalledTimes(1)
    expect(refreshStatus).toHaveBeenCalledWith(REPO)
  })

  it('does not reset debounce for unrelated paths while a refresh is pending', async () => {
    scheduleGitStatusRefreshForPath(`${REPO}/src/foo.ts`)
    await vi.advanceTimersByTimeAsync(200)
    scheduleGitStatusRefreshForPath('C:/other/outside.ts')
    await vi.advanceTimersByTimeAsync(200)

    expect(refreshStatus).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(850)

    expect(refreshStatus).toHaveBeenCalledTimes(1)
    expect(refreshStatus).toHaveBeenCalledWith(REPO)
  })

  it('refreshes only the tracked working copy that contains the changed path', async () => {
    track({ 'c:/project': REPO, 'c:/other-project': 'C:/other-project' })

    scheduleGitStatusRefreshForPath(`${REPO}/src/foo.ts`)
    await vi.advanceTimersByTimeAsync(1000)

    expect(refreshStatus).toHaveBeenCalledTimes(1)
    expect(refreshStatus).toHaveBeenCalledWith(REPO)
  })

  it('refreshes only the deepest tracked key when worktrees are nested', async () => {
    const worktree = 'C:/project/.termul/worktrees/feat'
    track({ 'c:/project': REPO, 'c:/project/.termul/worktrees/feat': worktree })

    scheduleGitStatusRefreshForPath(`${worktree}/src/foo.ts`)
    await vi.advanceTimersByTimeAsync(1000)

    expect(refreshStatus).toHaveBeenCalledTimes(1)
    expect(refreshStatus).toHaveBeenCalledWith(worktree)
  })

  it('no-ops when no tracked working copy contains the path', async () => {
    track({})

    scheduleGitStatusRefreshForPath(`${REPO}/src/foo.ts`)
    await vi.advanceTimersByTimeAsync(1000)

    expect(refreshStatus).not.toHaveBeenCalled()
    expect(refreshDiffStat).not.toHaveBeenCalled()
  })
})
