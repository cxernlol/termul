import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from '@/stores/project-store'
import { useSettingsModalStore } from '@/stores/settings-modal-store'
import { ComposerConnectorsButton, ComposerWorktreeLabel } from './ComposerFoot'
import type { ConnectorsHost } from './connectors-menu-model'

const servers = [
  { id: 'gh', name: 'GitHub', enabled: true },
  { id: 'mobbin', name: 'mobbin', enabled: false },
  { id: 'linear', name: 'Linear', enabled: true }
]

function renderButton(
  host: ConnectorsHost,
  overrides: Partial<React.ComponentProps<typeof ComposerConnectorsButton>['connectors']> = {}
) {
  const onToggle = vi.fn()
  const onReloadChat = vi.fn()
  const onClosed = vi.fn()
  render(
    <ComposerConnectorsButton
      connectorsHost={host}
      onClosed={onClosed}
      connectors={{
        count: 2,
        servers,
        onToggle,
        probeStatus: { linear: 'authRequired' },
        onReloadChat: host === 'launcher' ? undefined : onReloadChat,
        ...overrides
      }}
    />
  )
  return { onToggle, onReloadChat, onClosed }
}

async function openConnectors(): Promise<void> {
  fireEvent.pointerDown(screen.getByRole('button', { name: /^Connectors/ }), {
    button: 0,
    ctrlKey: false
  })
  await screen.findByRole('menuitem', { name: 'Manage MCP servers' })
}

describe('ComposerConnectorsButton (Composer V2 foot row)', () => {
  beforeEach(() => {
    useSettingsModalStore.setState({ view: null, appPage: null })
  })
  afterEach(() => cleanup())

  it('shows a logo for a known server and a letter tile for the rest', () => {
    renderButton('chat-current')
    const button = screen.getByRole('button', { name: 'Connectors, 2 on' })
    expect(button.querySelector('[data-connector-logo="github"]')).not.toBeNull()
    expect(button.textContent).toBe('ConnectorsL')
    expect(button.querySelector('[data-connector-samples]')).toBeNull()
  })

  it('shows sample app logos, hidden from assistive tech, while no server is on', () => {
    renderButton('chat-current', { servers: [{ id: 'gh', name: 'GitHub', enabled: false }] })
    const button = screen.getByRole('button', { name: 'Connectors, 0 on' })
    const samples = button.querySelector('[data-connector-samples="true"]') as HTMLElement
    expect(
      Array.from(samples.querySelectorAll('[data-connector-logo]')).map((logo) =>
        logo.getAttribute('data-connector-logo')
      )
    ).toEqual(['gmail', 'github', 'notion'])
    for (const logo of samples.querySelectorAll('[data-connector-logo]')) {
      expect(logo).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('sums up the servers past the third logo', () => {
    renderButton('chat-current', {
      servers: ['A', 'B', 'C', 'D', 'E'].map((name) => ({ id: name, name, enabled: true }))
    })
    expect(screen.getByRole('button', { name: 'Connectors, 5 on' }).textContent).toBe(
      'ConnectorsABC+2'
    )
  })

  it('toggles a connector and keeps the menu open', async () => {
    const { onToggle } = renderButton('chat-current')
    await openConnectors()
    expect(screen.getByText('2 on')).toBeInTheDocument()
    const github = screen.getByRole('menuitemcheckbox', { name: 'GitHub' })
    expect(github).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemcheckbox', { name: 'mobbin' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    fireEvent.click(github)
    expect(onToggle).toHaveBeenCalledWith('gh', false)
    expect(screen.getByRole('menuitemcheckbox', { name: 'GitHub' })).toBeInTheDocument()
  })

  it('offers sign-in for a server that needs it and keeps its toggle', async () => {
    const { onToggle } = renderButton('chat-current')
    await openConnectors()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Linear' }))
    expect(onToggle).toHaveBeenCalledWith('linear', false)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign in to Linear' }))
    expect(onToggle).toHaveBeenCalledOnce()
    expect(useSettingsModalStore.getState()).toMatchObject({
      view: 'app',
      appPage: 'mcp-servers'
    })
  })

  it('asks a chat with stale servers to reload, and only then', async () => {
    const { onReloadChat } = renderButton('chat-stale')
    await openConnectors()
    expect(screen.getByText('This chat still uses the previous servers.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reload this chat' }))
    expect(onReloadChat).toHaveBeenCalledOnce()
    cleanup()

    renderButton('chat-current')
    await openConnectors()
    expect(screen.queryByText('This chat still uses the previous servers.')).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Reload this chat' })).toBeNull()
  })

  it('tells the launcher that a change applies to the next chat', async () => {
    renderButton('launcher')
    await openConnectors()
    expect(screen.getByText('Changes apply to the next chat you start.')).toBeInTheDocument()
  })

  it('shows an empty registry with a way to add one', async () => {
    renderButton('chat-current', { servers: [] })
    const button = screen.getByRole('button', { name: 'Connectors, 0 on' })
    expect(button.textContent).toBe('Connectors')
    expect(button.querySelector('[data-connector-samples]')).not.toBeNull()
    await openConnectors()
    expect(screen.getByText('No connectors yet')).toBeInTheDocument()
    expect(screen.queryByText('This chat still uses the previous servers.')).toBeNull()
  })

  it('still offers the reload when the last connector of a stale chat was removed', async () => {
    const { onReloadChat } = renderButton('chat-stale', { servers: [] })
    await openConnectors()
    expect(screen.getByText('No connectors yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reload this chat' }))
    expect(onReloadChat).toHaveBeenCalledOnce()
  })

  it('returns focus to the composer on Escape', async () => {
    const { onClosed } = renderButton('chat-current')
    await openConnectors()
    act(() => {
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    })
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledOnce())
  })
})

describe('ComposerWorktreeLabel (running chat, read-only)', () => {
  const initial = useProjectStore.getState()
  beforeEach(() => {
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'termul', path: '/w', isGitRepo: true, gitBranch: 'dev', worktrees: [] }
      ]
    } as never)
  })
  afterEach(() => {
    cleanup()
    useProjectStore.setState(initial, true)
  })

  it('reads "Current checkout · branch" when the chat runs in the project folder', () => {
    render(<ComposerWorktreeLabel session={{ projectId: 'p1', cwd: '/w' }} />)
    const label = document.querySelector('[data-composer-worktree="true"]') as HTMLElement
    expect(label).toHaveTextContent('Workspace: Current checkout · dev')
    expect(label.querySelector('.fade-end')).toHaveTextContent('Current checkout · dev')
  })

  it('reads "folder · branch" for a worktree chat', () => {
    render(
      <ComposerWorktreeLabel
        session={{
          projectId: 'p1',
          cwd: '/w/.worktrees/rail-icons',
          worktreePath: '/w/.worktrees/rail-icons',
          worktreeBranch: 'feat/rail-icons'
        }}
      />
    )
    expect(document.querySelector('.fade-end')).toHaveTextContent('rail-icons · feat/rail-icons')
  })

  it('shows nothing when the project is unknown', () => {
    const { container } = render(
      <ComposerWorktreeLabel session={{ projectId: 'nope', cwd: '/x' }} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
