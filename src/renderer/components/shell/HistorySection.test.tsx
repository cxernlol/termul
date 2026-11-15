import type { GitCommit } from '@shared/types/ipc.types'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getLog } = vi.hoisted(() => ({ getLog: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('@/lib/git-api', () => ({ gitApi: { getLog } }))

import { GIT_LOG_LIMIT, HEAD_RECENT_LIMIT, useGitHistoryStore } from '@/stores/git-history-store'
import { useGitStatusStore } from '@/stores/git-status-store'
import { findPaneContainingTab, gitHistoryTabId, useWorkspaceStore } from '@/stores/workspace-store'
import { HistorySection } from './HistorySection'

const CWD = '/work'

function commit(subject: string, hash: string, refs: string[] = []): GitCommit {
  return {
    hash: hash.padEnd(40, '0'),
    shortHash: hash,
    parents: [],
    refs,
    author: 'Ada',
    date: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    subject
  }
}

describe('HistorySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getLog.mockResolvedValue([])
    useGitHistoryStore.setState({
      commits: {},
      loading: {},
      error: {},
      scope: {},
      details: {},
      headSummary: {}
    })
    useGitStatusStore.setState({ commitContexts: {} })
    const tabId = gitHistoryTabId(CWD)
    const pane = findPaneContainingTab(useWorkspaceStore.getState().root, tabId)
    if (pane) useWorkspaceStore.getState().removeTab(tabId)
  })

  it('lists the newest HEAD commits and the count from a HEAD-scoped read', async () => {
    getLog.mockResolvedValue([
      commit('Close the plan', 'a1b2c3d', ['HEAD -> refs/heads/dev', 'refs/remotes/origin/dev']),
      commit('Init', 'b2c3d4e')
    ])
    render(<HistorySection cwd={CWD} isVisible />)

    expect(await screen.findByText('2 commits')).toBeInTheDocument()
    expect(getLog).toHaveBeenCalledWith(CWD, GIT_LOG_LIMIT, false)
    const rows = within(screen.getByRole('list', { name: 'Recent commits' })).getAllByRole(
      'listitem'
    )
    expect(rows.map((row) => row.querySelector('.fade-end')?.textContent)).toEqual([
      'Close the plan',
      'Init'
    ])
    // A decorated commit shows its ref chips; the others show their age.
    expect(within(rows[0]).getByText('dev')).toHaveClass('truncate')
    expect(within(rows[0]).getByText('origin/dev')).toBeInTheDocument()
    expect(within(rows[1]).getByText('2h')).toBeInTheDocument()
    // Everything is listed, so there is no Show all row.
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull()
  })

  it('lists at most the recent limit and offers Show all for the rest', async () => {
    getLog.mockResolvedValue(
      Array.from({ length: GIT_LOG_LIMIT }, (_, i) => commit(`c${i}`, `c${i}`.padEnd(7, '0')))
    )
    render(<HistorySection cwd={CWD} isVisible />)

    const showAll = await screen.findByRole('button', {
      name: `Show all ${GIT_LOG_LIMIT}+ commits`
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(HEAD_RECENT_LIMIT)
    fireEvent.click(showAll)
    expect(
      findPaneContainingTab(useWorkspaceStore.getState().root, gitHistoryTabId(CWD))
    ).not.toBeNull()
  })

  it('collapses and expands the commit list from the header', async () => {
    getLog.mockResolvedValue([commit('Only', 'a1b2c3d')])
    render(<HistorySection cwd={CWD} isVisible />)

    const toggle = await screen.findByRole('button', { name: /^History/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('Only')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Only')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByText('Only')).toBeInTheDocument()
  })

  it('ignores the History tab scope and its commit list', async () => {
    useGitHistoryStore.setState({
      scope: { [CWD]: 'all' },
      commits: { [CWD]: [commit('On another branch', 'f0f0f0f')] }
    })
    getLog.mockResolvedValue([commit('On HEAD', 'a1b2c3d')])
    render(<HistorySection cwd={CWD} isVisible />)

    expect(await screen.findByText('On HEAD')).toBeInTheDocument()
    expect(screen.queryByText(/On another branch/)).toBeNull()
    expect(useGitHistoryStore.getState().scope[CWD]).toBe('all')
    expect(useGitHistoryStore.getState().loading[CWD]).toBeUndefined()
  })

  it('adds a plus when the history reaches the read limit', async () => {
    getLog.mockResolvedValue(
      Array.from({ length: GIT_LOG_LIMIT }, (_, i) => commit(`c${i}`, `c${i}`.padEnd(7, '0')))
    )
    render(<HistorySection cwd={CWD} isVisible />)

    expect(await screen.findByText(`${GIT_LOG_LIMIT}+ commits`)).toBeInTheDocument()
  })

  it('loads only when visible and reloads when the commit context changes', async () => {
    getLog.mockResolvedValue([commit('First', 'a1b2c3d')])
    const { rerender } = render(<HistorySection cwd={CWD} isVisible={false} />)
    expect(getLog).not.toHaveBeenCalled()
    rerender(<HistorySection cwd={CWD} isVisible />)
    expect(await screen.findByText('First')).toBeInTheDocument()
    expect(getLog).toHaveBeenCalledTimes(1)

    getLog.mockResolvedValue([commit('Second', 'b2c3d4e'), commit('First', 'a1b2c3d')])
    await act(async () => {
      useGitStatusStore.setState({
        commitContexts: {
          [CWD]: {
            branch: 'main',
            hasUpstream: false,
            ahead: 1,
            behind: 0,
            stagedCount: 0,
            hasHead: true,
            lastSubject: 'Second',
            lastBody: ''
          }
        }
      })
    })
    expect(await screen.findByText('Second')).toBeInTheDocument()
    expect(screen.getByText('2 commits')).toBeInTheDocument()
    expect(getLog).toHaveBeenCalledTimes(2)
  })

  it('settles to No commits yet when the read fails', async () => {
    getLog.mockRejectedValue(new Error('not a git repository'))
    render(<HistorySection cwd={CWD} isVisible />)

    expect(await screen.findByText('No commits yet')).toBeInTheDocument()
  })

  it('opens the Git History tab and then shows it as open', () => {
    getLog.mockResolvedValue([commit('Init', 'a1b2c3d')])
    render(<HistorySection cwd={CWD} isVisible />)

    fireEvent.click(screen.getByRole('button', { name: 'Open History in the main panel' }))

    expect(
      findPaneContainingTab(useWorkspaceStore.getState().root, gitHistoryTabId(CWD))
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'History, open in the main panel' })
    ).toBeInTheDocument()
  })
})
