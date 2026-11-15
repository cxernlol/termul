import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStartPickStore } from '@/stores/chat-start-pick-store'
import { useProjectStore } from '@/stores/project-store'
import { ChatStartContextRow } from './ChatStartContextRow'

const { writesRef, persistComposerOptions, readComposerOptions } = vi.hoisted(() => ({
  writesRef: { current: true },
  persistComposerOptions: vi.fn(),
  readComposerOptions: vi.fn(async (): Promise<unknown> => null)
}))

// Radix Select portals do not render under jsdom: the trigger is a plain
// button with its children; items render as plain options that pick on click.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  const Pick = React.createContext<(value: string) => void>(() => {})
  return {
    Select: ({
      children,
      onValueChange
    }: {
      children: React.ReactNode
      onValueChange?: (value: string) => void
    }) => <Pick.Provider value={onValueChange ?? (() => {})}>{children}</Pick.Provider>,
    SelectTrigger: ({
      children,
      'aria-label': ariaLabel
    }: {
      children: React.ReactNode
      'aria-label'?: string
    }) => (
      <button type="button" aria-label={ariaLabel}>
        {children}
      </button>
    ),
    SelectValue: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
      disabled,
      'aria-description': description
    }: {
      children: React.ReactNode
      value: string
      disabled?: boolean
      'aria-description'?: string
    }) => {
      const pick = React.useContext(Pick)
      return (
        <button
          type="button"
          role="option"
          disabled={disabled}
          aria-description={description}
          onClick={() => pick(value)}
        >
          {children}
        </button>
      )
    }
  }
})
vi.mock('@/hooks/use-server-admits-remote-writes', () => ({
  useServerAdmitsRemoteWrites: () => writesRef.current
}))
vi.mock('@/components/chat/agent-model-selector/use-agent-switch', () => ({
  useCurrentAgentConfigId: () => 'cfg-1'
}))
vi.mock('@/stores/acp-store', () => ({ persistComposerOptions }))
vi.mock('@/stores/acp-store/composer-options', () => ({ readComposerOptions }))
vi.mock('@/lib/worktree-api', () => ({
  worktreeApi: {
    resolveBaseBranch: vi.fn(async () => ({
      success: true,
      data: { defaultBase: 'dev', currentBranch: 'main', isDetached: false }
    })),
    branches: vi.fn(async () => ({
      success: true,
      data: [
        { name: 'main', isRemote: false },
        { name: 'dev', isRemote: false }
      ]
    }))
  }
}))

const initialProjects = useProjectStore.getState().projects

function seedProject(fields: Record<string, unknown> = {}): void {
  useProjectStore.setState({
    projects: [
      {
        id: 'p1',
        name: 'Project',
        color: 'blue',
        path: '/work',
        gitBranch: 'main',
        isGitRepo: true,
        ...fields
      }
    ]
  } as never)
}

const localSession = { id: 's1', projectId: 'p1', cwd: '/work' }
const worktreeSession = {
  id: 's1',
  projectId: 'p1',
  cwd: '/work/.termul/worktrees/abcd1234',
  worktreePath: '/work/.termul/worktrees/abcd1234',
  worktreeBranch: 'chat/abcd1234'
}
const listedWorktree = (branch: string) => ({
  worktrees: [
    {
      id: 'w1',
      name: 'abcd1234',
      branch,
      path: '/work/.termul/worktrees/abcd1234',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ]
})

function row(): HTMLElement {
  return document.querySelector('[data-chat-start-context-row="true"]') as HTMLElement
}

function workspaceIcon(name: string): Element | null {
  return screen
    .getByRole('button', { name: 'Workspace' })
    .querySelector(`[data-termul-icon="${name}"]`)
}

describe('ChatStartContextRow', () => {
  beforeEach(() => {
    seedProject()
    writesRef.current = true
    persistComposerOptions.mockClear()
    readComposerOptions.mockReset()
    readComposerOptions.mockResolvedValue(null)
    useChatStartPickStore.setState({ picks: {} })
  })
  afterEach(() => {
    cleanup()
    useProjectStore.setState({ projects: initialProjects })
  })

  it('is the launcher row (Paper 2.2): plain, left-aligned, no tray', () => {
    render(<ChatStartContextRow session={localSession} />)
    expect(row()).toHaveClass('flex', 'items-center', 'gap-0.5', 'pl-0.5', 'pt-1.5')
    expect(row()).not.toHaveClass('border')
    expect(row()).not.toHaveClass('-mt-4')
  })

  it('starts at Current checkout with the project branch, and it is a picker', () => {
    render(<ChatStartContextRow session={localSession} />)
    expect(workspaceIcon('Folder')).toBeInTheDocument()
    expect(row()).toHaveTextContent('main')
    expect(screen.getByRole('option', { name: 'New worktree' })).toBeEnabled()
  })

  it('follows the project branch when it changes elsewhere (Changes header)', () => {
    render(<ChatStartContextRow session={localSession} />)
    act(() => useProjectStore.getState().updateProject('p1', { gitBranch: 'dev' }))
    expect(row()).toHaveTextContent('dev')
  })

  it('starts at Existing worktree on the worktree the chat runs in', () => {
    seedProject(listedWorktree('feat/renamed'))
    render(<ChatStartContextRow session={worktreeSession} />)
    expect(workspaceIcon('FolderGit2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Worktree' })).toBeInTheDocument()
  })

  it('records a New worktree pick from the default base and saves the preference', async () => {
    render(<ChatStartContextRow session={localSession} />)
    act(() => screen.getByRole('option', { name: 'New worktree' }).click())
    expect(useChatStartPickStore.getState().picks.s1?.isolationMode).toBe('worktree')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Base branch' })).toHaveTextContent('from dev')
    )
    expect(useChatStartPickStore.getState().picks.s1?.baseBranch).toBe('dev')
    expect(persistComposerOptions).toHaveBeenLastCalledWith('cfg-1', {
      isolationMode: 'worktree',
      baseBranch: 'dev'
    })
  })

  it('restores the saved New worktree preference for a chat in the project folder', async () => {
    readComposerOptions.mockResolvedValue({ isolationMode: 'worktree', baseBranch: 'main' })
    render(<ChatStartContextRow session={localSession} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Base branch' })).toHaveTextContent('from main')
    )
    expect(workspaceIcon('FolderPlus')).toBeInTheDocument()
  })

  it('keeps New worktree visible but disabled on a read-only server', () => {
    writesRef.current = false
    readComposerOptions.mockResolvedValue({ isolationMode: 'worktree', baseBranch: 'main' })
    render(<ChatStartContextRow session={localSession} />)
    const item = screen.getByRole('option', { name: 'New worktree' })
    expect(item).toBeDisabled()
    expect(item).toHaveAttribute('aria-description', expect.stringMatching(/read-only/i))
    expect(readComposerOptions).not.toHaveBeenCalled()
  })

  it('reads Worktree with the launch branch when the worktree is not listed', () => {
    render(<ChatStartContextRow session={worktreeSession} />)
    expect(row()).toHaveTextContent('Worktree')
    expect(row()).toHaveTextContent('chat/abcd1234')
    expect(screen.queryByRole('button', { name: 'Workspace' })).not.toBeInTheDocument()
  })

  it('has no row for a project that is not a git repo (like the launcher)', () => {
    seedProject({ isGitRepo: false, gitBranch: undefined })
    const { container } = render(<ChatStartContextRow session={localSession} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Current checkout')).not.toBeInTheDocument()
  })
})
