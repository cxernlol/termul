import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiffStatCounts } from './diff-stat-counts'

function renderCounts(added: number, removed: number, omitZero?: boolean): HTMLElement {
  const { container } = render(
    <p>
      <DiffStatCounts added={added} removed={removed} omitZero={omitZero} />
    </p>
  )
  return container.firstElementChild as HTMLElement
}

describe('DiffStatCounts', () => {
  it('renders +N in success and −M (U+2212) in destructive, one space apart', () => {
    const el = renderCounts(3, 1)
    expect(el.textContent).toBe('+3 −1')
    expect(el.querySelector('.text-success')?.textContent).toBe('+3')
    expect(el.querySelector('.text-destructive')?.textContent).toBe('−1')
  })

  it('shows both sides by default, even when one is zero', () => {
    expect(renderCounts(2, 0).textContent).toBe('+2 −0')
  })

  it('omitZero leaves out a zero side', () => {
    expect(renderCounts(2, 0, true).textContent).toBe('+2')
    expect(renderCounts(0, 4, true).textContent).toBe('−4')
  })

  it('omitZero renders nothing when both sides are zero', () => {
    expect(renderCounts(0, 0, true).textContent).toBe('')
  })
})
