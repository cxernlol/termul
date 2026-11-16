import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { normalizePath } from '@/lib/working-copy'
import { resetGitStatusStoreControlForTests, useGitStatusStore } from '@/stores/git-status-store'

const admits = vi.hoisted(() => ({ value: true }))
vi.mock('@/hooks/use-server-admits-remote-writes', () => ({
  useServerAdmitsRemoteWrites: () => admits.value
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(async () => {}) }))
vi.mock('@/lib/git-api', () => ({
  gitApi: { getStatus: vi.fn(), getDiffStat: vi.fn(), getCommitContext: vi.fn(), discard: vi.fn() }
}))

import { ChangesPanel, type ChangesPanelProps } from './ChangesPanel'
import type { ChangedFile, ChatChangedFiles } from './use-chat-changed-files'

const CWD = '/work'

function file(name: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
  return { path: `${CWD}/src/${name}`, status: 'modified', added: 3, removed: 1, ...overrides }
}

function changes(files: ChangedFile[], source: 'git' | 'session' = 'git'): ChatChangedFiles {
  return {
    files,
    rowBase: CWD,
    source,
    totalAdded: files.reduce((n, f) => n + f.added, 0),
    totalRemoved: files.reduce((n, f) => n + f.removed, 0)
  }
}

const discardFiles = vi.fn(async () => {})
const refreshStatus = vi.fn(async () => {})

function renderPanel(overrides: Partial<ChangesPanelProps> = {}) {
  const props: ChangesPanelProps = {
    changes: changes([file('a.ts'), file('b.ts')]),
    cwd: CWD,
    turnActive: false,
    onOpenFile: vi.fn(),
    onOpenGit: vi.fn(),
    ...overrides
  }
  const view = render(
    <TooltipProvider delayDuration={0}>
      <ChangesPanel {...props} />
    </TooltipProvider>
  )
  return { ...view, props }
}

function seedReady() {
  useGitStatusStore.setState((state) => ({
    statuses: { ...state.statuses, [normalizePath(CWD)]: [] },
    diffStats: {
      ...state.diffStats,
      [normalizePath(CWD)]: { root: CWD, files: [], added: 0, removed: 0 }
    }
  }))
}

beforeEach(() => {
  admits.value = true
  discardFiles.mockClear()
  discardFiles.mockResolvedValue(undefined)
  refreshStatus.mockClear()
  resetGitStatusStoreControlForTests()
  useGitStatusStore.setState({
    statuses: {},
    diffStats: {},
    errors: {},
    discardFiles,
    refreshStatus
  })
  seedReady()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ChangesPanel header', () => {
  it('git source: files not committed, with the line totals', () => {
    renderPanel()
    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.getByText('This chat · 2 files, not committed')).toBeInTheDocument()
    expect(screen.getByText('+6')).toBeInTheDocument()
    expect(screen.getByText('−2')).toBeInTheDocument()
  })

  it('git source: singular for one file', () => {
    renderPanel({ changes: changes([file('a.ts')]) })
    expect(screen.getByText('This chat · 1 file, not committed')).toBeInTheDocument()
  })

  it('session source: files edited, no totals', () => {
    renderPanel({ changes: changes([file('a.ts'), file('b.ts')], 'session') })
    expect(screen.getByText('This chat · 2 files edited')).toBeInTheDocument()
    expect(screen.queryByText('+6')).toBeNull()
  })

  it('session source: singular for one file', () => {
    renderPanel({ changes: changes([file('a.ts')], 'session') })
    expect(screen.getByText('This chat · 1 file edited')).toBeInTheDocument()
  })

  it('showTitle false leaves the header out', () => {
    renderPanel({ showTitle: false })
    expect(screen.queryByText('Changes')).toBeNull()
    expect(screen.queryByText(/This chat/)).toBeNull()
  })
})

describe('ChangesPanel rows', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => file(`${n}.ts`))

  it('shows 4 rows and "Show N more", which opens Git', () => {
    const { props } = renderPanel({ changes: changes(many) })
    expect(screen.getAllByRole('button', { name: /, Modified$/ })).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(props.onOpenGit).toHaveBeenCalledTimes(1)
  })

  it('without onOpenGit shows every row and no "Show N more"', () => {
    renderPanel({ changes: changes(many), onOpenGit: undefined })
    expect(screen.getAllByRole('button', { name: /, Modified$/ })).toHaveLength(6)
    expect(screen.queryByText(/Show \d+ more/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open in Git' })).toBeNull()
  })

  it('a row click opens that file', () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: `${CWD}/src/b.ts, Modified` }))
    expect(props.onOpenFile).toHaveBeenCalledWith(`${CWD}/src/b.ts`)
  })

  it('shows the folder and the counts in a fixed lane', () => {
    renderPanel({ changes: changes([file('a.ts', { added: 12, removed: 4 })]) })
    const row = screen.getByRole('button', { name: `${CWD}/src/a.ts, Modified` })
    expect(within(row).getByText('src')).toBeInTheDocument()
    expect(within(row).getByText('+12').parentElement).toHaveClass('w-16', 'tabular-nums')
    expect(within(row).getByText('+12')).toHaveClass('text-diff-added-foreground')
    expect(within(row).getByText('−4')).toHaveClass('text-destructive')
  })

  it('a renamed file with no counts shows "Renamed"', () => {
    renderPanel({
      changes: changes([file('a.ts', { status: 'renamed', added: 0, removed: 0 })])
    })
    expect(screen.getByText('Renamed')).toHaveClass('text-connection')
  })

  it('a deleted file has a quieter name, no strikethrough and a −N count', () => {
    renderPanel({
      changes: changes([file('gone.ts', { status: 'deleted', added: 0, removed: 9 })])
    })
    const row = screen.getByRole('group', { name: `${CWD}/src/gone.ts, Deleted` })
    const name = within(row).getByText('gone.ts')
    expect(name).toHaveClass('text-muted-foreground')
    expect(row.innerHTML).not.toContain('line-through')
    expect(within(row).getByText('−9')).toBeInTheDocument()
  })
})

describe('ChangesPanel discard', () => {
  const discardAll = () => screen.getByRole('button', { name: 'Discard all' })

  it('asks in place, with focus on Cancel', () => {
    renderPanel()
    fireEvent.click(discardAll())
    expect(
      screen.getByText(
        "Discard changes in 2 files? New files are deleted, and your own edits in these files go too. You can't undo this."
      )
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Discard 2 files' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open in Git' })).toBeNull()
  })

  it('Cancel returns to the footer and focus returns to "Discard all"', () => {
    renderPanel()
    fireEvent.click(discardAll())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(discardAll()).toHaveFocus()
    expect(discardFiles).not.toHaveBeenCalled()
  })

  it('Esc cancels the confirm and does not reach the popover', () => {
    const outside = vi.fn()
    document.addEventListener('keydown', outside, true)
    try {
      renderPanel()
      fireEvent.click(discardAll())
      fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' })
      expect(outside).not.toHaveBeenCalled()
      expect(screen.queryByText(/Discard changes in/)).toBeNull()
      fireEvent.keyDown(discardAll(), { key: 'Escape' })
      expect(outside).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('keydown', outside, true)
    }
  })

  it('discards every listed file, paths relative to the folder, not just the visible 4', async () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => file(`${n}.ts`))
    renderPanel({ changes: changes(six) })
    fireEvent.click(discardAll())
    fireEvent.click(screen.getByRole('button', { name: 'Discard 6 files' }))
    await waitFor(() => expect(discardFiles).toHaveBeenCalledTimes(1))
    expect(discardFiles).toHaveBeenCalledWith(
      CWD,
      six.map((f) => f.path.replace(`${CWD}/`, ''))
    )
  })

  it('a chat in a subfolder discards from the repository root and refreshes its folder', async () => {
    const sub = `${CWD}/packages/app`
    const files = [
      { path: `${CWD}/top.ts`, status: 'modified' as const, added: 1, removed: 0 },
      { path: `${sub}/inner.ts`, status: 'untracked' as const, added: 2, removed: 0 }
    ]
    renderPanel({ cwd: sub, changes: changes(files) })
    fireEvent.click(discardAll())
    fireEvent.click(screen.getByRole('button', { name: 'Discard 2 files' }))
    await waitFor(() => expect(discardFiles).toHaveBeenCalledTimes(1))
    expect(discardFiles).toHaveBeenCalledWith(CWD, ['top.ts', 'packages/app/inner.ts'])
    await waitFor(() => expect(refreshStatus).toHaveBeenCalledWith(sub))
  })

  it('a turn that starts while the confirm is open disables the confirm', () => {
    const { rerender, props } = renderPanel()
    fireEvent.click(discardAll())
    rerender(
      <TooltipProvider delayDuration={0}>
        <ChangesPanel {...props} turnActive />
      </TooltipProvider>
    )
    const confirm = screen.getByRole('button', { name: 'Discard 2 files' })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(discardFiles).not.toHaveBeenCalled()
  })

  it('shows a spinner and "Discarding…" with both buttons disabled while it runs', async () => {
    let finish: () => void = () => {}
    discardFiles.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    renderPanel()
    fireEvent.click(discardAll())
    fireEvent.click(screen.getByRole('button', { name: 'Discard 2 files' }))
    const running = await screen.findByRole('button', { name: /Discarding…/ })
    expect(running).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(running.querySelector('.tm-comet')).not.toBeNull()
    await act(async () => finish())
    expect(screen.queryByText(/Discarding…/)).toBeNull()
  })

  it('a failure shows the error state with the real message and no confirm', async () => {
    discardFiles.mockRejectedValue(new Error('index.lock exists'))
    renderPanel()
    fireEvent.click(discardAll())
    fireEvent.click(screen.getByRole('button', { name: 'Discard 2 files' }))
    expect(await screen.findByText('Could not read Git status.')).toBeInTheDocument()
    expect(screen.getByText('index.lock exists')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('index.lock exists')
    expect(screen.queryByText(/Discard changes in/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refreshStatus).toHaveBeenCalledWith(CWD)
  })

  it('shows the empty state once the files are gone', async () => {
    const { rerender, props } = renderPanel()
    fireEvent.click(discardAll())
    fireEvent.click(screen.getByRole('button', { name: 'Discard 2 files' }))
    await waitFor(() => expect(discardFiles).toHaveBeenCalled())
    rerender(
      <TooltipProvider delayDuration={0}>
        <ChangesPanel {...props} changes={changes([])} />
      </TooltipProvider>
    )
    expect(screen.getByText('No uncommitted changes from this chat')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard all' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open in Git' })).toBeInTheDocument()
  })

  it('is disabled with a tooltip while a turn is active', async () => {
    renderPanel({ turnActive: true })
    const button = discardAll()
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(screen.queryByText(/Discard changes in/)).toBeNull()
    fireEvent.focus(button.parentElement as HTMLElement)
    expect(await screen.findAllByText('Stop the turn to discard')).not.toHaveLength(0)
  })

  it('is hidden when the server is read-only', () => {
    admits.value = false
    renderPanel()
    expect(screen.queryByRole('button', { name: 'Discard all' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open in Git' })).toBeInTheDocument()
  })

  it('is hidden for the session source', () => {
    renderPanel({ changes: changes([file('a.ts')], 'session') })
    expect(screen.queryByRole('button', { name: 'Discard all' })).toBeNull()
  })

  it('Open in Git calls onOpenGit', () => {
    const { props } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Open in Git' }))
    expect(props.onOpenGit).toHaveBeenCalledTimes(1)
  })
})

describe('ChangesPanel states', () => {
  it('empty: a line and only "Open in Git"', () => {
    renderPanel({ changes: changes([]) })
    expect(screen.getByText('No uncommitted changes from this chat')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open in Git' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard all' })).toBeNull()
  })

  it('empty without onOpenGit has no footer', () => {
    renderPanel({ changes: changes([]), onOpenGit: undefined })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('error: the failure text and "Try again", which reads status again', () => {
    useGitStatusStore.setState((state) => ({
      errors: { ...state.errors, [normalizePath(CWD)]: { status: 'fatal: bad object HEAD' } }
    }))
    renderPanel()
    expect(screen.getByText('Could not read Git status.')).toHaveClass('text-destructive')
    expect(screen.getByText('fatal: bad object HEAD')).toBeInTheDocument()
    expect(screen.queryByText(/This chat ·/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Discard all' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refreshStatus).toHaveBeenCalledWith(CWD)
  })

  it('a session source never shows the Git error', () => {
    useGitStatusStore.setState((state) => ({
      errors: { ...state.errors, [normalizePath(CWD)]: { status: 'not a git repository' } }
    }))
    renderPanel({ changes: changes([file('a.ts')], 'session') })
    expect(screen.queryByText('Could not read Git status.')).toBeNull()
  })

  describe('loading', () => {
    beforeEach(() => {
      useGitStatusStore.setState({ statuses: {} })
      vi.useFakeTimers()
    })

    it('shows nothing under 400ms, then 4 skeleton rows and no footer', () => {
      renderPanel({ changes: changes([]) })
      expect(screen.queryByLabelText('Loading changes')).toBeNull()
      act(() => void vi.advanceTimersByTime(399))
      expect(screen.queryByLabelText('Loading changes')).toBeNull()
      act(() => void vi.advanceTimersByTime(1))
      const skeleton = screen.getByLabelText('Loading changes')
      expect(skeleton.children).toHaveLength(4)
      expect(screen.queryByText('No uncommitted changes from this chat')).toBeNull()
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('fades the rows in once when they replace the skeleton', () => {
      const { rerender, props, container } = renderPanel({ changes: changes([]) })
      act(() => void vi.advanceTimersByTime(400))
      rerender(
        <TooltipProvider delayDuration={0}>
          <ChangesPanel {...props} changes={changes([file('a.ts')])} />
        </TooltipProvider>
      )
      expect(screen.queryByLabelText('Loading changes')).toBeNull()
      expect(container.querySelector('.motion-safe\\:fade-in-0')).not.toBeNull()
    })

    it('rows that show at once do not fade', () => {
      const { container } = renderPanel()
      expect(container.querySelector('.motion-safe\\:fade-in-0')).toBeNull()
    })
  })
})
