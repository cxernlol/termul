import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WORKTREE_EVENTS } from '@/hooks/use-worktree-shortcuts'
import type { Project } from '@/types/project'
import { StatusBarTerminalButton } from './StatusBarTerminalButton'

const { wcRef, mobileRef } = vi.hoisted(() => ({
  wcRef: { current: null as unknown },
  mobileRef: { current: false }
}))

vi.mock('@/hooks/use-active-working-copy', () => ({
  useActiveWorkingCopy: () => wcRef.current
}))
vi.mock('@/hooks/use-mobile-web-shell', () => ({
  useMobileWebShell: () => mobileRef.current
}))

const project: Project = {
  id: 'p1',
  name: 'Project',
  path: '/home/user/project',
  color: 'blue'
}

function renderButton(p: Project | null = project): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <StatusBarTerminalButton project={p ?? undefined} />
    </TooltipProvider>
  )
}

describe('StatusBarTerminalButton', () => {
  afterEach(cleanup)

  beforeEach(() => {
    wcRef.current = null
    mobileRef.current = false
  })

  it('names the resolved working copy and dispatches OPEN_TERMINAL with the project id', () => {
    wcRef.current = {
      state: 'resolved',
      kind: 'worktree',
      key: '/wt/feature',
      path: '/wt/feature',
      worktreeId: 'w1'
    }
    const listener = vi.fn()
    window.addEventListener(WORKTREE_EVENTS.OPEN_TERMINAL, listener)
    renderButton()
    const button = screen.getByRole('button', { name: 'Open terminal at /wt/feature' })
    expect(button.textContent).toContain('Terminal')
    fireEvent.click(button)
    window.removeEventListener(WORKTREE_EVENTS.OPEN_TERMINAL, listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ projectId: 'p1' })
  })

  it('falls back to the project path without a resolved working copy', () => {
    renderButton()
    expect(screen.getByRole('button', { name: 'Open terminal at /home/user/project' })).toBeTruthy()
  })

  it('still dispatches for an unresolved working copy (the listener toasts)', () => {
    wcRef.current = { state: 'unresolved', kind: 'worktree', key: '/gone', path: '/gone' }
    const listener = vi.fn()
    window.addEventListener(WORKTREE_EVENTS.OPEN_TERMINAL, listener)
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: /Open terminal/ }))
    window.removeEventListener(WORKTREE_EVENTS.OPEN_TERMINAL, listener)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('renders nothing without a project', () => {
    renderButton(null)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing on the mobile web shell', () => {
    mobileRef.current = true
    renderButton()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
