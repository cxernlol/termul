import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { CommandPalette } from './CommandPalette'

window.HTMLElement.prototype.scrollIntoView = vi.fn()

vi.mock('@/hooks/use-recent-commands', () => ({
  useRecentCommandIds: () => [],
  useSaveRecentCommand: () => vi.fn(() => Promise.resolve())
}))
vi.mock('@/hooks/use-pinned-commands', () => ({
  usePinnedCommandIds: () => [],
  useTogglePinnedCommand: () => vi.fn(() => Promise.resolve())
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(() => Promise.resolve()) }))

const openHistory = vi.fn(async () => undefined)

function quick(id: string, title: string, createdAt: number) {
  return mockSessionIndexEntry({ id, title, createdAt, projectId: '__unassigned__', kind: 'quick' })
}

function renderPalette() {
  const onClose = vi.fn()
  render(<CommandPalette isOpen onClose={onClose} projects={[]} onSwitchProject={vi.fn()} />)
  return { onClose }
}

const type = (value: string): void => {
  fireEvent.change(screen.getByRole('combobox'), { target: { value } })
}
const quickGroup = (): HTMLElement | null =>
  screen
    .queryByText('Quick chats', { selector: '[cmdk-group-heading]' })
    ?.closest<HTMLElement>('[cmdk-group]') ?? null

describe('CommandPalette Quick chats group', () => {
  beforeEach(() => {
    openHistory.mockClear()
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useAcpStore.setState({
      agentConfigs: [],
      openHistorySession: openHistory,
      sessionIndex: [
        quick('q-old', 'Draft release notes', 10),
        quick('q-new', 'Draft a tweet', 20),
        mockSessionIndexEntry({ id: 'p', title: 'Draft in a project', projectId: 'p1' }),
        mockSessionIndexEntry({ id: 'legacy', title: 'Draft legacy', projectId: '__unassigned__' }),
        ...Array.from({ length: 6 }, (_, i) => quick(`many-${i}`, `Bulk ${i}`, 100 + i))
      ]
    })
  })

  it('shows nothing until there is a query', () => {
    renderPalette()
    expect(quickGroup()).toBeNull()
  })

  it('lists matching quick chats newest first, without project or older chats', () => {
    renderPalette()
    type('draft')
    const titles = within(quickGroup() as HTMLElement)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(titles).toEqual([
      expect.stringContaining('Draft a tweet'),
      expect.stringContaining('Draft release notes')
    ])
  })

  it('shows at most five', () => {
    renderPalette()
    type('bulk')
    expect(within(quickGroup() as HTMLElement).getAllByRole('option')).toHaveLength(5)
  })

  it('ranks a close title match above loose command matches', () => {
    useAcpStore.setState({ sessionIndex: [quick('q-hello', 'hello world notes', 30)] })
    render(
      <CommandPalette
        isOpen
        onClose={vi.fn()}
        projects={[]}
        onSwitchProject={vi.fn()}
        onNewChat={vi.fn()}
        onNewQuickChat={vi.fn()}
      />
    )
    type('hello')
    const headings = Array.from(document.querySelectorAll('[cmdk-group]'))
      .filter((group) => group.querySelector('[cmdk-item]'))
      .map((group) => group.querySelector('[cmdk-group-heading]')?.textContent)
    expect(headings[0]).toBe('Quick chats')
  })

  it('opens the pick in the quick view and closes the palette', () => {
    const { onClose } = renderPalette()
    type('tweet')
    fireEvent.click(within(quickGroup() as HTMLElement).getByRole('option'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'chat', sessionId: 'q-new' })
    expect(openHistory).toHaveBeenCalledWith('q-new')
  })
})
