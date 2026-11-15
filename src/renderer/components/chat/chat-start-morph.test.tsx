import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./ascii-glow/AsciiGlow', () => ({
  AsciiGlow: () => <div data-testid="ascii-glow" />
}))

import {
  ChatStartFooter,
  ChatStartGlow,
  ChatTimelineStage,
  useComposerMorph
} from './chat-start-morph'

function stage(isEmptyChat: boolean, reduced: boolean): React.JSX.Element {
  return (
    <ChatTimelineStage
      isEmptyChat={isEmptyChat}
      isMobileShell={false}
      reduced={reduced}
      hero={<h2>What should we do in termul?</h2>}
    >
      <div data-testid="timeline" />
    </ChatTimelineStage>
  )
}

describe('useComposerMorph (the composer is the shared element)', () => {
  it('measures on the start screen and keeps layout on through the first-send morph', () => {
    const { result, rerender } = renderHook(({ start }) => useComposerMorph(start, false), {
      initialProps: { start: true }
    })
    expect(result.current.frame.layout).toBe(true)
    expect(result.current.frame.transition).toEqual({
      type: 'spring',
      visualDuration: 0.35,
      bounce: 0
    })
    // `position` keeps the text from stretching while the card scales.
    expect(result.current.content.layout).toBe('position')

    // The render that leaves the start screen still has layout on.
    rerender({ start: false })
    expect(result.current.frame.layout).toBe(true)
    expect(result.current.content.layout).toBe('position')

    // After the morph the working chat never animates its composer.
    act(() => result.current.frame.onLayoutAnimationComplete?.())
    expect(result.current.frame.layout).toBe(false)
    expect(result.current.content.layout).toBe(false)
  })

  it('a chat that opens with history never turns layout on', () => {
    const { result } = renderHook(() => useComposerMorph(false, false))
    expect(result.current.frame.layout).toBe(false)
    expect(result.current.content.layout).toBe(false)
  })

  it('switches at once under reduced motion', () => {
    const { result, rerender } = renderHook(({ start }) => useComposerMorph(start, true), {
      initialProps: { start: true }
    })
    expect(result.current.frame).toMatchObject({ layout: false, transition: { duration: 0 } })
    rerender({ start: false })
    expect(result.current.frame.layout).toBe(false)
    expect(result.current.content.layout).toBe(false)
  })
})

describe('ChatTimelineStage', () => {
  it('first send: the hero exits in place (inert) and the transcript rises from 8px', () => {
    const { container, rerender } = render(stage(true, false))
    expect(container.firstElementChild).toHaveClass('flex-[1_1_auto]', 'justify-end')

    rerender(stage(false, false))

    const hero = container.querySelector('[data-chat-start-part]')
    expect(hero).toHaveAttribute('data-chat-start-part', 'exiting')
    expect(hero).toHaveAttribute('inert')
    const timeline = screen.getByTestId('timeline').parentElement as HTMLElement
    expect(timeline.style.opacity).toBe('0')
    expect(timeline.style.transform).toContain('translateY(8px)')
    expect(container.firstElementChild).toHaveClass('flex-1')
  })

  it('reduced motion: an instant switch, no travel and no fade', async () => {
    const { container, rerender } = render(stage(true, true))
    rerender(stage(false, true))

    const timeline = screen.getByTestId('timeline').parentElement as HTMLElement
    expect(timeline.style.opacity).not.toBe('0')
    expect(timeline.style.transform).not.toContain('translateY(8px)')
    await waitFor(() => expect(container.querySelector('[data-chat-start-part]')).toBeNull())
  })

  it('a chat that opens with history shows the transcript without an entrance', () => {
    render(stage(false, false))
    const timeline = screen.getByTestId('timeline').parentElement as HTMLElement
    expect(timeline.style.opacity).not.toBe('0')
  })
})

describe('ChatStartGlow', () => {
  it('fades the glow out on the first send', () => {
    const { rerender } = render(<ChatStartGlow show reduced={false} />)
    expect(screen.getByTestId('ascii-glow')).toBeInTheDocument()
    rerender(<ChatStartGlow show={false} reduced={false} />)
    // Still mounted while it fades.
    expect(screen.getByTestId('ascii-glow')).toBeInTheDocument()
  })

  it('reduced motion: removes the glow at once', async () => {
    const { rerender } = render(<ChatStartGlow show reduced />)
    rerender(<ChatStartGlow show={false} reduced />)
    await waitFor(() => expect(screen.queryByTestId('ascii-glow')).toBeNull())
  })
})

describe('ChatStartFooter', () => {
  it('holds the row and the bottom part of the centred start block', () => {
    const { container, rerender } = render(
      <ChatStartFooter show reduced={false} row={<div data-testid="row" />} />
    )
    expect(screen.getByTestId('row').parentElement).toHaveClass('max-w-[680px]', 'mx-auto')
    expect(container.querySelector('[data-chat-start-spacer]')).toHaveClass('flex-[1_1_0px]')

    rerender(<ChatStartFooter show={false} reduced={false} row={<div data-testid="row" />} />)
    expect(container.querySelector('[data-chat-start-spacer]')).toBeNull()
  })
})
