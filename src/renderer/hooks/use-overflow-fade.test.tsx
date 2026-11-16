import { render } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useOverflowFade } from './use-overflow-fade'

function Label({ text }: { text: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  useOverflowFade(ref, text)
  return (
    <span ref={ref} data-testid="label" className="fade-end-overflow">
      {text}
    </span>
  )
}

function stubWidths(scrollWidth: number, clientWidth: number): () => void {
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
  const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth)
  return () => {
    scroll.mockRestore()
    client.mockRestore()
  }
}

describe('useOverflowFade', () => {
  it('marks a label whose text is wider than its box', () => {
    const restore = stubWidths(240, 120)
    const { getByTestId } = render(<Label text="termul · fix/web-build-font-size-tokens" />)
    expect(getByTestId('label')).toHaveAttribute('data-overflowing')
    restore()
  })

  it('leaves a label that fits unmarked', () => {
    const restore = stubWidths(80, 80)
    const { getByTestId } = render(<Label text="termul · dev" />)
    expect(getByTestId('label')).not.toHaveAttribute('data-overflowing')
    restore()
  })
})
