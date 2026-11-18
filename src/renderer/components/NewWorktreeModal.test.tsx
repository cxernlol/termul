import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/stores/project-store'
import { NewWorktreeModal } from './NewWorktreeModal'

const mocks = vi.hoisted(() => ({ create: vi.fn(), log: vi.fn(), branches: vi.fn() }))

vi.mock('@/lib/api', () => ({
  worktreeApi: {
    branches: mocks.branches,
    create: mocks.create,
    createSymlinks: vi.fn()
  }
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: mocks.log }))
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

const initialProjects = useProjectStore.getState().projects

describe('NewWorktreeModal create failure', () => {
  beforeEach(() => {
    mocks.branches.mockResolvedValue({ success: true, data: [] })
    mocks.create.mockReset()
    mocks.log.mockReset()
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'P', color: 'blue', path: '/work', isGitRepo: true, worktrees: [] }
      ]
    } as never)
  })
  afterEach(() => {
    cleanup()
    useProjectStore.setState({ projects: initialProjects })
  })

  it('writes one durable warn log with the host error code', async () => {
    mocks.create.mockResolvedValue({
      success: false,
      error: 'A branch with that name already exists.',
      code: 'BRANCH_EXISTS'
    })
    render(<NewWorktreeModal isOpen onClose={vi.fn()} projectId="p1" />)
    fireEvent.change(screen.getByPlaceholderText('e.g. try-new-hero'), {
      target: { value: 'try-hero' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create & open' }))

    await waitFor(() => expect(mocks.log).toHaveBeenCalledTimes(1))
    expect(mocks.log).toHaveBeenCalledWith({
      level: 'warn',
      source: 'newWorktreeModal.worktreeCreate',
      message: 'worktree create failed code=BRANCH_EXISTS'
    })
  })

  it('logs a thrown create as code=UNKNOWN only and still shows the error', async () => {
    mocks.create.mockRejectedValue(new Error('secret detail /home/me/repo'))
    render(<NewWorktreeModal isOpen onClose={vi.fn()} projectId="p1" />)
    fireEvent.change(screen.getByPlaceholderText('e.g. try-new-hero'), {
      target: { value: 'try-hero' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create & open' }))

    expect(await screen.findByText('Error: secret detail /home/me/repo')).toBeTruthy()
    expect(mocks.log).toHaveBeenCalledTimes(1)
    expect(mocks.log).toHaveBeenCalledWith({
      level: 'warn',
      source: 'newWorktreeModal.worktreeCreate',
      message: 'worktree create threw code=UNKNOWN'
    })
  })
})

describe('NewWorktreeModal Enter on the branch search', () => {
  beforeEach(() => {
    mocks.branches.mockResolvedValue({
      success: true,
      data: [{ name: 'feature/x', isCurrent: false, isRemote: false }]
    })
    mocks.create.mockReset()
    mocks.create.mockResolvedValue({ success: false, error: 'stop', code: 'BRANCH_EXISTS' })
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'P', color: 'blue', path: '/work', isGitRepo: true, worktrees: [] }
      ]
    } as never)
  })
  afterEach(() => {
    cleanup()
    useProjectStore.setState({ projects: initialProjects })
  })

  it('does not create the worktree when the keyboard Search key is pressed', async () => {
    render(<NewWorktreeModal isOpen onClose={vi.fn()} projectId="p1" />)
    fireEvent.change(screen.getByPlaceholderText('e.g. try-new-hero'), {
      target: { value: 'try-hero' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Existing Branch' }))
    fireEvent.click(await screen.findByRole('button', { name: /feature\/x/ }))
    const search = screen.getByLabelText('Search branches')
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(mocks.create).not.toHaveBeenCalled()

    // Control: Enter from the name field still creates.
    fireEvent.keyDown(screen.getByPlaceholderText('e.g. try-new-hero'), { key: 'Enter' })
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  })
})
