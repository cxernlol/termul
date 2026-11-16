import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bot } from '@/components/icons'
import type { ToolCall } from '@/lib/acp-api'
import { endedState, subagentToolCall } from '@/lib/test-utils/subagent'
import type { ChatMessage } from '@/stores/acp-store/types'
import { useOverlayStackStore } from '@/stores/overlay-stack-store'
import { ChatStatusChips } from './ChatStatusChips'
import { RAIL_EXIT_MS, StatusMark, StatusRail, StatusRailSegment } from './StatusChip'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const mobileRef = vi.hoisted(() => ({ current: false }))
vi.mock('@/hooks/use-mobile-web-shell', () => ({ useMobileWebShell: () => mobileRef.current }))

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

function Pill({
  toolCalls,
  hidden,
  onShownChange
}: {
  toolCalls: ToolCall[]
  hidden?: boolean
  onShownChange?: (shown: boolean) => void
}) {
  return (
    <ChatStatusChips
      sessionId="s1"
      cwd=""
      toolCalls={toolCalls}
      messages={[user]}
      turnActive={false}
      hidden={hidden}
      onShownChange={onShownChange}
    />
  )
}

// By attribute: a hidden rail is out of the accessibility tree, so it has no role-based name.
const rail = () => {
  const found = document.querySelector<HTMLElement>('[role="group"][aria-label="Session status"]')
  if (!found) throw new Error('no status rail')
  return found
}
const segment = (name: RegExp) => screen.getByRole('button', { name })

describe('status rail', () => {
  beforeEach(() => {
    mobileRef.current = false
    seenRef.hasNew = false
    seenRef.markSeen.mockClear()
    useOverlayStackStore.setState({ stack: [] })
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sits at the top right of its parent, above the list fade and below popovers', () => {
    render(<Pill toolCalls={EDITS} />)
    expect(rail().className).toContain('absolute')
    expect(rail().className).toContain('top-3')
    expect(rail().className).toContain('right-3')
    expect(rail().className).toContain('z-20')
    expect(rail().className).toContain('w-[60px]')
  })

  it('stays mounted once shown and toggles data-shown, taking no input while hidden', () => {
    const { rerender } = render(<Pill toolCalls={EDITS} />)
    expect(rail()).toHaveAttribute('data-shown', 'true')
    expect(rail()).not.toHaveAttribute('inert')
    expect(rail()).not.toHaveAttribute('aria-hidden')

    rerender(<Pill toolCalls={EDITS} hidden />)
    expect(rail()).toHaveAttribute('data-shown', 'false')
    expect(rail()).toHaveAttribute('inert')
    expect(rail()).toHaveAttribute('aria-hidden', 'true')
    expect(rail().className).toContain('data-[shown=false]:pointer-events-none')
    expect(screen.queryByRole('button')).toBeNull()

    rerender(<Pill toolCalls={EDITS} />)
    expect(rail()).toHaveAttribute('data-shown', 'true')
    expect(rail()).not.toHaveAttribute('inert')
  })

  it('does not mount before it has anything to show', () => {
    render(<Pill toolCalls={[]} />)
    expect(document.querySelector('[role="group"]')).toBeNull()
  })

  it('reports when it shows, for the chat root gutter, and clears on unmount', () => {
    const onShownChange = vi.fn()
    const { rerender, unmount } = render(<Pill toolCalls={[]} onShownChange={onShownChange} />)
    expect(onShownChange).toHaveBeenLastCalledWith(false)

    rerender(<Pill toolCalls={EDITS} onShownChange={onShownChange} />)
    expect(onShownChange).toHaveBeenLastCalledWith(true)

    rerender(<Pill toolCalls={EDITS} hidden onShownChange={onShownChange} />)
    expect(onShownChange).toHaveBeenLastCalledWith(false)

    rerender(<Pill toolCalls={EDITS} onShownChange={onShownChange} />)
    expect(onShownChange).toHaveBeenLastCalledWith(true)
    unmount()
    expect(onShownChange).toHaveBeenLastCalledWith(false)
  })

  it('shows 99+ above 99 and keeps the real number in the name', () => {
    const many = Array.from({ length: 120 }, (_, i) => edit(`e${i}`, `src/f${i}.ts`))
    render(<Pill toolCalls={many} />)
    expect(segment(/^Changes:/)).toHaveTextContent(/^99\+$/)
    expect(segment(/^Changes:/)).toHaveAccessibleName('Changes: 120 changed files')
  })

  it('shows 99 as 99', () => {
    const ninetyNine = Array.from({ length: 99 }, (_, i) => edit(`e${i}`, `src/f${i}.ts`))
    render(<Pill toolCalls={ninetyNine} />)
    expect(segment(/^Changes:/)).toHaveTextContent(/^99$/)
  })

  it('gives a press no scale: the segment answers with its fill only', () => {
    render(<Pill toolCalls={EDITS} />)
    const { className } = segment(/^Changes:/)
    expect(className).not.toMatch(/scale/)
    expect(className).toContain('hover:bg-rail-segment-hover')
    expect(className).toContain('active:bg-rail-segment-active')
    expect(className).toContain('data-[state=open]:bg-rail-segment-active')
    expect(className).toContain('focus-visible:ring-focus-ring')
    // 28px segment, hit area padded by a pseudo-element.
    expect(className).toContain('h-7')
    expect(className).toContain('after:')
  })

  it('opens a tooltip with the same words on focus, and "Open list" for Changes', () => {
    render(<Pill toolCalls={[subagent, ...EDITS]} />)
    fireEvent.focus(segment(/^Changes:/))
    expect(screen.getByRole('tooltip')).toHaveTextContent('2 changed files · Open list')
  })

  it('draws a divider only between segments', () => {
    const { rerender } = render(<Pill toolCalls={EDITS} />)
    expect(rail().querySelectorAll('.bg-rail-edge')).toHaveLength(0)
    rerender(<Pill toolCalls={[subagent, ...EDITS]} />)
    expect(rail().querySelectorAll('.bg-rail-edge')).toHaveLength(1)
  })

  it('takes a leaving segment out of layout at once, fades it for 120ms, then removes it', () => {
    const { rerender } = render(<Pill toolCalls={[subagent, ...EDITS]} />)
    rerender(<Pill toolCalls={EDITS} />)

    const leaving = rail().querySelector('[data-exiting]')
    expect(leaving).not.toBeNull()
    expect(leaving?.className).toContain('absolute')
    expect(leaving?.className).toContain('opacity-0')
    expect(leaving).toHaveAttribute('aria-hidden', 'true')
    expect(leaving).toHaveAttribute('inert')
    // It no longer counts: one real segment is left.
    expect(screen.getAllByRole('button')).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(RAIL_EXIT_MS - 1)
    })
    expect(rail().querySelector('[data-exiting]')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(rail().querySelector('[data-exiting]')).toBeNull()
  })

  it('cancels the fade out when the segment comes back', () => {
    const { rerender } = render(<Pill toolCalls={[subagent, ...EDITS]} />)
    rerender(<Pill toolCalls={EDITS} />)
    act(() => {
      vi.advanceTimersByTime(60)
    })
    rerender(<Pill toolCalls={[subagent, ...EDITS]} />)
    expect(rail().querySelector('[data-exiting]')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(RAIL_EXIT_MS * 2)
    })
    expect(screen.getByRole('button', { name: /^Subagents:/ })).toBeInTheDocument()
  })

  it('fades the whole rail, with its last segment still in flow, when the last segment leaves', () => {
    const { rerender } = render(<Pill toolCalls={EDITS} />)
    rerender(<Pill toolCalls={[]} />)
    expect(rail()).toHaveAttribute('data-shown', 'false')
    const leaving = rail().querySelector('[data-exiting]')
    expect(leaving).not.toBeNull()
    expect(leaving?.className).not.toContain('absolute')
    act(() => {
      vi.advanceTimersByTime(RAIL_EXIT_MS)
    })
    expect(rail().querySelector('[data-exiting]')).toBeNull()
  })

  it('moves the rail motion onto opacity and scale only, with an opacity-only reduced path', () => {
    render(<Pill toolCalls={EDITS} />)
    const { className } = rail()
    expect(className).toContain('transition-[opacity,scale]')
    expect(className).toContain('origin-top-right')
    expect(className).toContain('motion-reduce:transition-[opacity]')
    expect(className).toContain('motion-safe:data-[shown=false]:scale-[0.97]')
    expect(className).toContain('data-[shown=true]:duration-150')
    expect(className).toContain('data-[shown=false]:duration-120')
    expect(className).not.toContain('transition-all')
  })
})

describe('StatusMark', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const layers = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-mark-layer]')).map((layer) => [
      layer.getAttribute('data-mark-layer'),
      layer.getAttribute('data-active')
    ])

  it('shows nothing for no mark', () => {
    const { container } = render(<StatusMark kind={null} />)
    expect(layers(container)).toEqual([])
    expect(container.firstElementChild).toHaveAttribute('data-mark', 'none')
    // An empty slot takes no room, so the segment content stays centred.
    expect(container.firstElementChild?.className).toContain('w-0')
  })

  it('crosses over in two stacked layers for 150ms, then keeps one', () => {
    const { container, rerender } = render(<StatusMark kind="spinner" />)
    expect(layers(container)).toEqual([['spinner', 'true']])

    rerender(<StatusMark kind="failed" />)
    expect(layers(container)).toEqual([
      ['failed', 'true'],
      ['spinner', 'false']
    ])
    // Both layers share the 10px slot: no layout change.
    expect(container.firstElementChild?.className).toContain('w-2.5')
    for (const layer of container.querySelectorAll('[data-mark-layer]')) {
      expect(layer.className).toContain('absolute')
      expect(layer.className).toContain('transition-[opacity,scale]')
      expect(layer.className).toContain('duration-150')
      expect(layer.className).toContain('motion-reduce:transition-[opacity]')
    }

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(layers(container)).toEqual([['failed', 'true']])
  })

  it('fades a mark out to none and back', () => {
    const { container, rerender } = render(<StatusMark kind="failed" />)
    rerender(<StatusMark kind={null} />)
    expect(layers(container)).toEqual([['failed', 'false']])
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(layers(container)).toEqual([])
  })

  it('pops the blue dot once on mount, and not under reduced motion', () => {
    const { container } = render(<StatusMark kind="new" />)
    const dot = container.querySelector('[data-mark-layer="new"] > span')
    expect(dot?.className).toContain('animate-mark-pop')
    expect(dot?.className).toContain('bg-primary-fill')
    expect(dot?.className).toContain('motion-reduce:animate-none')
  })

  it('draws the failed dot in the destructive token and the spinner at 10px', () => {
    const { container, rerender } = render(<StatusMark kind="failed" />)
    expect(container.querySelector('.bg-destructive')).not.toBeNull()
    rerender(<StatusMark kind="spinner" />)
    expect(container.querySelector('.tm-comet')).not.toBeNull()
  })
})

describe('StatusRailSegment', () => {
  it('keeps the icon, the count and the mark in fixed lanes with no visible word', () => {
    render(
      <StatusRail shown>
        <StatusRailSegment
          label="Subagents: 2 working"
          icon={<Bot size={14} />}
          count={2}
          mark="spinner"
        />
      </StatusRail>
    )
    const button = screen.getByRole('button', { name: 'Subagents: 2 working' })
    expect(button).toHaveTextContent(/^2$/)
    // Fixed width, content centred: the mark slot takes no room when empty.
    expect(button.className).toContain('justify-center')
    expect(button.className).toContain('w-full')
    // Touch: a 44px slot per segment (28px + 8px margins), hit area inside it.
    expect(button.className).toContain('pointer-coarse:my-2')
    expect(button.className).toContain('pointer-coarse:after:-inset-y-2')
    expect(button.querySelector('.tabular-nums')?.className).toContain('text-foreground')
    expect(button.querySelector('[data-mark="spinner"]')).not.toBeNull()
  })
})
