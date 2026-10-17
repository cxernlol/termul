/**
 * Window-focus facade. Desktop (Tauri) reports the native window gaining focus;
 * the web client (browser tab, remote/phone) reports the document becoming
 * visible. Callers get one transport-neutral "the user came back" signal and
 * never touch `@tauri-apps/api/window` or `visibilitychange` directly.
 */

import { logFrontendError } from '@/lib/log-api'
import { cleanupTauriListener, isTauriContext } from '@/lib/tauri-runtime'
import { getCurrentWindow } from '@/lib/tauri-window'

/**
 * Calls `callback` each time the app window regains focus (desktop) or the
 * document becomes visible (web). Returns an idempotent unsubscribe function.
 */
export function onWindowFocus(callback: () => void): () => void {
  if (isTauriContext()) {
    let unlisten: Promise<() => void> | undefined
    try {
      unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) callback()
      })
      void unlisten.catch((error: unknown) => {
        void logFrontendError({
          level: 'warn',
          message: `[window-focus] focus listener failed: ${error instanceof Error ? error.message : String(error)}`,
          source: 'window-focus-api'
        })
      })
    } catch (error) {
      void logFrontendError({
        level: 'warn',
        message: `[window-focus] focus listener unavailable: ${error instanceof Error ? error.message : String(error)}`,
        source: 'window-focus-api'
      })
    }
    return () => {
      cleanupTauriListener(unlisten)
      unlisten = undefined
    }
  }

  if (typeof document === 'undefined') return () => {}
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') callback()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => document.removeEventListener('visibilitychange', onVisibilityChange)
}
