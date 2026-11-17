import { type FocusEvent, type RefObject, useEffect, useRef } from 'react'

/**
 * Hands focus back to `root` when the element holding it goes away under it.
 *
 * The editor's undo and redo shortcuts listen on its root, so they only fire
 * while focus is inside. A pick in the add menu unmounts the menu's focused
 * field, and Undo, Redo or Delete turn disabled under the focus once there is
 * nothing left to do. Either way the browser drops focus to `<body>` and the
 * next Ctrl+Z goes nowhere. After each render this checks the last element
 * inside the editor (its portals included, as React bubbles their focus
 * events) that held focus: if it is gone or disabled and nothing else took
 * focus, the root takes it. Focus the user moved elsewhere is left alone.
 */
export function useFocusFallback(root: RefObject<HTMLElement | null>): {
  onFocus: (event: FocusEvent) => void
  onBlur: (event: FocusEvent) => void
} {
  const last = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const element = last.current
    if (!element || !root.current) return
    if (element.isConnected && !element.matches(':disabled')) return
    const active = document.activeElement
    if (active && active !== document.body && active !== element) return
    last.current = null
    root.current.focus({ preventScroll: true })
  })
  return {
    onFocus: (event) => {
      last.current = event.target as HTMLElement
    },
    // Focus moving to another element is the user's; a removed or disabled element moves it nowhere.
    onBlur: (event) => {
      if (event.relatedTarget) {
        last.current = null
        return
      }
      // With no next element, the user may have left for a spot that takes no focus. Judge once
      // the current task settles: an engine can fire blur before it detaches or disables the element.
      const element = event.target as HTMLElement
      queueMicrotask(() => {
        if (last.current !== element) return
        if (element.isConnected && !element.matches(':disabled')) last.current = null
      })
    }
  }
}
