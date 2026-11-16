import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function renderGroup(): void {
  render(
    <RailDensityProvider density="expanded">
      <QuickChatsGroup />
    </RailDensityProvider>
  )
}

describe('QuickChatsGroup', () => {
  beforeEach(() => {
    rename.mockReset()
    rename.mockResolvedValue(undefined)
    openHistory.mockReset()
    deleteHistory.mockReset()
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

  it('hides the section when there are no quick chats', () => {
    useAcpStore.setState({ sessionIndex: [chat('legacy', 'Legacy unassigned', 30)] })
    renderGroup()
    expect(screen.queryByTestId('quick-chats-group')).not.toBeInTheDocument()
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
  })

  it('opens the same row menu from the right-click path', async () => {
    renderGroup()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Newer notes' }))
    const menu = await screen.findByTestId('rail-chat-menu')
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete chat' })).toBeInTheDocument()
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
    render(
      <RailDensityProvider density="collapsed">
        <QuickChatsGroup />
      </RailDensityProvider>
    )
    expect(screen.getByRole('button', { name: 'Newer notes' })).toHaveClass('justify-center')
    expect(screen.queryByText('Newer notes')).not.toBeInTheDocument()
    expect(
      screen.getByTestId('rail-section-quick chats').querySelector('[data-rail-section-divider]')
    ).toBeTruthy()
  })
})
