import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolCall } from '@/lib/acp-api'
import { endedState, subagentToolCall } from '@/lib/test-utils/subagent'
import type { ChatMessage } from '@/stores/acp-store/types'
import { useGitStatusStore } from '@/stores/git-status-store'
import { useOverlayStackStore } from '@/stores/overlay-stack-store'
import { ChatStatusChips } from './ChatStatusChips'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const mobileRef = vi.hoisted(() => ({ current: false }))
vi.mock('@/hooks/use-mobile-web-shell', () => ({ useMobileWebShell: () => mobileRef.current }))

// The blue "new changes" dot has its own tests (use-changes-seen.test.tsx); here it stays off
// so the segment names are the plain counts.
const seenRef = vi.hoisted(() => ({ hasNew: false, markSeen: vi.fn() }))
vi.mock('./use-changes-seen', () => ({
  useChangesSeen: () => ({ hasNew: seenRef.hasNew, markSeen: seenRef.markSeen })
}))

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return { ...actual, useReducedMotion: () => true }
})

const user: ChatMessage = {
  id: 'u1',
  role: 'user',
  blocks: [],
  streaming: false,
  timestamp: 1,
  seq: 1
}

const subagent: ToolCall = subagentToolCall(
  { role: 'Explore', state: endedState('completed') },
  { toolCallId: 'a1', seq: 2, timestamp: 2, status: 'completed' }
)

const edit = (id: string, path: string): ToolCall => ({
  toolCallId: id,
  kind: 'edit',
  status: 'completed',
  content: [{ type: 'diff', path, oldText: 'old', newText: 'new' }],
  rawInput: { filePath: path }
})

const EDITS = [edit('e1', 'src/a.ts'), edit('e2', 'src/b.ts')]

/** No cwd: the changed files come from the tool calls, with no git read. */
function Pill({
  toolCalls,
  hidden,
  turnActive = false
}: {
  toolCalls: ToolCall[]
  hidden?: boolean
  turnActive?: boolean
}) {
  return (
    <ChatStatusChips
      sessionId="s1"
      cwd=""
      toolCalls={toolCalls}
      messages={[user]}
      turnActive={turnActive}
      hidden={hidden}
    />
  )
}

const chips = () =>
  within(screen.getByRole('group', { name: 'Session status' }))
    .getAllByRole('button')
    .map((chip) => chip.getAttribute('aria-label'))
const chip = (name: RegExp) => screen.getByRole('button', { name })
/** The mark slot kind of a segment: `spinner`, `failed`, `new` or `none`. */
const mark = (button: HTMLElement) => button.querySelector('[data-mark]')?.getAttribute('data-mark')

describe('ChatStatusChips rail', () => {
  beforeEach(() => {
    mobileRef.current = false
    seenRef.hasNew = false
    seenRef.markSeen.mockClear()
    useOverlayStackStore.setState({ stack: [] })
  })

  it('renders no rail without subagents or changed files, or while hidden', () => {
    render(<Pill toolCalls={[]} />)
    expect(screen.queryByRole('group', { name: 'Session status' })).toBeNull()
    render(<Pill toolCalls={[subagent, ...EDITS]} hidden />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('omits Changes for a quick chat and does not watch that folder', () => {
    const watch = vi.spyOn(useGitStatusStore.getState(), 'watchDiffStat')
    render(
      <ChatStatusChips
        sessionId="s1"
        cwd="/home/me/.troupe/quick-chats/abc"
        toolCalls={EDITS}
        messages={[user]}
        turnActive={false}
        hideChanges
      />
    )
    expect(screen.queryByRole('button', { name: /^Changes:/ })).toBeNull()
    expect(watch).not.toHaveBeenCalled()
    watch.mockRestore()
  })

  it('shows one segment per kind with rows, Subagents first and Changes last, as counts only', () => {
    const { rerender } = render(<Pill toolCalls={EDITS} />)
    expect(chips()).toEqual(['Changes: 2 changed files'])
    rerender(<Pill toolCalls={[subagent, ...EDITS]} />)
    expect(chips()).toEqual(['Subagents: 1 done', 'Changes: 2 changed files'])
    // No visible word: the icon and the count are the segment.
    expect(chip(/^Subagents:/)).toHaveTextContent(/^1$/)
    expect(chip(/^Changes:/)).toHaveTextContent(/^2$/)
  })

  it('shows a spinner while a subagent works, a red dot when one failed and none works, else no mark', () => {
    // A call with no end state counts as running while the turn is active.
    const running = subagentToolCall(
      { role: 'Explore' },
      { toolCallId: 'a3', seq: 4, timestamp: 4, status: 'in_progress' }
    )
    const failed = subagentToolCall(
      { role: 'Explore', state: endedState('failed') },
      { toolCallId: 'a2', seq: 3, timestamp: 3, status: 'failed' }
    )
    const { rerender } = render(<Pill toolCalls={[subagent]} />)
    expect(mark(chip(/^Subagents:/))).toBe('none')
    rerender(<Pill toolCalls={[subagent, failed]} />)
    expect(mark(chip(/^Subagents:/))).toBe('failed')
    rerender(<Pill toolCalls={[subagent, failed, running]} turnActive />)
    expect(mark(chip(/^Subagents:/))).toBe('spinner')
  })

  it('shows the blue dot on Changes while the files are new, and says so in the name', () => {
    seenRef.hasNew = true
    render(<Pill toolCalls={EDITS} />)
    expect(mark(chip(/^Changes:/))).toBe('new')
    expect(chip(/^Changes:/)).toHaveAccessibleName('Changes: 2 changed files, new changes')
  })

  it('opens one panel at a time, to the left of its segment', () => {
    render(<Pill toolCalls={[subagent, ...EDITS]} />)
    fireEvent.click(chip(/^Subagents:/))
    const subagents = screen.getByRole('dialog', { name: 'Subagents' })
    expect(subagents).toHaveAttribute('data-side', 'left')
    expect(chip(/^Subagents:/)).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(chip(/^Changes:/))
    expect(screen.queryByRole('dialog', { name: 'Subagents' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Changed files' })).toBeInTheDocument()
    expect(chip(/^Subagents:/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the panel on Esc and on a second click of its chip', async () => {
    render(<Pill toolCalls={[subagent, ...EDITS]} />)
    // A real click focuses the chip first; the panel returns focus to it.
    chip(/^Changes:/).focus()
    fireEvent.click(chip(/^Changes:/))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(chip(/^Changes:/)).toHaveFocus())

    fireEvent.click(chip(/^Changes:/))
    fireEvent.click(chip(/^Changes:/))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('marks the changes as seen when the Changes panel opens, and not for another segment', () => {
    render(<Pill toolCalls={[subagent, ...EDITS]} />)
    fireEvent.click(chip(/^Subagents:/))
    expect(seenRef.markSeen).not.toHaveBeenCalled()
    fireEvent.click(chip(/^Changes:/))
    expect(seenRef.markSeen).toHaveBeenCalledTimes(1)
  })

  it('closes a panel when its segment goes away', () => {
    const { rerender } = render(<Pill toolCalls={[subagent, ...EDITS]} />)
    fireEvent.click(chip(/^Subagents:/))
    rerender(<Pill toolCalls={EDITS} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chips()).toEqual(['Changes: 2 changed files'])
    // It does not open again when the segment comes back.
    rerender(<Pill toolCalls={[subagent, ...EDITS]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps Changes at count 0 while its panel is open, and drops it after the panel closes', async () => {
    const { rerender } = render(<Pill toolCalls={[subagent, ...EDITS]} />)
    fireEvent.click(chip(/^Changes:/))
    rerender(<Pill toolCalls={[subagent]} />)
    // Open at 0: the segment and its panel stay.
    expect(chips()).toEqual(['Subagents: 1 done', 'Changes: 0 changed files'])
    expect(chip(/^Changes:/)).toHaveTextContent(/^0$/)
    expect(screen.getByRole('dialog', { name: 'Changed files' })).toBeInTheDocument()

    fireEvent.click(chip(/^Changes:/))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chips()).toEqual(['Subagents: 1 done'])
    // The leaving segment is still in the DOM for its fade, but out of the accessibility tree
    // and out of layout; it is gone after the 120ms fade.
    await waitFor(() => expect(document.querySelector('[data-exiting]')).toBeNull())
  })

  it('opens a bottom sheet per segment on the phone shell and registers it for Back', () => {
    mobileRef.current = true
    render(<Pill toolCalls={[subagent, ...EDITS]} />)
    fireEvent.click(chip(/^Changes:/))
    const sheet = screen.getByRole('dialog', { name: 'Changed files' })
    expect(sheet).toHaveAttribute('data-sheet')
    // The sheet has its own title, so the panel does not repeat it.
    expect(within(sheet).getAllByText('Changed files')).toHaveLength(1)
    expect(useOverlayStackStore.getState().stack.map((e) => e.id)).toEqual(['chat-status-sheet'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(useOverlayStackStore.getState().stack).toEqual([])
  })
})
