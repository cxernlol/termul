import { useEffect } from 'react'
import { toast } from 'sonner'
import { logFrontendError } from '@/lib/log-api'
import {
  dismissRenameNotice,
  isRenameNoticeDue,
  RENAME_NOTICE_DESCRIPTION,
  RENAME_NOTICE_DISMISS_LABEL,
  RENAME_NOTICE_TITLE
} from '@/lib/rename-notice'

const RENAME_NOTICE_TOAST_ID = 'rename-notice'
/** Coalesces a drag-resize into one re-measure once the size settles. */
const REMEASURE_DELAY_MS = 100

/**
 * Publishes (or re-publishes, under the same id) the notice. The description
 * is a fresh function on every call on purpose: sonner 1.7.4 measures a
 * toast's height in a layout effect keyed on its title and description, and
 * reuses that height for the hover-expanded stack. A new description identity
 * is what makes it measure again; the rendered text stays the same.
 */
function publishRenameNotice(onDismissed: () => void): void {
  const dismiss = (): void => {
    onDismissed()
    dismissRenameNotice()
  }
  toast(RENAME_NOTICE_TITLE, {
    id: RENAME_NOTICE_TOAST_ID,
    description: () => RENAME_NOTICE_DESCRIPTION,
    duration: Number.POSITIVE_INFINITY,
    closeButton: false,
    action: { label: RENAME_NOTICE_DISMISS_LABEL, onClick: dismiss },
    onDismiss: dismiss
  })
}

/**
 * Shows the rename notice once on a device that updated from the old name.
 * It stays until dismissed: the action or a swipe records it, while closing
 * the app first shows it again on the next launch.
 */
export function useRenameNotice(): void {
  useEffect(() => {
    if (!isRenameNoticeDue()) return
    let shown = false
    let remeasureTimer: ReturnType<typeof setTimeout> | undefined
    const stopRemeasuring = (): void => {
      shown = false
      clearTimeout(remeasureTimer)
      window.removeEventListener('resize', scheduleRemeasure)
      document.removeEventListener('visibilitychange', scheduleRemeasure)
    }
    // gh-1850: the desktop window is created hidden, so the notice can mount
    // while the webview is still a few pixels wide. sonner then keeps the
    // height of that narrow, wrapped layout, and hovering stretches the toast
    // to it and moves "Got it" away. Re-measure whenever the viewport changes
    // size or the page becomes visible; this also covers a browser window
    // resized across sonner's 600px mobile breakpoint.
    function scheduleRemeasure(): void {
      if (document.visibilityState === 'hidden') return
      clearTimeout(remeasureTimer)
      remeasureTimer = setTimeout(() => {
        if (shown && isRenameNoticeDue()) publishRenameNotice(stopRemeasuring)
      }, REMEASURE_DELAY_MS)
    }
    // Defer the publish past this commit's effect flush (gh-1799): both
    // renderer roots mount <Toaster /> as a *later sibling* of the effects
    // host, so its sonner subscribe effect has not run yet when this one
    // fires. sonner drops a toast emitted while no Toaster is listening — it
    // never replays it — so emitting synchronously here shows nothing and the
    // dismiss is never recorded. A macrotask lands after the Toaster subscribes.
    const timer = setTimeout(() => {
      shown = true
      publishRenameNotice(stopRemeasuring)
      window.addEventListener('resize', scheduleRemeasure)
      document.addEventListener('visibilitychange', scheduleRemeasure)
      void logFrontendError({
        level: 'info',
        source: 'rename-notice',
        message: 'showed the rename notice on an updated device'
      })
    }, 0)
    return () => {
      clearTimeout(timer)
      stopRemeasuring()
    }
  }, [])
}
