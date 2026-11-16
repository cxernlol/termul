import { type RefObject, useLayoutEffect } from 'react'

/**
 * Sets `data-overflowing` on the element while its text is wider than its box,
 * for the `fade-end-overflow` utility: a label whose box hugs its text fades
 * its end only when it is cut. Re-measures when the box or the text changes.
 */
export function useOverflowFade(ref: RefObject<HTMLElement | null>, text: string): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    void text
    const measure = (): void => {
      el.toggleAttribute('data-overflowing', el.scrollWidth > el.clientWidth + 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.parentElement) observer.observe(el.parentElement)
    return () => observer.disconnect()
  }, [ref, text])
}
