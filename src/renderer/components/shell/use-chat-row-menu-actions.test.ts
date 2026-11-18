import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectChatEntry } from '@/components/sidebar/project-chat-row'
import { useProjectStore } from '@/stores/project-store'
import { useChatRowMenuActions } from './use-chat-row-menu-actions'

const mocks = vi.hoisted(() => ({
  openTerminalAtCwd: vi.fn(),
  openProjectThen: vi.fn(),
  openAgentChatPlaced: vi.fn(),
  logFrontendError: vi.fn()
}))

vi.mock('@/lib/terminal-spawn', () => ({ openTerminalAtCwd: mocks.openTerminalAtCwd }))
vi.mock('@/lib/open-agent-chat', () => ({
  openProjectThen: mocks.openProjectThen,
  openAgentChatPlaced: mocks.openAgentChatPlaced
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: mocks.logFrontendError }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const entry = { id: 'chat-b', title: 'Chat b', cwd: '/repo/beta' } as ProjectChatEntry

beforeEach(() => {
  vi.clearAllMocks()
  mocks.openTerminalAtCwd.mockResolvedValue({ status: 'opened' })
  useProjectStore.setState({ activeProjectId: 'alpha' })
})

describe('useChatRowMenuActions onOpenTerminal', () => {
  it('opens the terminal at the chat folder in the open project', async () => {
    const { result } = renderHook(() => useChatRowMenuActions('alpha'))
    await act(() => result.current.onOpenTerminal(entry))
    expect(mocks.openTerminalAtCwd).toHaveBeenCalledWith('alpha', '/repo/beta')
    expect(mocks.openProjectThen).not.toHaveBeenCalled()
  })

  it("switches to another project's chat first and spawns once that project is on screen", async () => {
    const { result } = renderHook(() => useChatRowMenuActions('beta'))
    await act(() => result.current.onOpenTerminal(entry))
    // Nothing spawns into Alpha's pane before the switch commits.
    expect(mocks.openTerminalAtCwd).not.toHaveBeenCalled()
    expect(mocks.openProjectThen).toHaveBeenCalledWith('beta', expect.any(Function))

    const afterCommit = mocks.openProjectThen.mock.calls[0][1] as () => void
    await act(async () => afterCommit())
    expect(mocks.openTerminalAtCwd).toHaveBeenCalledWith('beta', '/repo/beta')
  })
})
