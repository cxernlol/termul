import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { QuickChatsGroup } from './QuickChatsGroup'
import { RailDensityProvider } from './rail/rail-density'

const rename = vi.hoisted(() => vi.fn())
const openHistory = vi.fn()
const deleteHistory = vi.fn()

vi.mock('@/lib/acp-api', () => ({
  acpRenameQuickChat: (...args: unknown[]) => rename(...args)
}))

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const newQuickChat = vi.hoisted(() => vi.fn())
vi.mock('@/components/chat/new-chat/open-new-chat', () => ({
  openNewQuickChat: (...args: unknown[]) => newQuickChat(...args)
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

function chat(id: string, title: string, createdAt: number, kind?: 'quick') {
  return mockSessionIndexEntry({
    id,
    title,
    createdAt,
    projectId: kind === 'quick' ? '__unassigned__' : 'p1',
    cwd: kind === 'quick' ? `/home/me/.troupe/quick-chats/${id}` : '/work',
    kind
  })
}

function renderGroup(density: 'expanded' | 'collapsed' = 'expanded'): void {
  render(
    <TooltipProvider>
      <RailDensityProvider density={density}>
        <QuickChatsGroup />
      </RailDensityProvider>
    </TooltipProvider>
  )
}

describe('QuickChatsGroup', () => {
  beforeEach(() => {
    rename.mockReset()
    rename.mockResolvedValue(undefined)
    openHistory.mockReset()
    openHistory.mockResolvedValue(undefined)
    deleteHistory.mockReset()
    newQuickChat.mockReset()
    toastError.mockReset()
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useAcpStore.setState({
      sessionIndex: [
        chat('old', 'Older notes', 10, 'quick'),
        chat('new', 'Newer notes', 20, 'quick'),
        chat('legacy', 'Legacy unassigned', 30)
      ],
      openHistorySession: openHistory,
      deleteHistorySession: deleteHistory
    })
  })

  it('marks the open quick chat as the active row', () => {
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'new' } })
    renderGroup()
    const openRow = screen.getByRole('button', { name: 'Newer notes' })
    expect(openRow).toHaveAttribute('aria-current', 'true')
    expect(openRow).toHaveClass('keycap', 'px-3')
    expect(openRow).not.toHaveClass('pl-8.75')
    expect(openRow.querySelector('[data-rail-icon-column]')).toHaveClass('size-4')
    expect(openRow.querySelector('[data-rail-icon-column]')).toHaveAttribute('aria-hidden', 'true')
    expect(openRow.querySelector('[data-termul-icon="Chat"]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Older notes' })).not.toHaveAttribute('aria-current')
  })

  it('lists quick chats newest first and hides legacy unassigned sessions', () => {
    renderGroup()
    const titles = screen
      .getAllByRole('button', { name: /^(Newer|Older) notes$/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(titles).toEqual(['Newer notes', 'Older notes'])
    expect(screen.queryByText('Legacy unassigned')).not.toBeInTheDocument()
    expect(screen.getByTestId('rail-section-quick chats')).toBeInTheDocument()
  })

  it('keeps the header and its + when there are no quick chats', () => {
    useAcpStore.setState({ sessionIndex: [chat('legacy', 'Legacy unassigned', 30)] })
    renderGroup()
    expect(screen.getByTestId('quick-chats-group')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Quick chats' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New quick chat' }))
    expect(newQuickChat).toHaveBeenCalledWith('quick-chats-header')
  })

  it('hides an empty section on the collapsed rail, which has no header button', () => {
    useAcpStore.setState({ sessionIndex: [chat('legacy', 'Legacy unassigned', 30)] })
    renderGroup('collapsed')
    expect(screen.queryByTestId('quick-chats-group')).not.toBeInTheDocument()
  })

  it('opens a quick chat in the quick view and on its chat route', () => {
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'Newer notes' }))
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'chat', sessionId: 'new' })
    expect(openHistory).toHaveBeenCalledWith('new')
  })

  it('tells the user when the chat cannot open', async () => {
    openHistory.mockRejectedValue(new Error('gone'))
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'Newer notes' }))
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Could not open that chat. Try again.')
    )
  })

  it('fades a long title instead of truncating it', () => {
    const title = 'A very long quick chat title that must fade at the end of the row'
    useAcpStore.setState({
      sessionIndex: [chat('long', title, 20, 'quick')]
    })
    renderGroup()
    expect(screen.getByText(title)).toHaveClass('fade-end')
  })

  it('shows five chats, then the rest behind Show N more', () => {
    useAcpStore.setState({
      sessionIndex: Array.from({ length: 7 }, (_, index) =>
        chat(`q${index}`, `Chat ${index}`, index, 'quick')
      )
    })
    renderGroup()
    expect(screen.getByRole('button', { name: 'Chat 6' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chat 0' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(screen.getByRole('button', { name: 'Chat 0' })).toBeInTheDocument()
  })

  it('renames a quick chat through the row menu', async () => {
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Newer notes' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Rename Newer notes' })
    fireEvent.change(input, { target: { value: 'Renamed chat' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(rename).toHaveBeenCalledWith('new', 'Renamed chat')
    // The new title shows before the host replies.
    expect(useAcpStore.getState().sessionIndex.find((entry) => entry.id === 'new')?.title).toBe(
      'Renamed chat'
    )
  })

  it('puts the old title back and tells the user when a rename fails', async () => {
    rename.mockRejectedValue(new Error('disk full'))
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Newer notes' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByRole('textbox', { name: 'Rename Newer notes' })
    fireEvent.change(input, { target: { value: 'Renamed chat' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Could not rename the chat. Try again.')
    )
    expect(useAcpStore.getState().sessionIndex.find((entry) => entry.id === 'new')?.title).toBe(
      'Newer notes'
    )
  })

  it('opens the same row menu from the right-click path', async () => {
    renderGroup()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Newer notes' }))
    const menu = await screen.findByTestId('rail-chat-menu')
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete chat' })).toBeInTheDocument()
    // No project pane: the pane items are not offered.
    expect(within(menu).queryByRole('menuitem', { name: 'Open in split' })).not.toBeInTheDocument()
    expect(
      within(menu).queryByRole('menuitem', { name: 'Open terminal here' })
    ).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Copy path' })).toBeInTheDocument()
  })

  it('warns that delete removes the chat folder, then deletes the session', async () => {
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Newer notes' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete chat' }))
    expect(
      screen.getByText(/Files the agent created in this chat’s folder are deleted too/)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteHistory).toHaveBeenCalledWith('new')
  })

  it('keeps the chat icons on the collapsed rail and hides the labels', () => {
    renderGroup('collapsed')
    expect(screen.getByRole('button', { name: 'Newer notes' })).toHaveClass('justify-center')
    expect(screen.queryByText('Newer notes')).not.toBeInTheDocument()
    expect(
      screen.getByTestId('rail-section-quick chats').querySelector('[data-rail-section-divider]')
    ).toBeTruthy()
  })
})
