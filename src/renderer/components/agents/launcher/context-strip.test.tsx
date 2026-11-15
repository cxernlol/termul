import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '@/types/project'
import { LauncherContextStrip } from './context-strip'
import type { LaunchWorkspace } from './use-launch-workspace'

// Radix Select portals do not render under jsdom: the trigger renders as a
// plain button with its children, the value as its custom children.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({
    children,
    className,
    'aria-label': ariaLabel
  }: {
    children: React.ReactNode
    className?: string
    'aria-label'?: string
  }) => (
    <button type="button" aria-label={ariaLabel} className={className}>
      {children}
    </button>
  ),
  SelectValue: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  SelectContent: () => null,
  SelectItem: () => null
}))

const worktree: Worktree = {
  id: 'a',
  name: 'a',
  branch: 'feat/a',
  path: '/p/.termul/worktrees/a',
  createdAt: '2026-01-01T00:00:00.000Z'
}

function workspace(over: Partial<LaunchWorkspace> = {}): LaunchWorkspace {
  return {
    isolationMode: 'current',
    setIsolationMode: vi.fn(),
    existingWorktreeId: null,
    setExistingWorktreeId: vi.fn(),
    pickIsProjectFolder: true,
    resetWorkspace: vi.fn(),
    ...over
  }
}

function strip(
  over: Partial<LaunchWorkspace> = {},
  baseBranch: string | null = null
): React.JSX.Element {
  return (
    <LauncherContextStrip
      workspace={workspace(over)}
      worktrees={[worktree]}
      baseBranch={baseBranch}
      setBaseBranch={vi.fn()}
      baseBranchInfo={null}
      baseOptions={[]}
      interactive
      gitBranch="main"
      isGitRepo
    />
  )
}

describe('LauncherContextStrip', () => {
  afterEach(cleanup)

  it('shows the read-only branch beside the Current checkout chip', () => {
    render(strip())
    expect(screen.getByText('main')).toBeInTheDocument()
    cleanup()
    render(
      <LauncherContextStrip
        workspace={workspace()}
        worktrees={[]}
        baseBranch={null}
        setBaseBranch={vi.fn()}
        baseBranchInfo={null}
        baseOptions={[]}
        interactive
        gitBranch={null}
        isGitRepo
      />
    )
    expect(screen.getByText('Detached HEAD')).toBeInTheDocument()
  })

  it('renders nothing for a project that is not a git repo', () => {
    const { container } = render(
      <LauncherContextStrip
        workspace={workspace()}
        worktrees={[]}
        baseBranch={null}
        setBaseBranch={vi.fn()}
        baseBranchInfo={null}
        baseOptions={[]}
        interactive={false}
        gitBranch={null}
        isGitRepo={false}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('is a plain left-aligned row under the composer, not a docked tray (Paper)', () => {
    render(strip())
    const row = document.querySelector('[data-agent-launcher-context-strip="true"]')
    expect(row).toHaveClass('flex', 'items-center', 'gap-0.5', 'pl-0.5', 'pt-1.5')
    expect(row).not.toHaveClass('rounded-b-2xl')
    expect(row).not.toHaveClass('border')
    expect(row).not.toHaveClass('-mt-4')
    expect(screen.getByRole('button', { name: 'Workspace' })).toHaveClass(
      'h-6',
      'px-2',
      'text-xs',
      'font-medium',
      'text-secondary-foreground'
    )
  })

  it('shows the New worktree base as "from <branch>" with a muted "from"', () => {
    render(strip({ isolationMode: 'worktree' }, 'dev'))
    const base = screen.getByRole('button', { name: 'Base branch' })
    expect(base).toHaveTextContent('from dev')
    expect(within(base).getByText('from')).toHaveClass('text-muted-foreground')
    expect(base.querySelector('[data-termul-icon="GitBranch"]')).toBeInTheDocument()
    expect(
      screen
        .getByRole('button', { name: 'Workspace' })
        .querySelector('[data-termul-icon="FolderPlus"]')
    ).toBeInTheDocument()
  })
})
