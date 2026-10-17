import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SSHResizableSection } from './ssh-section'

const { tauriRef, visibleRef, updateMock, toastError } = vi.hoisted(() => ({
  tauriRef: { current: true },
  visibleRef: { current: true },
  updateMock: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/lib/tauri-runtime', () => ({ isTauriContext: () => tauriRef.current }))
vi.mock('@/stores/ssh-panel-store', () => ({ useSSHPanelVisible: () => visibleRef.current }))
vi.mock('@/hooks/use-app-settings', () => ({ useUpdatePanelVisibility: () => updateMock }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))
vi.mock('../ssh/SSHPanel', () => ({
  SSHPanel: ({ headerLead }: { headerLead?: React.ReactNode }) => (
    <div data-testid="ssh-panel">{headerLead}</div>
  )
}))

describe('SSHResizableSection collapse', () => {
  beforeEach(() => {
    tauriRef.current = true
    visibleRef.current = true
    updateMock.mockReset()
    updateMock.mockResolvedValue(undefined)
    toastError.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('expanded: the chevron collapses and persists sshPanelVisible=false', async () => {
    render(<SSHResizableSection />)
    const chevron = screen.getByRole('button', { name: 'Collapse SSH section' })
    expect(chevron).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(chevron)
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('sshPanelVisible', false))
  })

  it('collapsed: a header-only row whose chevron expands the section', async () => {
    visibleRef.current = false
    render(<SSHResizableSection />)
    expect(screen.queryByTestId('ssh-panel')).toBeNull()
    expect(screen.getByText('SSH')).toBeInTheDocument()
    const chevron = screen.getByRole('button', { name: 'Expand SSH section' })
    expect(chevron).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(chevron)
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith('sshPanelVisible', true))
  })

  it('toasts when persisting fails', async () => {
    updateMock.mockRejectedValue(new Error('disk full'))
    render(<SSHResizableSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse SSH section' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('disk full'))
  })

  it('renders nothing on web', () => {
    tauriRef.current = false
    visibleRef.current = false
    const { container } = render(<SSHResizableSection />)
    expect(container.innerHTML).toBe('')
  })
})
