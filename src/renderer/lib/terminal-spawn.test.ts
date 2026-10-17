/**
 * Unit tests for spawnTerminalInPane shared spawn logic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoist mocks so they're available when vi.mock factories run
const {
  mockAddTerminal,
  mockSetTerminalPtyId,
  mockSetTerminalClaim,
  mockAddTabToPane,
  mockTerminalApiSpawn,
  mockTerminals,
  mockSetWorktreePick,
  mockActivePaneId,
  mockLogFrontendError,
  mockProjectEnv,
  mockProjectShell,
  mockAppShell
} = vi.hoisted(() => ({
  mockAddTerminal: vi.fn(),
  mockSetTerminalPtyId: vi.fn(),
  mockSetTerminalClaim: vi.fn(),
  mockAddTabToPane: vi.fn(),
  mockTerminalApiSpawn: vi.fn(),
  mockTerminals: [] as Array<{ projectId: string }>,
  mockSetWorktreePick: vi.fn(),
  // Mutable so the no-pane branch can be exercised without re-registering the
  // workspace-store mock. Defaults to an active pane so existing tests pass.
  mockActivePaneId: { current: 'pane-1' as string | null },
  mockLogFrontendError: vi.fn(),
  mockProjectEnv: { current: {} as Record<string, string> },
  mockProjectShell: { current: 'bash' as string | undefined },
  mockAppShell: { current: '' }
}))

vi.mock('@/stores/terminal-store', () => ({
  useTerminalStore: {
    getState: () => ({
      terminals: mockTerminals,
      addTerminal: mockAddTerminal,
      setTerminalPtyId: mockSetTerminalPtyId,
      setTerminalClaim: mockSetTerminalClaim
    })
  }
}))

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: {
    getState: () => ({
      activePaneId: mockActivePaneId.current,
      addTabToPane: mockAddTabToPane
    })
  }
}))

vi.mock('@/stores/project-store', () => ({
  useProjectStore: {
    getState: () => ({
      projects: [
        {
          id: 'proj-1',
          name: 'Test',
          path: '/test',
          defaultShell: mockProjectShell.current,
          envVars: []
        }
      ]
    })
  }
}))

vi.mock('@/stores/app-settings-store', () => ({
  useAppSettingsStore: {
    getState: () => ({ settings: { defaultShell: mockAppShell.current } })
  }
}))

// Spawning a terminal must never move the Workspace-switcher pick.
vi.mock('@/stores/shell-layout-store', () => ({
  useShellLayoutStore: {
    getState: () => ({ worktreePickByProject: {}, setWorktreePick: mockSetWorktreePick })
  }
}))

vi.mock('@/lib/log-api', () => ({
  logFrontendError: mockLogFrontendError
}))

vi.mock('@/lib/api', () => ({
  terminalApi: {
    spawn: mockTerminalApiSpawn
  }
}))

vi.mock('@/lib/env-parser', () => ({
  resolveEnvForSpawn: () => ({
    env: { ...mockProjectEnv.current },
    hasProjectEnv: Object.keys(mockProjectEnv.current).length > 0
  })
}))

import {
  openTerminalAtCwd,
  openTerminalFromProfile,
  spawnTerminalInPane
} from '@/lib/terminal-spawn'
import { mockSpawnedTerminal } from '@/lib/test-utils/terminal'

describe('spawnTerminalInPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTerminals.length = 0
    mockActivePaneId.current = 'pane-1'
    mockAddTerminal.mockReturnValue({ id: 'term-new-1' })
    // CAP-3: spawn is the only claim issuance path — the fixture carries the
    // issued lease credential alongside the terminal info.
    mockTerminalApiSpawn.mockResolvedValue({
      success: true,
      data: mockSpawnedTerminal({ cwd: '/test/worktree' })
    })
  })

  it('spawns a terminal in the specified pane with full cycle', async () => {
    const result = await spawnTerminalInPane('pane-1', 'proj-1', '/test/worktree')

    expect(result.success).toBe(true)
    expect(result.terminalId).toBe('term-new-1')
    expect(mockTerminalApiSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/test/worktree' })
    )
    expect(mockAddTerminal).toHaveBeenCalled()
    expect(mockSetTerminalPtyId).toHaveBeenCalledWith('term-new-1', 'pty-1')
    // CAP-3: the issued claim is stored on the terminal record via the
    // spawned pty id.
    expect(mockSetTerminalClaim).toHaveBeenCalledWith('pty-1', 'claim-pty-1')
    expect(mockAddTabToPane).toHaveBeenCalledWith('pane-1', {
      type: 'terminal',
      id: 'term-term-new-1',
      terminalId: 'term-new-1'
    })
  })

  it('does not store a claim when the spawn response omits one', async () => {
    mockTerminalApiSpawn.mockResolvedValue({
      success: true,
      data: { id: 'pty-no-claim', shell: 'bash', cwd: '/test/worktree' }
    })

    const result = await spawnTerminalInPane('pane-1', 'proj-1', '/test/worktree')

    expect(result.success).toBe(true)
    expect(mockSetTerminalPtyId).toHaveBeenCalledWith('term-new-1', 'pty-no-claim')
    expect(mockSetTerminalClaim).not.toHaveBeenCalled()
  })

  it('leaves the terminal cap to the host: a crowded store never blocks the spawn call', async () => {
    for (let i = 0; i < 40; i++) {
      mockTerminals.push({ projectId: 'proj-1' })
    }

    const result = await spawnTerminalInPane('pane-1', 'proj-1', '/test/worktree')

    expect(result.success).toBe(true)
    expect(mockTerminalApiSpawn).toHaveBeenCalledTimes(1)
  })

  it('shows the host terminal_limit refusal and records nothing', async () => {
    const hostMessage =
      'Terminal limit reached (10 per project, 30 total): this project is at its limit'
    mockTerminalApiSpawn.mockResolvedValue({
      success: false,
      error: hostMessage,
      code: 'TERMINAL_LIMIT'
    })

    const result = await spawnTerminalInPane('pane-1', 'proj-1', '/test/worktree')

    expect(result).toEqual({ success: false, error: hostMessage })
    expect(mockAddTerminal).not.toHaveBeenCalled()
    expect(mockAddTabToPane).not.toHaveBeenCalled()
  })

  it('returns error when PTY spawn fails', async () => {
    mockTerminalApiSpawn.mockResolvedValue({
      success: false,
      error: 'Shell not found'
    })

    const result = await spawnTerminalInPane('pane-1', 'proj-1', '/test/worktree')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Shell not found')
    expect(mockAddTerminal).not.toHaveBeenCalled()
    expect(mockAddTabToPane).not.toHaveBeenCalled()
  })

  it('passes explicit shell option when provided', async () => {
    await spawnTerminalInPane('pane-1', 'proj-1', '/test/worktree', {
      shell: 'zsh'
    })

    expect(mockTerminalApiSpawn).toHaveBeenCalledWith(expect.objectContaining({ shell: 'zsh' }))
  })

  it('passes projectId into the spawn payload (web server requires non-empty projectId)', async () => {
    await spawnTerminalInPane('pane-1', 'proj-1', '/test/worktree')

    expect(mockTerminalApiSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1' })
    )
  })

  it('resolves shell from project default when no explicit shell', async () => {
    await spawnTerminalInPane('pane-1', 'proj-1', '/test/worktree')

    expect(mockTerminalApiSpawn).toHaveBeenCalledWith(expect.objectContaining({ shell: 'bash' }))
  })

  it('returns error when PTY spawn returns no data with empty error', async () => {
    mockTerminalApiSpawn.mockResolvedValue({
      success: false,
      error: ''
    })

    const result = await spawnTerminalInPane('pane-1', 'proj-1', '/test')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to create terminal')
  })
})

describe('openTerminalAtCwd', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTerminals.length = 0
    mockActivePaneId.current = 'pane-1'
    mockAddTerminal.mockReturnValue({ id: 'term-new-1' })
    mockTerminalApiSpawn.mockResolvedValue({
      success: true,
      data: mockSpawnedTerminal({ cwd: '/chat/cwd' })
    })
    mockLogFrontendError.mockReset()
    mockProjectShell.current = 'bash'
    mockAppShell.current = ''
  })

  it('spawns with the App Preferences default shell when the project sets none', async () => {
    mockProjectShell.current = undefined
    mockAppShell.current = 'pwsh'

    await openTerminalAtCwd('proj-1', '/chat/cwd')

    expect(mockTerminalApiSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ shell: 'pwsh', cwd: '/chat/cwd' })
    )
    expect(mockAddTerminal).toHaveBeenCalledWith('Terminal 1', 'proj-1', 'pwsh', '/chat/cwd')
  })

  it('lets the project shell win over the App Preferences default', async () => {
    mockAppShell.current = 'pwsh'

    await openTerminalAtCwd('proj-1', '/chat/cwd')

    expect(mockTerminalApiSpawn).toHaveBeenCalledWith(expect.objectContaining({ shell: 'bash' }))
  })

  it('leaves the shell unset when neither project nor app sets one', async () => {
    mockProjectShell.current = undefined

    await openTerminalAtCwd('proj-1', '/chat/cwd')

    expect(mockTerminalApiSpawn.mock.calls[0][0].shell).toBeUndefined()
  })

  it('opens a terminal at the given cwd without touching the switcher pick', async () => {
    const result = await openTerminalAtCwd('proj-1', '/chat/cwd')

    expect(result.status).toBe('opened')
    if (result.status === 'opened') {
      expect(result.terminalId).toBe('term-new-1')
    }
    expect(mockTerminalApiSpawn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/chat/cwd', projectId: 'proj-1' })
    )
    expect(mockAddTabToPane).toHaveBeenCalledWith(
      'pane-1',
      expect.objectContaining({ type: 'terminal' })
    )
    // Opening a terminal is not a worktree switch.
    expect(mockSetWorktreePick).not.toHaveBeenCalled()
    // Successful spawns are not logged (no info level; warn-on-success is noise).
    expect(mockLogFrontendError).not.toHaveBeenCalled()
  })

  it('returns no-pane when there is no active workspace pane (warn-logged)', async () => {
    mockActivePaneId.current = null

    const result = await openTerminalAtCwd('proj-1', '/chat/cwd')

    expect(result).toEqual({ status: 'no-pane' })
    expect(mockTerminalApiSpawn).not.toHaveBeenCalled()
    expect(mockSetWorktreePick).not.toHaveBeenCalled()
    // Durable boundary log for the recoverable no-pane outcome.
    expect(mockLogFrontendError).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', source: 'terminal-spawn.openTerminalAtCwd' })
    )
  })

  it('returns spawn-failed (pick untouched) when spawn fails (error-logged)', async () => {
    mockTerminalApiSpawn.mockResolvedValue({ success: false, error: 'Shell not found' })

    const result = await openTerminalAtCwd('proj-1', '/chat/cwd')

    expect(result).toEqual({ status: 'spawn-failed', error: 'Shell not found' })
    expect(mockSetWorktreePick).not.toHaveBeenCalled()
    // Durable failure log carries the spawn error.
    expect(mockLogFrontendError).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        source: 'terminal-spawn.openTerminalAtCwd',
        message: expect.stringContaining('Shell not found')
      })
    )
  })
})

describe('openTerminalFromProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTerminals.length = 0
    mockActivePaneId.current = 'pane-1'
    mockProjectEnv.current = {}
    mockAddTerminal.mockReturnValue({ id: 'term-new-1' })
    mockTerminalApiSpawn.mockResolvedValue({
      success: true,
      data: mockSpawnedTerminal({ cwd: '/work/app' })
    })
  })

  it('runs the profile shell with its args, folder and env over the project env', async () => {
    mockProjectEnv.current = { PROJECT_ONLY: 'p', NODE_ENV: 'production' }

    const result = await openTerminalFromProfile(
      'proj-1',
      {
        id: 'p1',
        name: 'Node dev',
        shell: '/bin/zsh',
        args: ['-l', '-i'],
        cwd: '/work/app',
        env: { NODE_ENV: 'development' }
      },
      { cwd: '/active/wc', shell: 'pwsh' }
    )

    expect(result).toEqual({ status: 'opened', terminalId: 'term-new-1' })
    expect(mockTerminalApiSpawn).toHaveBeenCalledWith({
      program: '/bin/zsh',
      args: ['-l', '-i'],
      cwd: '/work/app',
      projectId: 'proj-1',
      env: { PROJECT_ONLY: 'p', NODE_ENV: 'development' }
    })
    expect(mockAddTerminal).toHaveBeenCalledWith('Node dev', 'proj-1', '/bin/zsh', '/work/app')
  })

  it('opens an argument-free profile in shell mode with the New Terminal defaults', async () => {
    await openTerminalFromProfile(
      'proj-1',
      { id: 'p2', name: 'Plain', shell: '', args: [], cwd: '', env: {} },
      { cwd: '/active/wc', shell: 'pwsh' }
    )

    expect(mockTerminalApiSpawn).toHaveBeenCalledWith({
      shell: 'pwsh',
      cwd: '/active/wc',
      projectId: 'proj-1'
    })
    expect(mockAddTerminal).toHaveBeenCalledWith('Plain', 'proj-1', 'pwsh', '/active/wc')
  })
})
