import { expect } from 'vitest'
import { READ_ONLY_SERVER_REASON } from '@/lib/write-gate'

function isDisabled(el: HTMLElement): boolean {
  return (
    (el as HTMLButtonElement).disabled === true ||
    el.getAttribute('aria-disabled') === 'true' ||
    el.hasAttribute('data-disabled')
  )
}

/** Assert a write control is rendered disabled on a read-only server and that
 * its wrapper exposes the single read-only reason on hover (`title`). */
export function expectWriteGated(el: HTMLElement): void {
  expect(el).toBeInTheDocument()
  expect(isDisabled(el)).toBe(true)
  const wrapper = el.closest('[data-write-gate="read-only"]')
  expect(wrapper).not.toBeNull()
  expect(wrapper).toHaveAttribute('title', READ_ONLY_SERVER_REASON)
}

/** Assert a write control is enabled and unwrapped on an admitting server. */
export function expectNotWriteGated(el: HTMLElement): void {
  expect(el).toBeInTheDocument()
  expect(isDisabled(el)).toBe(false)
  expect(el.closest('[data-write-gate]')).toBeNull()
}
