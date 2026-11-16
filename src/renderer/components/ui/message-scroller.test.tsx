import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type EndScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller
} from './message-scroller'

/** ResizeObserver stand-in that can fire the callback for one observed element. */
const observed = new Map<Element, () => void>()
class ResizeObserverStub {
  constructor(private readonly callback: () => void) {}
  observe(element: Element): void {
    observed.set(element, this.callback)
  }
  unobserve(): void {}
  disconnect(): void {}
}

function resize(element: Element): void {
  act(() => observed.get(element)?.())
}

let original: typeof ResizeObserver
beforeEach(() => {
  original = window.ResizeObserver
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  observed.clear()
})
afterEach(() => {
  window.ResizeObserver = original
})

/** Puts a pinned viewport 400 px above the content end. */
function setGeometry(viewport: HTMLElement): void {
  Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 600 })
}

function Scroller({
  followContent,
  endScroller,
  onReady
}: {
  followContent: boolean
  endScroller?: EndScroller
  onReady?: (scrollToEnd: (behavior?: ScrollBehavior) => void) => void
}): React.JSX.Element {
  return (
    <MessageScrollerProvider followContent={followContent}>
      <MessageScrollerViewport data-testid="viewport">
        <MessageScrollerContent data-testid="content">
          <Owner endScroller={endScroller} onReady={onReady} />
        </MessageScrollerContent>
      </MessageScrollerViewport>
    </MessageScrollerProvider>
  )
}

function Owner({
  endScroller,
  onReady
}: {
  endScroller?: EndScroller
  onReady?: (scrollToEnd: (behavior?: ScrollBehavior) => void) => void
}): null {
  const { setEndScroller, scrollToEnd } = useMessageScroller()
  useEffect(() => {
    if (!endScroller) return
    setEndScroller(endScroller)
    return () => setEndScroller(null)
  }, [endScroller, setEndScroller])
  useEffect(() => onReady?.(scrollToEnd), [onReady, scrollToEnd])
  return null
}

describe('MessageScrollerProvider scroll ownership', () => {
  it('follows content growth by default', () => {
    const view = render(<Scroller followContent />)
    const viewport = view.getByTestId('viewport')
    setGeometry(viewport)

    resize(view.getByTestId('content'))
    expect(viewport.scrollTop).toBe(1000)
  })

  it('leaves content growth to the list when followContent is off', () => {
    const view = render(<Scroller followContent={false} />)
    const viewport = view.getByTestId('viewport')
    setGeometry(viewport)

    resize(view.getByTestId('content'))
    expect(viewport.scrollTop).toBe(0)
  })

  it('sends viewport resizes and jump-to-latest through the registered end scroller', () => {
    const endScroller = vi.fn<EndScroller>()
    let scrollToEnd: ((behavior?: ScrollBehavior) => void) | undefined
    const view = render(
      <Scroller
        followContent={false}
        endScroller={endScroller}
        onReady={(fn) => {
          scrollToEnd = fn
        }}
      />
    )
    const viewport = view.getByTestId('viewport')
    setGeometry(viewport)
    const scrollTo = vi.spyOn(viewport, 'scrollTo')

    resize(viewport)
    expect(endScroller).toHaveBeenLastCalledWith('auto')

    act(() => scrollToEnd?.('smooth'))
    expect(endScroller).toHaveBeenLastCalledWith('smooth')
    expect(scrollTo).not.toHaveBeenCalled()
    expect(viewport.scrollTop).toBe(0)
  })
})
