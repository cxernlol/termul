/**
 * Focus return after an overlay that a mobile sheet handed off to.
 *
 * A sheet (the drawer, the ⋯ and project sheets) closes before the overlay it
 * opens shows, so the overlay is not covered by the sheet's scrim. The sheet's
 * opener is then gone or unfocused by the time the overlay closes, and focus
 * falls to `<body>`. The close consumes the recorded opener, so the caller reads
 * it first (`holdSheetReturnTargets`) and asks this module to restore it.
 *
 * Two kinds of overlay are watched, both through the overlay stack, where each
 * registers while open:
 * - a `ConfirmDialog` (`confirm-dialog:<id>`, mobile shell only), whose root
 *   keeps `data-sibling-dialog` in the DOM for its 0.15s exit animation;
 * - the Project settings / App preferences modal and `NewProjectModal`, which
 *   have no such marker. Their exit is over once the focused card has left the
 *   DOM and focus has fallen to `<body>`.
 */

import { CONFIRM_DIALOG_OVERLAY_PREFIX } from '@/components/ConfirmDialog'
import { logFrontendError } from '@/lib/log-api'
import {
  NEW_PROJECT_MODAL_OVERLAY_PREFIX,
  SETTINGS_MODAL_OVERLAY_ID,
  useOverlayStackStore
} from '@/stores/overlay-stack-store'

const LOG_SOURCE = 'confirm-focus-return'

/** How long to wait for an overlay to open before giving up (it opens next render). */
export const CONFIRM_APPEAR_TIMEOUT_MS = 1000

/** How long to wait for the closed overlay to leave the DOM (exit animation is 0.15s). */
export const CONFIRM_EXIT_TIMEOUT_MS = 500

const SIBLING_DIALOG_SELECTOR = '[data-sibling-dialog]'

interface WatchedOverlay {
  isWatched: (overlayId: string) => boolean
  hasLeftTheDom: () => boolean
}

function focusIsLost(): boolean {
  const active = document.activeElement
  return !active || active === document.body || !active.isConnected
}

const CONFIRM_DIALOG: WatchedOverlay = {
  isWatched: (id) => id.startsWith(CONFIRM_DIALOG_OVERLAY_PREFIX),
  hasLeftTheDom: () => !document.querySelector(SIBLING_DIALOG_SELECTOR)
}

const SETTINGS_OR_NEW_PROJECT_MODAL: WatchedOverlay = {
  isWatched: (id) =>
    id === SETTINGS_MODAL_OVERLAY_ID || id.startsWith(NEW_PROJECT_MODAL_OVERLAY_PREFIX),
  hasLeftTheDom: focusIsLost
}

function returnFocusAfterOverlay(restore: () => boolean, overlay: WatchedOverlay): () => void {
  let done = false
  let sawOverlay = false
  let appearTimer: ReturnType<typeof setTimeout> | null = null
  let frame: number | null = null
  let unsubscribe: (() => void) | null = null

  const isOverlayOpen = (): boolean =>
    useOverlayStackStore.getState().stack.some((entry) => overlay.isWatched(entry.id))

  const finish = (): void => {
    if (done) return
    done = true
    unsubscribe?.()
    unsubscribe = null
    if (appearTimer !== null) clearTimeout(appearTimer)
    appearTimer = null
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
  }

  const restoreIfFocusLost = (): void => {
    if (!focusIsLost()) return
    if (!restore()) {
      void logFrontendError({
        level: 'info',
        source: LOG_SOURCE,
        message: 'Overlay closed with no connected focus target'
      })
    }
  }

  const waitForExit = (): void => {
    const deadline = Date.now() + CONFIRM_EXIT_TIMEOUT_MS
    const poll = (): void => {
      frame = null
      if (done) return
      if (overlay.hasLeftTheDom()) {
        finish()
        restoreIfFocusLost()
        return
      }
      if (Date.now() >= deadline) {
        finish()
        void logFrontendError({
          level: 'info',
          source: LOG_SOURCE,
          message: 'Overlay still on screen after closing; focus was not restored'
        })
        return
      }
      frame = requestAnimationFrame(poll)
    }
    poll()
  }

  const onStackChange = (): void => {
    if (done || frame !== null) return
    if (isOverlayOpen()) {
      sawOverlay = true
      return
    }
    if (!sawOverlay) return
    // The overlay closed. Stop watching the store; the DOM decides from here.
    unsubscribe?.()
    unsubscribe = null
    if (appearTimer !== null) clearTimeout(appearTimer)
    appearTimer = null
    waitForExit()
  }

  unsubscribe = useOverlayStackStore.subscribe(onStackChange)
  appearTimer = setTimeout(() => {
    appearTimer = null
    if (!sawOverlay) finish()
  }, CONFIRM_APPEAR_TIMEOUT_MS)
  // An overlay that is already open counts as seen.
  onStackChange()

  return finish
}

/**
 * Wait for a confirm to open and then close, and call `restore` once it has
 * left the DOM, but only if focus was lost to `<body>` (a user or a dialog that
 * already put focus somewhere real is never overridden). `restore` returns
 * whether focus landed; `false` is logged at `info`.
 *
 * Gives up, without calling `restore`, when no confirm opens within about a
 * second, or when the closed confirm is still in the DOM after about half a
 * second (another dialog may own focus). Always unsubscribes from the overlay
 * store. Returns a cancel function for callers that unmount first.
 */
export function returnFocusAfterConfirm(restore: () => boolean): () => void {
  return returnFocusAfterOverlay(restore, CONFIRM_DIALOG)
}

/**
 * Same contract for the Project settings / App preferences modal and the New
 * project modal. Focus not yet lost when the half second ends means the user
 * moved it somewhere real, and it is left there.
 */
export function returnFocusAfterModal(restore: () => boolean): () => void {
  return returnFocusAfterOverlay(restore, SETTINGS_OR_NEW_PROJECT_MODAL)
}
