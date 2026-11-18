import { type RefObject, useEffect } from 'react'
import { captureFocusReturnTarget } from '@/lib/focus-return'

/** Elements Tab reaches, in DOM order (the focus trap wraps over these). */
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Another layer that may sit above the modal and must keep its own focus. */
const OTHER_LAYER =
  '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-sonner-toaster]'

function isCoarsePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

/**
 * Modal focus for the hand-built modals (the shared `ui/dialog` primitive does
 * this through Radix). While `isOpen`:
 * - focus moves into the dialog: `initialFocusRef` when given, else the first
 *   field or control. On a touch screen it lands on the dialog itself, so the
 *   on-screen keyboard does not cover half the modal before the user asks.
 * - Tab and Shift+Tab wrap inside the dialog; focus that leaves comes back.
 * - on close, focus returns to the element that had it before.
 */
export function useModalFocus(
  isOpen: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!isOpen) return
    const returnTo = captureFocusReturnTarget()

    const focusInitial = () => {
      const dialog = dialogRef.current
      if (!dialog || dialog.contains(document.activeElement)) return
      if (isCoarsePointer()) {
        dialog.focus()
        return
      }
      const initial = initialFocusRef?.current ?? dialog.querySelector<HTMLElement>(TABBABLE)
      ;(initial ?? dialog).focus()
    }
    const raf = requestAnimationFrame(focusInitial)

    const contain = (e: FocusEvent) => {
      if (!(e.target instanceof Element) || dialogRef.current?.contains(e.target)) return
      // A layer opened on top (a picker, a confirm, a menu) keeps its focus.
      if (e.target.closest(OTHER_LAYER)) return
      focusInitial()
    }
    const trapTab = (e: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (e.key !== 'Tab' || !dialog || !dialog.contains(document.activeElement)) return
      const tabbable = Array.from(dialog.querySelectorAll<HTMLElement>(TABBABLE))
      const first = tabbable[0]
      const last = tabbable[tabbable.length - 1]
      const active = document.activeElement
      if (!first) {
        e.preventDefault()
      } else if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('focusin', contain)
    document.addEventListener('keydown', trapTab)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('focusin', contain)
      document.removeEventListener('keydown', trapTab)
      if (returnTo?.isConnected) returnTo.focus()
    }
  }, [isOpen, dialogRef, initialFocusRef])
}
