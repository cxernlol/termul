import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockTerminal } from '@/lib/test-utils/terminal'
import { useGitStatusStore } from '@/stores/git-status-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { GIT_STATUS_POLL_INTERVAL_MS, startGitStatusRefreshSources } from './git-status-sources'

const { mockOnStatus, mockOnBranch, mockOnFocus } = vi.hoisted(() => ({
  mockOnStatus: vi.fn(),
  mockOnBranch: vi.fn(),
  mockOnFocus: vi.fn()
}))

vi.mock('@/lib/api', () => ({
  terminalApi: { onGitStatusChanged: mockOnStatus, onGitBranchChanged: mockOnBranch }
}))
vi.mock('@/lib/window-focus-api', () => ({ onWindowFocus: mockOnFocus }))
vi.mock('@/lib/git-api', () => ({ gitApi: {} }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const ROOT = 'C:/project'
const WORKTREE = 'C:/project/.termul/worktrees/feat'

let onStatus: (ptyId: string) => void
let onBranch: (ptyId: string) => void
let onFocus: () => void
const stopStatus = vi.fn()
const stopBranch = vi.fn()
const stopFocus = vi.fn()
const refreshWorkingCopy = vi.fn().mockResolvedValue(undefined)
const refreshTracked = vi.fn().mockResolvedValue(undefined)

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  setVisibility('visible')
  mockOnStatus.mockImplementation((cb: (ptyId: string) => void) => {
    onStatus = cb
    return stopStatus
  })
  mockOnBranch.mockImplementation((cb: (ptyId: string) => void) => {
    onBranch = cb
    return stopBranch
  })
  mockOnFocus.mockImplementation((cb: () => void) => {
    onFocus = cb
    return stopFocus
  })
  useGitStatusStore.setState({
    paths: { 'c:/project': ROOT, 'c:/project/.termul/worktrees/feat': WORKTREE },
    refreshWorkingCopy,
    refreshTracked
  })
  useTerminalStore.setState({
    terminals: [
      mockTerminal({ id: 't-root', cwd: 'C:\\project\\src' }),
      mockTerminal({ id: 't-wt', cwd: `${WORKTREE}/app` }),
      mockTerminal({ id: 't-out', cwd: 'D:/elsewhere' })
    ]
  })
})

afterEach(() => {
  vi.useRealTimers()
  delete (document as unknown as Record<string, unknown>).visibilityState
})

function ptyOf(terminalId: string): string {
  return `pty-${terminalId}`
}

function bindPty() {
  const terminals = useTerminalStore.getState().terminals
  useTerminalStore.setState({
    ptyIdIndex: new Map(terminals.map((t) => [ptyOf(t.id), t.id]))
  })
}

describe('startGitStatusRefreshSources', () => {
  it('refreshes only the deepest tracked key for a terminal git event', () => {
    bindPty()
    const stop = startGitStatusRefreshSources()

    onStatus(ptyOf('t-wt'))
    expect(refreshWorkingCopy).toHaveBeenCalledTimes(1)
    expect(refreshWorkingCopy).toHaveBeenCalledWith(WORKTREE)

    refreshWorkingCopy.mockClear()
    onBranch(ptyOf('t-root'))
    expect(refreshWorkingCopy).toHaveBeenCalledTimes(1)
    expect(refreshWorkingCopy).toHaveBeenCalledWith(ROOT)
    stop()
  })

  it('refetches a loaded branch list on a branch change, but not on a status event', () => {
    bindPty()
    const fetchBranches = vi.fn().mockResolvedValue(undefined)
    useGitStatusStore.setState({ fetchBranches, branches: { 'c:/project': ['main'] } })
    const stop = startGitStatusRefreshSources()

    onStatus(ptyOf('t-root'))
    expect(fetchBranches).not.toHaveBeenCalled()

    onBranch(ptyOf('t-root'))
    expect(fetchBranches).toHaveBeenCalledTimes(1)
    expect(fetchBranches).toHaveBeenCalledWith(ROOT)

    // No branch list loaded for the worktree: nothing to refetch.
    fetchBranches.mockClear()
    onBranch(ptyOf('t-wt'))
    expect(fetchBranches).not.toHaveBeenCalled()
    stop()
  })

  it('ignores terminal events for untracked or unknown terminals', () => {
    bindPty()
    const stop = startGitStatusRefreshSources()

    onStatus(ptyOf('t-out'))
    onBranch('pty-unknown')

    expect(refreshWorkingCopy).not.toHaveBeenCalled()
    stop()
  })

  it('coalesces a burst of events for one key into a running and one trailing refresh', async () => {
    bindPty()
    let release: () => void = () => {}
    refreshWorkingCopy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const stop = startGitStatusRefreshSources()

    onStatus(ptyOf('t-root'))
    onStatus(ptyOf('t-root'))
    onBranch(ptyOf('t-root'))
    expect(refreshWorkingCopy).toHaveBeenCalledTimes(1)

    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(refreshWorkingCopy).toHaveBeenCalledTimes(2)
    stop()
  })

  it('refreshes all tracked keys on window focus', () => {
    const stop = startGitStatusRefreshSources()
    onFocus()
    expect(refreshTracked).toHaveBeenCalledTimes(1)
    stop()
  })

  it('refreshes on the 30 s interval only while the document is visible', () => {
    const stop = startGitStatusRefreshSources()

    vi.advanceTimersByTime(GIT_STATUS_POLL_INTERVAL_MS)
    expect(refreshTracked).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    vi.advanceTimersByTime(GIT_STATUS_POLL_INTERVAL_MS * 2)
    expect(refreshTracked).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    vi.advanceTimersByTime(GIT_STATUS_POLL_INTERVAL_MS)
    expect(refreshTracked).toHaveBeenCalledTimes(2)
    stop()
  })

  it('stops every source on teardown', () => {
    const stop = startGitStatusRefreshSources()
    stop()

    expect(stopStatus).toHaveBeenCalledTimes(1)
    expect(stopBranch).toHaveBeenCalledTimes(1)
    expect(stopFocus).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(GIT_STATUS_POLL_INTERVAL_MS * 2)
    expect(refreshTracked).not.toHaveBeenCalled()
  })
})
