import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { OlderChatsGroup } from './OlderChatsGroup'
import { RailDensityProvider } from './rail/rail-density'

const openHistory = vi.fn()
const deleteHistory = vi.fn()

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

function chat(id: string, title: string, createdAt: number, kind?: 'quick') {
  return mockSessionIndexEntry({
    id,
    title,
    createdAt,
    projectId: '__unassigned__',
    cwd: kind === 'quick' ? `/home/me/.troupe/quick-chats/${id}` : '/tmp/notes',
    kind
  })
}

function renderGroup(): void {
  render(
    <RailDensityProvider density="expanded">
      <OlderChatsGroup />
    </RailDensityProvider>
  )
}

describe('OlderChatsGroup', () => {
  beforeEach(() => {
    openHistory.mockReset()
    deleteHistory.mockReset()
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useAcpStore.setState({
      sessionIndex: [
        chat('old', 'Notes from /tmp', 10),
        chat('quick', 'A quick chat', 20, 'quick')
      ],
      openHistorySession: openHistory,
      deleteHistorySession: deleteHistory
    })
  })

  it('starts collapsed and lists legacy unassigned chats, not quick chats', () => {
    renderGroup()
    const toggle = screen.getByRole('button', { name: 'Older chats' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Notes from /tmp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'A quick chat' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const row = screen.getByRole('button', { name: 'Notes from /tmp' })
    expect(row).toBeInTheDocument()
    expect(screen.getByTestId('older-chats-group')).toHaveClass('px-2')
    expect(row).toHaveClass('px-3')
    expect(row).not.toHaveClass('pl-8.75')
    expect(row.querySelector('[data-rail-icon-column]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: 'A quick chat' })).not.toBeInTheDocument()
  })

  it('opens the chat read-only', () => {
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'Older chats' }))
    fireEvent.click(screen.getByRole('button', { name: 'Notes from /tmp' }))
    expect(useQuickChatStore.getState().view).toEqual({
      mode: 'chat',
      sessionId: 'old',
      readOnly: true
    })
    expect(openHistory).toHaveBeenCalledWith('old')
  })

  it('confirms delete of the record and does not mention the folder being deleted', async () => {
    renderGroup()
    fireEvent.click(screen.getByRole('button', { name: 'Older chats' }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Notes from /tmp' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete chat' }))
    expect(screen.getByText(/Files in the original folder are kept/)).toBeInTheDocument()
    expect(screen.queryByText(/folder are deleted/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(deleteHistory).toHaveBeenCalledWith('old')
  })

  it('hides the section when there are no older chats', () => {
    useAcpStore.setState({ sessionIndex: [chat('quick', 'A quick chat', 20, 'quick')] })
    renderGroup()
    expect(screen.queryByTestId('older-chats-group')).not.toBeInTheDocument()
  })
})
