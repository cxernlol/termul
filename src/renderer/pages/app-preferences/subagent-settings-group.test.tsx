import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubagentSettingsView } from '@/lib/acp-api'
import { SubagentSettingsGroup } from './subagent-settings-group'

const { getSettings, setSettings, toastError, logFrontendError } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  toastError: vi.fn(),
  logFrontendError: vi.fn()
}))

vi.mock('@/lib/api', () => ({
  acpApi: {
    getSubagentSettings: getSettings,
    setSubagentSettings: setSettings
  }
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))
vi.mock('@/stores/acp-store', () => ({
  useAgentTemplateId: vi.fn(() => 'codex-acp'),
  useAgentIcon: vi.fn(() => null)
}))

const VIEW: SubagentSettingsView = {
  enabled: true,
  maxRunning: 4,
  maxDepth: 2,
  agents: [
    { agentId: 'acp-registry:claude-acp', name: 'Claude Code', allowed: true },
    { agentId: 'acp-registry:codex-acp', name: 'Codex', allowed: true },
    { agentId: 'acp-registry:opencode', name: 'OpenCode', allowed: false }
  ]
}

const view = (overrides: Partial<SubagentSettingsView> = {}): SubagentSettingsView => ({
  ...VIEW,
  ...overrides
})

describe('SubagentSettingsGroup', () => {
  beforeEach(() => {
    getSettings.mockReset().mockResolvedValue(view())
    setSettings
      .mockReset()
      .mockImplementation(async (input: Record<string, unknown>) => view(input))
    toastError.mockReset()
    logFrontendError.mockClear()
  })

  it('renders the enable switch, the caps and the per-agent allow list from the view', async () => {
    render(<SubagentSettingsGroup />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Let agents start other agents' })).toHaveAttribute(
        'data-state',
        'checked'
      )
    )
    expect(screen.getByText('4')).toBeVisible()
    expect(screen.getByText('2')).toBeVisible()
    for (const agent of VIEW.agents) {
      expect(screen.getByRole('switch', { name: agent.name })).toBeInTheDocument()
    }
    expect(
      screen.getByRole('switch', { name: 'Let agents start other agents' })
    ).toHaveAccessibleDescription()
    expect(screen.getByText(/Only agents installed on this machine are listed/)).toBeVisible()
  })

  it('writes through the host and applies the view it answers with', async () => {
    setSettings.mockResolvedValueOnce(view({ enabled: false }))
    render(<SubagentSettingsGroup />)
    await waitFor(() => screen.getByRole('switch', { name: 'Codex' }))

    fireEvent.click(screen.getByRole('switch', { name: 'Let agents start other agents' }))
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ enabled: false }))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Let agents start other agents' })).toHaveAttribute(
        'data-state',
        'unchecked'
      )
    )
  })

  it('steps the caps within their bounds and sends only the changed field', async () => {
    setSettings.mockResolvedValueOnce(view({ maxRunning: 5 }))
    render(<SubagentSettingsGroup />)
    await waitFor(() => screen.getByRole('button', { name: 'More running sub-agents' }))

    fireEvent.click(screen.getByRole('button', { name: 'More running sub-agents' }))
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ maxRunning: 5 }))

    fireEvent.click(screen.getByRole('button', { name: 'More depth' }))
    await waitFor(() => expect(setSettings).toHaveBeenCalledWith({ maxDepth: 3 }))
  })

  it('toggles one agent without touching the others', async () => {
    setSettings.mockResolvedValueOnce(
      view({
        agents: VIEW.agents.map((a) =>
          a.agentId === 'acp-registry:opencode' ? { ...a, allowed: true } : a
        )
      })
    )
    render(<SubagentSettingsGroup />)
    await waitFor(() => screen.getByRole('switch', { name: 'OpenCode' }))

    fireEvent.click(screen.getByRole('switch', { name: 'OpenCode' }))
    await waitFor(() =>
      expect(setSettings).toHaveBeenCalledWith({
        agents: [{ agentId: 'acp-registry:opencode', allowed: true }]
      })
    )
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'OpenCode' })).toHaveAttribute(
        'data-state',
        'checked'
      )
    )
  })

  it('shows one notice when the settings cannot be read, and keeps chats working', async () => {
    getSettings.mockRejectedValueOnce(new Error('unsupported'))
    render(<SubagentSettingsGroup />)

    await waitFor(() =>
      expect(
        screen.getByText('Could not read the sub-agent settings. Agent chats keep working.')
      ).toBeVisible()
    )
    expect(logFrontendError).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', source: 'SubagentSettingsGroup' })
    )
  })

  it('keeps the current view and toasts when a write is refused', async () => {
    setSettings.mockRejectedValueOnce(new Error('invalid_input'))
    render(<SubagentSettingsGroup />)
    await waitFor(() => screen.getByRole('switch', { name: 'Codex' }))

    fireEvent.click(screen.getByRole('switch', { name: 'Codex' }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(screen.getByRole('switch', { name: 'Codex' })).toHaveAttribute('data-state', 'checked')
  })
})
