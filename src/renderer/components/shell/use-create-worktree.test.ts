import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/stores/project-store'
import { useShellLayoutStore } from '@/stores/shell-layout-store'
import type { Project } from '@/types/project'
import { useCreateWorktree } from './use-create-worktree'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createSymlinks: vi.fn(),
  reconcile: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  log: vi.fn(),
  order: [] as string[]
}))

vi.mock('@/lib/worktree-api', () => ({
  worktreeApi: { create: mocks.create, createSymlinks: mocks.createSymlinks }
}))
vi.mock('@/lib/worktree-reconciler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/worktree-reconciler')>()),
  reconcileProjectWorktrees: mocks.reconcile
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: mocks.log }))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))

const NEW_PATH = '/work/.termul/worktrees/fix-login'
const initialProjects = useProjectStore.getState().projects
const originalSetPick = useShellLayoutStore.getState().setWorktreePick
const setPick = vi.fn((_projectId: string, _path: string | null) => {
  mocks.order.push('pick')
})

function seed(extra: Partial<Project> = {}): Project {
  const project = {
    id: 'p1',
    name: 'P',
    color: 'blue',
    path: '/work',
    isGitRepo: true,
    worktrees: [],
    ...extra
  } as Project
  useProjectStore.setState({ projects: [project], isWorktreeOperationLocked: false })
  return project
}

/** Make the reconciler "list" the created worktree, as the real one would. */
function reconcileLists(path = NEW_PATH): void {
  mocks.reconcile.mockImplementation(async () => {
    mocks.order.push('reconcile')
    useProjectStore.setState((s) => ({
      projects: s.projects.map((p) => ({
        ...p,
        worktrees: [
          ...(p.worktrees ?? []),
          { id: 'w-new', name: 'fix-login', branch: 'fix-login', path, createdAt: '2026-01-01' }
        ]
      }))
    }))
    return 'updated'
  })
}

describe('useCreateWorktree', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) if (typeof fn === 'function') fn.mockReset()
    mocks.order.length = 0
    setPick.mockClear()
    useShellLayoutStore.setState({ setWorktreePick: setPick })
    mocks.create.mockResolvedValue({
      success: true,
      data: { name: 'fix-login', branch: 'fix-login', path: NEW_PATH, headCommit: '' }
    })
    mocks.createSymlinks.mockResolvedValue({ success: true, data: [] })
    reconcileLists()
  })
  afterEach(() => {
    useShellLayoutStore.setState({ setWorktreePick: originalSetPick })
    useProjectStore.setState({ projects: initialProjects, isWorktreeOperationLocked: false })
  })

  it('creates the worktree, reconciles, then picks it and releases the lock', async () => {
    const project = seed({ symlinkDirs: ['node_modules'] })
    mocks.createSymlinks.mockImplementation(async () => {
      mocks.order.push('symlinks')
      return { success: true, data: [] }
    })
    const { result } = renderHook(() => useCreateWorktree(project))

    let status = ''
    await act(async () => {
      status = await result.current.create('fix-login')
    })

    expect(status).toBe('created')
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: '/work',
        name: 'fix-login',
        branch: 'fix-login',
        isNewBranch: true,
        progressId: expect.any(String)
      })
    )
    expect(mocks.createSymlinks).toHaveBeenCalledWith('/work', NEW_PATH, ['node_modules'])
    expect(setPick).toHaveBeenCalledWith('p1', NEW_PATH)
    // The pick is written only after the reconcile settled (and the symlinks ran).
    expect(mocks.order).toEqual(['reconcile', 'symlinks', 'pick'])
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Worktree created')
    expect(useProjectStore.getState().isWorktreeOperationLocked).toBe(false)
    expect(result.current.creating).toBe(false)
  })

  it('skips symlinks when the project lists none', async () => {
    const project = seed()
    const { result } = renderHook(() => useCreateWorktree(project))
    await act(async () => {
      await result.current.create('fix-login')
    })
    expect(mocks.createSymlinks).not.toHaveBeenCalled()
    expect(setPick).toHaveBeenCalledWith('p1', NEW_PATH)
  })

  it('does not pick a worktree the reconciled project does not list', async () => {
    const project = seed()
    mocks.reconcile.mockResolvedValue('failed')
    const { result } = renderHook(() => useCreateWorktree(project))
    await act(async () => {
      await result.current.create('fix-login')
    })
    expect(setPick).not.toHaveBeenCalled()
    expect(mocks.log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('fix-login')
  })

  it.each([
    [
      'a worktree with that branch already exists',
      { worktrees: [{ id: 'w', name: 'other', branch: 'fix-login', path: '/x', createdAt: '' }] },
      'A worktree for branch "fix-login" already exists'
    ],
    [
      'a worktree with that name already exists',
      { worktrees: [{ id: 'w', name: 'fix-login', branch: 'b', path: '/x', createdAt: '' }] },
      'A worktree for branch "fix-login" already exists'
    ]
  ])('refuses inline when %s', async (_name, extra, message) => {
    const project = seed(extra as Partial<Project>)
    const { result } = renderHook(() => useCreateWorktree(project))
    let status = ''
    await act(async () => {
      status = await result.current.create('fix-login')
    })
    expect(status).toBe('refused')
    expect(result.current.error).toBe(message)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(setPick).not.toHaveBeenCalled()
  })

  it('refuses when another worktree operation holds the lock', async () => {
    const project = seed()
    useProjectStore.setState({ isWorktreeOperationLocked: true })
    const { result } = renderHook(() => useCreateWorktree(project))
    await act(async () => {
      await result.current.create('fix-login')
    })
    expect(result.current.error).toBe('Another worktree operation is in progress')
    expect(mocks.create).not.toHaveBeenCalled()
    // The lock belongs to someone else: never released here.
    expect(useProjectStore.getState().isWorktreeOperationLocked).toBe(true)
  })

  it('refuses a target path over 240 characters', async () => {
    const project = seed({ path: `/work/${'a'.repeat(230)}` })
    const { result } = renderHook(() => useCreateWorktree(project))
    await act(async () => {
      await result.current.create('fix-login')
    })
    expect(result.current.error).toBe('Path too long')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('clears the inline error on request', async () => {
    const project = seed()
    useProjectStore.setState({ isWorktreeOperationLocked: true })
    const { result } = renderHook(() => useCreateWorktree(project))
    await act(async () => {
      await result.current.create('fix-login')
    })
    expect(result.current.error).not.toBeNull()
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it('toasts, logs once and never picks when the create fails', async () => {
    const project = seed()
    mocks.create.mockResolvedValue({ success: false, error: 'git said no', code: 'X' })
    const { result } = renderHook(() => useCreateWorktree(project))
    let status = ''
    await act(async () => {
      status = await result.current.create('fix-login')
    })
    expect(status).toBe('failed')
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to create worktree', {
      description: 'git said no'
    })
    expect(mocks.log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('fix-login')
    expect(mocks.reconcile).not.toHaveBeenCalled()
    expect(setPick).not.toHaveBeenCalled()
    expect(useProjectStore.getState().isWorktreeOperationLocked).toBe(false)
  })

  it('treats a thrown create as a failure and still releases the lock', async () => {
    const project = seed()
    mocks.create.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useCreateWorktree(project))
    let status = ''
    await act(async () => {
      status = await result.current.create('fix-login')
    })
    expect(status).toBe('failed')
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to create worktree', {
      description: 'boom'
    })
    expect(useProjectStore.getState().isWorktreeOperationLocked).toBe(false)
  })
})
