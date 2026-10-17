import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Tauri invoke function
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args)
}))

// `worktreeApi.create` registers the progress event listener via the real
// transport when progressId is set — stub `listen` so jsdom doesn't warn.
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {})
}))

// Desktop by default: pin isTauriContext() to true so worktreeInvoke reaches
// invoke. The web pair below flips it to false and stubs `fetch`.
const { mockIsTauriContext, mockFetch } = vi.hoisted(() => ({
  mockIsTauriContext: vi.fn(() => true),
  mockFetch: vi.fn()
}))
vi.mock('./tauri-runtime', () => ({
  isTauriContext: mockIsTauriContext
}))
vi.stubGlobal('fetch', mockFetch)

// Import after mocking
import { worktreeApi } from './worktree-api'

describe('worktreeApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsTauriContext.mockReturnValue(true)
  })

  describe('list', () => {
    it('calls invoke with worktree_list and projectPath', async () => {
      const mockResult = {
        success: true,
        data: [
          {
            name: 'main',
            branch: 'main',
            path: '/project',
            headCommit: 'abc1234'
          }
        ]
      }
      mockInvoke.mockResolvedValue(mockResult)

      const result = await worktreeApi.list('/test/project')

      expect(mockInvoke).toHaveBeenCalledWith('worktree_list', {
        projectPath: '/test/project'
      })
      expect(result).toEqual(mockResult)
    })

    it('handles error response', async () => {
      const mockError = {
        success: false,
        error: 'Not a git repository.',
        code: 'NOT_A_GIT_REPO'
      }
      mockInvoke.mockResolvedValue(mockError)

      const result = await worktreeApi.list('/not/a/repo')

      expect(result.success).toBe(false)
      expect(result.success === false && result.code).toBe('NOT_A_GIT_REPO')
    })
  })

  describe('create', () => {
    it('calls invoke with worktree_create and all params', async () => {
      const mockResult = {
        success: true,
        data: {
          name: 'feat-1',
          branch: 'feat-1',
          path: '/project/.termul/worktrees/feat-1',
          headCommit: 'def5678'
        }
      }
      mockInvoke.mockResolvedValue(mockResult)

      const result = await worktreeApi.create({
        projectPath: '/test/project',
        name: 'feat-1',
        branch: 'feat-1',
        isNewBranch: true,
        startRef: 'main'
      })

      expect(mockInvoke).toHaveBeenCalledWith('worktree_create', {
        projectPath: '/test/project',
        name: 'feat-1',
        branch: 'feat-1',
        isNewBranch: true,
        startRef: 'main',
        commandId: expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/)
      })
      expect(result.success).toBe(true)
      expect(result.success === true && result.data?.name).toBe('feat-1')
    })

    it('passes progressId through to worktree_create and strips onProgress', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: { name: 'wt' } })

      await worktreeApi.create({
        projectPath: '/test/project',
        name: 'wt',
        branch: 'chat/wt',
        isNewBranch: true,
        progressId: 'prog-1',
        onProgress: () => {}
      })

      const call = mockInvoke.mock.calls.find((c) => c[0] === 'worktree_create')
      const args = call?.[1] as Record<string, unknown>
      expect(args.progressId).toBe('prog-1')
      expect('onProgress' in args).toBe(false)
    })
  })

  describe('remove', () => {
    it('calls invoke with worktree_remove and path', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null })

      const result = await worktreeApi.remove(
        '/test/project',
        '/project/.termul/worktrees/feat-1',
        false
      )

      expect(mockInvoke).toHaveBeenCalledWith('worktree_remove', {
        projectPath: '/test/project',
        worktreePath: '/project/.termul/worktrees/feat-1',
        force: false
      })
      expect(result.success).toBe(true)
    })

    it('passes force=true when requested', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null })

      await worktreeApi.remove('/test/project', '/project/.termul/worktrees/feat-1', true)

      expect(mockInvoke).toHaveBeenCalledWith('worktree_remove', {
        projectPath: '/test/project',
        worktreePath: '/project/.termul/worktrees/feat-1',
        force: true
      })
    })
  })

  describe('branches', () => {
    it('calls invoke with worktree_branches', async () => {
      const mockResult = {
        success: true,
        data: [
          { name: 'main', isRemote: false, isCurrent: true, upstream: 'origin/main' },
          { name: 'feat-1', isRemote: false, isCurrent: false, upstream: null }
        ]
      }
      mockInvoke.mockResolvedValue(mockResult)

      const result = await worktreeApi.branches('/test/project')

      expect(mockInvoke).toHaveBeenCalledWith('worktree_branches', {
        projectPath: '/test/project'
      })
      expect(result.success === true && result.data ? result.data : []).toHaveLength(2)
    })
  })

  describe('checkDirty', () => {
    it('calls invoke with worktree_check_dirty', async () => {
      const mockResult = {
        success: true,
        data: { modified: 3, staged: 1, untracked: 2, hasChanges: true }
      }
      mockInvoke.mockResolvedValue(mockResult)

      const result = await worktreeApi.checkDirty('/project/.termul/worktrees/feat-1')

      expect(mockInvoke).toHaveBeenCalledWith('worktree_check_dirty', {
        worktreePath: '/project/.termul/worktrees/feat-1'
      })
      if (result.success) {
        expect(result.data.hasChanges).toBe(true)
        expect(result.data.modified).toBe(3)
      }
    })
  })

  describe('removeAllManaged', () => {
    it('calls invoke with worktree_remove_all_managed', async () => {
      const worktreesJson = JSON.stringify([
        {
          id: '1',
          name: 'feat-1',
          branch: 'feat-1',
          path: '/project/.termul/worktrees/feat-1',
          createdAt: '2026-01-01'
        }
      ])
      const mockResult = {
        success: true,
        data: [{ worktreePath: '/project/.termul/worktrees/feat-1', success: true, error: null }]
      }
      mockInvoke.mockResolvedValue(mockResult)

      const result = await worktreeApi.removeAllManaged('/test/project', JSON.parse(worktreesJson))

      expect(mockInvoke).toHaveBeenCalledWith('worktree_remove_all_managed', {
        projectPath: '/test/project',
        worktreesJson
      })
      if (result.success) {
        expect(result.data).toHaveLength(1)
        expect(result.data[0].success).toBe(true)
      }
    })
  })

  describe('renameBranch (shell revamp story 16)', () => {
    it('desktop: invokes worktree_rename_branch with the three args', async () => {
      mockInvoke.mockResolvedValue({ success: true, data: null })

      const result = await worktreeApi.renameBranch(
        '/project/.termul/worktrees/ab12cd34',
        'chat/ab12cd34',
        'chat/fix-login'
      )

      expect(mockInvoke).toHaveBeenCalledWith('worktree_rename_branch', {
        worktreePath: '/project/.termul/worktrees/ab12cd34',
        oldBranch: 'chat/ab12cd34',
        newBranch: 'chat/fix-login',
        commandId: expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/)
      })
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('desktop: passes host error codes through', async () => {
      const mockError = {
        success: false,
        error: 'A branch with that name already exists.',
        code: 'BRANCH_EXISTS'
      }
      mockInvoke.mockResolvedValue(mockError)

      const result = await worktreeApi.renameBranch('/wt', 'chat/a', 'chat/b')

      expect(result).toEqual(mockError)
    })

    it('web: POSTs /worktree/rename-branch (not invoke) and returns the IpcBody', async () => {
      mockIsTauriContext.mockReturnValue(false)
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: null })
      } as Response)

      const result = await worktreeApi.renameBranch(
        '/project/.termul/worktrees/ab12cd34',
        'chat/ab12cd34',
        'chat/fix-login'
      )

      expect(mockInvoke).not.toHaveBeenCalled()
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toMatch(/\/worktree\/rename-branch$/)
      expect(init.method).toBe('POST')
      expect(JSON.parse(String(init.body))).toEqual({
        worktreePath: '/project/.termul/worktrees/ab12cd34',
        oldBranch: 'chat/ab12cd34',
        newBranch: 'chat/fix-login'
      })
      expect(result.success).toBe(true)
    })

    it('web: surfaces FORBIDDEN from a read-only server', async () => {
      mockIsTauriContext.mockReturnValue(false)
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: 'This server is read-only for remote clients.',
          code: 'FORBIDDEN'
        })
      } as Response)

      const result = await worktreeApi.renameBranch('/wt', 'chat/a', 'chat/b')

      expect(result.success).toBe(false)
      if (!result.success) expect(result.code).toBe('FORBIDDEN')
    })
  })
})
