import type { Editor } from '@tiptap/core'
import { type RefObject, useEffect, useRef } from 'react'
import { useOskViewport } from '@/hooks/use-osk-viewport'

/**
 * Story 5.3 (T2.3): on mobile web, scroll the editor into view once per
 * on-screen-keyboard window, so iOS Safari does not leave the input under the
 * keyboard. On Tauri desktop the viewport hook reports no keyboard.
 *
 * A closed→open transition, not `onFocus`: the keyboard state can lag the
 * focus event. rAF-deferred so layout settles. `nearest` scrolls only as far
 * as needed (iOS) and not at all when the editor already shows above the
 * keyboard (Android resizes the layout onto it); `center` slid the composer
 * up and left it there.
 */
export function useScrollEditorOnOsk(
  editorRef: RefObject<Editor | null>,
  isMobileShell: boolean
): void {
  const { isOskOpen } = useOskViewport()
  const wasOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = isOskOpen
    if (wasOpen || !isOskOpen || !isMobileShell) return
    const el = editorRef.current?.view.dom
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }))
  }, [isOskOpen, isMobileShell, editorRef])
}
