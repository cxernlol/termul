import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { resetChatActivity, seedChatActivity } from '@/lib/test-utils/chat-activity'
import { useAcpStore } from '@/stores/acp-store'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { Project } from '@/types/project'
import { RailProjectChats } from './RailProjectChats'
import { RailDensityProvider } from './rail-density'

const mocks = vi.hoisted(() => ({
  addAgentChatTab: vi.fn(),
  openHistorySession: vi.fn(),
  deleteHistorySession: vi.fn(),
  logFrontendError: vi.fn(),
  paneDnd: {
    startChatDrag: vi.fn(),
    dragPayload: null as { type: 'chat'; sessionId: string } | null
  }
}))

vi.mock('@/lib/log-api', () => ({ logFrontendError: mocks.logFrontendError }))
vi.mock('@/hooks/use-pane-dnd', () => ({ usePaneDnd: () => mocks.paneDnd }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const project = {
  id: 'p1',
  name: 'Alpha',
  path: '/repo',
  color: 'blue',
  gitBranch: 'main',
  isGitRepo: true
} as Project

const entry = (id: string, lastActivityAt: number) =>
  mockSessionIndexEntry({
    id,
    title: `Chat ${id}`,
    cwd: '/repo',
    projectId: 'p1',
    status: 'active',
    lastActivityAt
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.paneDnd.dragPayload = null
  mocks.openHistorySession.mockResolvedValue(undefined)
  mocks.deleteHistorySession.mockResolvedValue(undefined)
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ status: 'ready' })
  resetChatActivity()
  useAcpStore.setState({
    sessionIndex: [],
    sessions: {},
    agentConfigs: [],
    openHistorySession: mocks.openHistorySession,
    deleteHistorySession: mocks.deleteHistorySession
  })
  useWorkspaceStore.setState({
    activePaneId: 'pane-1',
    addAgentChatTab: mocks.addAgentChatTab,
    root: { type: 'leaf', id: 'pane-1', tabs: [], activeTabId: null }
  } as never)
})

const list = () => screen.getByRole('list', { name: 'Chats in Alpha' })
const rows = () =>
  within(list())
    .getAllByRole('button')
    .filter((button) => !button.getAttribute('aria-label')?.startsWith('More actions'))

describe('RailProjectChats', () => {
  it('renders nothing without chats', () => {
    const { container } = render(<RailProjectChats project={project} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the newest five chats, then Show N more', () => {
    useAcpStore.setState({
      sessionIndex: Array.from({ length: 7 }, (_, i) => entry(`c${i}`, i)).concat(
        mockSessionIndexEntry({ id: 'other', projectId: 'p2', title: 'Other' })
      )
    })
    render(<RailProjectChats project={project} />)
    expect(rows().map((row) => row.getAttribute('title'))).toEqual([
      'Chat c6',
      'Chat c5',
      'Chat c4',
      'Chat c3',
      'Chat c2'
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(rows()).toHaveLength(7)
  })

  it('collapses the list on a 0fr grid row (inert, faded), and opens it again', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    useShellLayoutStore.getState().setProjectChatsHidden('p1', true)
    const { container, rerender } = render(<RailProjectChats project={project} />)
    const collapse = container.querySelector('[data-rail-chats-collapse]')
    expect(collapse).toHaveAttribute('data-rail-chats-collapse', 'closed')
    expect(collapse).toHaveAttribute('inert')
    expect(collapse).toHaveClass('grid-rows-[0fr]', 'duration-150', 'motion-reduce:transition-none')
    useShellLayoutStore.getState().setProjectChatsHidden('p1', false)
    rerender(<RailProjectChats project={project} />)
    expect(collapse).toHaveAttribute('data-rail-chats-collapse', 'open')
    expect(collapse).not.toHaveAttribute('inert')
    expect(collapse).toHaveClass('grid-rows-[1fr]', 'duration-200')
    expect(list()).toBeInTheDocument()
    expect(screen.getByTestId('rail-project-chats')).toHaveAttribute('id', 'rail-chats-p1')
  })

  it('does not draw a hidden list on the collapsed Rail', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    useShellLayoutStore.getState().setProjectChatsHidden('p1', true)
    render(
      <RailDensityProvider density="collapsed">
        <RailProjectChats project={project} />
      </RailDensityProvider>
    )
    expect(screen.queryByRole('list', { name: 'Chats in Alpha' })).not.toBeInTheDocument()
  })

  it('names each row with its status and shows the trail', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 2), entry('b', 1)] })
    seedChatActivity({ a: { needsYou: true } })
    render(<RailProjectChats project={project} />)
    const needsYou = screen.getByRole('button', { name: 'Chat a, Needs you' })
    expect(needsYou).toHaveTextContent('Needs you')
    expect(screen.getByRole('button', { name: 'Chat b' })).toBeInTheDocument()
  })

  it('marks the open chat with the keycap and aria-current', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 2), entry('b', 1)] })
    useWorkspaceStore.setState({
      root: {
        type: 'leaf',
        id: 'pane-1',
        tabs: [{ id: 'tab-b', type: 'agent-chat', sessionId: 'b' }],
        activeTabId: 'tab-b'
      }
    } as never)
    render(<RailProjectChats project={project} />)
    const open = screen.getByRole('button', { name: 'Chat b' })
    expect(open).toHaveAttribute('aria-current', 'true')
    expect(open).toHaveClass('keycap')
    expect(screen.getByRole('button', { name: 'Chat a' })).not.toHaveAttribute('aria-current')
  })

  it('opens the chat on click and writes one info log from the Rail', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    render(<RailProjectChats project={project} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chat a' }))
    expect(mocks.openHistorySession).toHaveBeenCalledWith('a')
    expect(mocks.addAgentChatTab).toHaveBeenCalledWith('a')
    expect(mocks.logFrontendError).toHaveBeenCalledTimes(1)
    expect(mocks.logFrontendError).toHaveBeenCalledWith({
      level: 'info',
      source: 'Rail',
      message: '[rail] open chat a'
    })
  })

  it('drags a row into a pane with the chat payload and logs it from the Rail', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    render(<RailProjectChats project={project} />)
    const row = screen.getByRole('button', { name: 'Chat a' })
    expect(row).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(row)
    expect(mocks.paneDnd.startChatDrag).toHaveBeenCalledTimes(1)
    expect(mocks.paneDnd.startChatDrag).toHaveBeenCalledWith('a', expect.anything())
    expect(mocks.logFrontendError).toHaveBeenCalledWith({
      level: 'info',
      source: 'Rail',
      message: '[rail] drag chat a'
    })
    expect(mocks.openHistorySession).not.toHaveBeenCalled()
  })

  it('does not open on the click right after a drag ends, then opens on the next click', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    render(<RailProjectChats project={project} />)
    const row = screen.getByRole('button', { name: 'Chat a' })
    fireEvent.dragStart(row)
    fireEvent.dragEnd(row)
    fireEvent.click(row)
    expect(mocks.openHistorySession).not.toHaveBeenCalled()
    expect(mocks.addAgentChatTab).not.toHaveBeenCalled()
    fireEvent.click(row)
    expect(mocks.openHistorySession).toHaveBeenCalledWith('a')
  })

  it('dims the dragged row like a dragged tab, scale off with reduced motion', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 2), entry('b', 1)] })
    mocks.paneDnd.dragPayload = { type: 'chat', sessionId: 'b' }
    render(<RailProjectChats project={project} />)
    const dragged = screen.getByRole('button', { name: 'Chat b' })
    expect(dragged).toHaveAttribute('data-dragging')
    expect(dragged).toHaveClass('opacity-50', 'scale-[0.98]', 'motion-reduce:scale-100')
    const other = screen.getByRole('button', { name: 'Chat a' })
    expect(other).not.toHaveAttribute('data-dragging')
    expect(other).not.toHaveClass('opacity-50')
  })
})

describe('RailProjectChats row menu', () => {
  it('opens the Paper chat row menu on right-click', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    render(<RailProjectChats project={project} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Chat a' }))
    const menu = await screen.findByTestId('rail-chat-menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.trim())
    ).toEqual([
      'Reload this chat',
      'Open in split',
      'Open terminal here',
      'Open in file explorer',
      'Copy path',
      'Copy chat reference',
      'Copy chat ID',
      'Delete chat'
    ])
  })

  it('opens the same menu from the row "…" button, which sits in place of the trail', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    render(<RailProjectChats project={project} />)
    const more = screen.getByRole('button', { name: 'More actions for Chat a' })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    expect(more).toHaveClass('opacity-0', 'group-hover/rail-chat:opacity-100')
    fireEvent.click(more)
    const menu = await screen.findByTestId('rail-chat-menu')
    expect(within(menu).getByRole('menuitem', { name: 'Delete chat' })).toBeInTheDocument()
    expect(mocks.openHistorySession).not.toHaveBeenCalled()
  })

  it('opens the menu with Shift+F10 on the row', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    render(<RailProjectChats project={project} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Chat a' }), {
      key: 'F10',
      shiftKey: true
    })
    expect(await screen.findByTestId('rail-chat-menu')).toBeInTheDocument()
  })

  it('disables the folder items for a chat with no cwd', async () => {
    useAcpStore.setState({ sessionIndex: [{ ...entry('a', 1), cwd: undefined } as never] })
    render(<RailProjectChats project={project} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Chat a' }))
    const menu = await screen.findByTestId('rail-chat-menu')
    for (const name of ['Open terminal here', 'Open in file explorer', 'Copy path']) {
      expect(within(menu).getByRole('menuitem', { name })).toHaveAttribute('data-disabled')
    }
  })

  it('deletes the chat only after the confirm, and logs it from the Rail', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    render(<RailProjectChats project={project} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Chat a' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete chat' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Delete “Chat a”? This action cannot be undone.')
    expect(mocks.deleteHistorySession).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mocks.deleteHistorySession).toHaveBeenCalledWith('a'))
    expect(mocks.logFrontendError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('delete chat a') })
    )
  })

  it('keeps the chat when the confirm is cancelled', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    render(<RailProjectChats project={project} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Chat a' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete chat' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' })
    )
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mocks.deleteHistorySession).not.toHaveBeenCalled()
  })
})

describe('RailProjectChats on the collapsed Rail', () => {
  const renderCollapsed = () =>
    render(
      <RailDensityProvider density="collapsed">
        <RailProjectChats project={project} />
      </RailDensityProvider>
    )
  const peek = () => screen.findByTestId('rail-chat-peek')

  it('draws one agent icon per chat at the same 30px row, no title and no trail', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 2), entry('b', 1)] })
    seedChatActivity({ a: { needsYou: true } })
    renderCollapsed()
    const row = screen.getByRole('button', { name: 'Chat a, Needs you' })
    expect(row).toHaveClass('h-7.5', 'justify-center')
    expect(row).not.toHaveClass('pl-8.75')
    expect(row).toHaveTextContent('')
    expect(row).not.toHaveAttribute('title')
    expect(screen.queryByRole('button', { name: /^More actions/ })).not.toBeInTheDocument()
  })

  it('maps each live state to a status dot on the icon', () => {
    useAcpStore.setState({
      sessionIndex: [entry('n', 4), entry('r', 3), entry('d', 2), entry('i', 1)]
    })
    seedChatActivity({ n: { needsYou: true }, r: { busy: true }, d: { unread: true } })
    renderCollapsed()
    const dot = (name: string) =>
      screen.getByRole('button', { name }).querySelector('[data-rail-chat-status]')
    expect(dot('Chat n, Needs you')).toHaveClass('bg-warning', 'size-1.5', 'rounded-full')
    expect(dot('Chat r, Running')).toHaveClass('bg-primary')
    expect(dot('Chat d, New activity')).toHaveClass('bg-foreground')
    expect(dot('Chat i')).toBeNull()
  })

  it('reads "···" for Show N more, with the words in its name', () => {
    useAcpStore.setState({ sessionIndex: Array.from({ length: 7 }, (_, i) => entry(`c${i}`, i)) })
    renderCollapsed()
    const more = screen.getByRole('button', { name: 'Show 2 more chats' })
    expect(more).toHaveTextContent('···')
    expect(more).toHaveClass('h-7', 'justify-center')
    fireEvent.click(more)
    expect(rows().filter((row) => row.getAttribute('aria-label')?.startsWith('Chat'))).toHaveLength(
      7
    )
  })

  it('opens the chat peek on hover: the project row and the chat rows, hovered row filled', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 2), entry('b', 1)] })
    renderCollapsed()
    const railRow = screen.getByRole('button', { name: 'Chat b' })
    fireEvent.pointerEnter(railRow)
    const panel = await peek()
    expect(panel).toHaveClass('w-60', 'rounded-[10px]', 'p-1', 'gap-px', 'outline-popover-edge')
    expect(panel).toHaveTextContent('Alpha')
    const peekRows = within(panel)
      .getAllByRole('button')
      .filter((button) => !button.getAttribute('aria-label')?.startsWith('More actions'))
    expect(peekRows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Chat a'),
      expect.stringContaining('Chat b')
    ])
    expect(within(panel).getByRole('button', { name: 'Chat b' })).toHaveAttribute(
      'data-highlighted'
    )
    expect(within(panel).getByRole('button', { name: 'Chat a' })).not.toHaveAttribute(
      'data-highlighted'
    )
  })

  it('opens on keyboard focus and closes on Escape', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    renderCollapsed()
    fireEvent.focus(screen.getByRole('button', { name: 'Chat a' }))
    await peek()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('rail-chat-peek')).toBeNull())
  })

  it('opens the chat from the peek, logs it and closes', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 2), entry('b', 1)] })
    renderCollapsed()
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Chat a' }))
    const panel = await peek()
    fireEvent.click(within(panel).getByRole('button', { name: 'Chat b' }))
    expect(mocks.openHistorySession).toHaveBeenCalledWith('b')
    expect(mocks.logFrontendError).toHaveBeenCalledWith({
      level: 'info',
      source: 'Rail',
      message: '[rail] peek open chat b'
    })
    await waitFor(() => expect(screen.queryByTestId('rail-chat-peek')).toBeNull())
  })

  it('drags a collapsed Rail icon into a pane', () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 1)] })
    renderCollapsed()
    const row = screen.getByRole('button', { name: 'Chat a' })
    expect(row).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(row)
    expect(mocks.paneDnd.startChatDrag).toHaveBeenCalledWith('a', expect.anything())
  })

  it('hides the peek when a drag starts from it and unmounts it when the drag ends', async () => {
    useAcpStore.setState({ sessionIndex: [entry('a', 2), entry('b', 1)] })
    renderCollapsed()
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Chat a' }))
    const panel = await peek()
    const peekRow = within(panel).getByRole('button', { name: 'Chat b' })
    fireEvent.dragStart(peekRow)
    expect(mocks.paneDnd.startChatDrag).toHaveBeenCalledWith('b', expect.anything())
    expect(mocks.logFrontendError).toHaveBeenCalledWith({
      level: 'info',
      source: 'Rail',
      message: '[rail] peek drag chat b'
    })
    // Still mounted (it is the drag source) but closed and hidden.
    await waitFor(() => expect(panel).toHaveAttribute('data-state', 'closed'))
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveClass('data-[state=closed]:invisible')
    fireEvent.dragEnd(peekRow)
    await waitFor(() => expect(screen.queryByTestId('rail-chat-peek')).toBeNull())
    expect(mocks.openHistorySession).not.toHaveBeenCalled()
  })
})
