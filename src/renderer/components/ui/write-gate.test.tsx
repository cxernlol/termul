import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { READ_ONLY_SERVER_REASON } from '@/lib/write-gate'
import { WriteGate } from './write-gate'

describe('WriteGate', () => {
  it('renders children untouched when not gated', () => {
    const { container } = render(
      <WriteGate gated={false}>
        <button type="button">Go</button>
      </WriteGate>
    )
    expect(container.querySelector('[data-write-gate]')).toBeNull()
    expect(screen.queryByText(READ_ONLY_SERVER_REASON)).toBeNull()
    expect(container.firstElementChild?.tagName).toBe('BUTTON')
  })

  it('exposes the reason on hover and focus when gated', () => {
    const { container } = render(
      <WriteGate gated>
        <button type="button" disabled>
          Go
        </button>
      </WriteGate>
    )
    const wrapper = container.querySelector('[data-write-gate="read-only"]') as HTMLElement
    expect(wrapper).toHaveAttribute('title', READ_ONLY_SERVER_REASON)
    expect(wrapper).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(READ_ONLY_SERVER_REASON)).toHaveClass('sr-only')
  })

  it('is not a tab stop and adds no sr-only copy when focusable is false', () => {
    const { container } = render(
      <WriteGate gated focusable={false}>
        <span>row</span>
      </WriteGate>
    )
    const wrapper = container.querySelector('[data-write-gate="read-only"]') as HTMLElement
    expect(wrapper).toHaveAttribute('title', READ_ONLY_SERVER_REASON)
    expect(wrapper).not.toHaveAttribute('tabindex')
    expect(screen.queryByText(READ_ONLY_SERVER_REASON)).toBeNull()
  })
})
