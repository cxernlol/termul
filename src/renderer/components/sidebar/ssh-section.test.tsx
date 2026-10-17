import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { SSHResizableSection } from './ssh-section'

// Issue #843: the SSH sidebar panel is a desktop-only surface. On web it must
// render nothing (not disabled rows), because connect/SFTP/port-forwarding
// are WEB_UNSUPPORTED there.
const { tauriRef } = vi.hoisted(() => ({ tauriRef: { current: true } }))

vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: () => tauriRef.current
}))

vi.mock('@/stores/ssh-panel-store', () => ({
  useSSHPanelVisible: () => true
}))

vi.mock('../ssh/SSHPanel', () => ({
  SSHPanel: () => <div data-testid="ssh-panel" />
}))

describe('SSHResizableSection web gating (#843)', () => {
  beforeEach(() => {
    tauriRef.current = true
  })

  it('renders the panel on desktop when visible', () => {
    const { container } = render(<SSHResizableSection />)

    expect(container.querySelector('[data-testid="ssh-panel"]')).not.toBeNull()
  })

  it('renders null on web even though the panel is toggled visible', () => {
    tauriRef.current = false

    const { container } = render(<SSHResizableSection />)
    expect(container.innerHTML).toBe('')
  })
})

describe('SSHResizableSection height (shell-layout store)', () => {
  beforeEach(() => {
    tauriRef.current = true
    resetShellLayoutStoreForTests()
    useShellLayoutStore.setState({ status: 'unavailable' })
  })

  it('reads its height from the shell-layout store', () => {
    useShellLayoutStore.setState({ sshSectionHeight: 200 })
    const { container } = render(<SSHResizableSection />)

    expect((container.firstElementChild as HTMLElement).style.height).toBe('200px')
  })

  it('writes the dragged height to the store, clamped, and never to localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    useShellLayoutStore.setState({ sshSectionHeight: 140 })
    render(<SSHResizableSection />)

    fireEvent.mouseDown(screen.getByTitle('Drag to resize'), { clientY: 500 })
    fireEvent.mouseMove(document, { clientY: 450 })
    expect(useShellLayoutStore.getState().sshSectionHeight).toBe(190)
    fireEvent.mouseMove(document, { clientY: -2000 })
    expect(useShellLayoutStore.getState().sshSectionHeight).toBe(400)
    fireEvent.mouseUp(document)

    expect(setItem).not.toHaveBeenCalledWith('termul-ssh-panel-height', expect.anything())
    setItem.mockRestore()
  })
})
