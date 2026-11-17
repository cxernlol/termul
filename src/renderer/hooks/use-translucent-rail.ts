import { useEffect } from 'react'
import { logFrontendError } from '@/lib/log-api'
import { isMac } from '@/lib/platform'
import { isTauriContext } from '@/lib/tauri-runtime'
import { Effect, EffectState, getCurrentWindow } from '@/lib/tauri-window'
import {
  useAppearanceMode,
  useAppSettingsLoaded,
  useTranslucentRail
} from '@/stores/app-settings-store'

/** Set on `<html>` while the native sidebar material is behind the window. */
export const TRANSLUCENT_RAIL_ATTR = 'data-translucent-rail'

/**
 * Only the macOS desktop window is transparent (`tauri.macos.conf.json`) and
 * has a native sidebar material. Windows, Linux and the browser stay solid.
 */
export function isTranslucentRailSupported(): boolean {
  return isTauriContext() && isMac
}

// Tracked apart: `setTheme` can succeed while `setEffects` then fails, and
// the theme override applies to the whole app, so off must still undo it.
let themeApplied = false
let effectsApplied = false
let queue: Promise<void> = Promise.resolve()

/**
 * Turn the Rail's native sidebar material on or off.
 *
 * On: the window takes the app's light or dark theme (the material follows
 * the window appearance, not the app theme), then the material goes behind
 * the webview, then the CSS lets it through. Off runs in reverse, so the
 * window never shows a transparent Rail without the material behind it.
 * Calls are serialized so a quick on-off-on cannot finish out of order.
 */
export function applyTranslucentRail(
  enabled: boolean,
  appearance: 'light' | 'dark'
): Promise<void> {
  const update = queue.then(async () => {
    const root = document.documentElement
    const window = getCurrentWindow()
    if (enabled) {
      await window.setTheme(appearance)
      themeApplied = true
      await window.setEffects({
        effects: [Effect.Sidebar],
        state: EffectState.FollowsWindowActiveState
      })
      effectsApplied = true
      root.setAttribute(TRANSLUCENT_RAIL_ATTR, '')
      return
    }
    root.removeAttribute(TRANSLUCENT_RAIL_ATTR)
    if (effectsApplied) {
      await window.clearEffects()
      effectsApplied = false
    }
    if (themeApplied) {
      await window.setTheme(null)
      themeApplied = false
    }
  })
  queue = update.catch(() => {})
  return update
}

/**
 * Keep the window material in sync with the `translucentRail` setting and the
 * app appearance. Mount once at the app root, next to `useAppliedUiZoomSync`.
 */
export function useTranslucentRailSync(): void {
  const isLoaded = useAppSettingsLoaded()
  const enabled = useTranslucentRail()
  const appearance = useAppearanceMode()

  useEffect(() => {
    if (!isLoaded || !isTranslucentRailSupported()) return
    applyTranslucentRail(enabled, appearance).catch((error) => {
      void logFrontendError({
        level: 'error',
        source: 'useTranslucentRailSync',
        message: `Failed to ${enabled ? 'apply' : 'clear'} the translucent Rail: ${error instanceof Error ? error.message : String(error)}`
      })
    })
  }, [isLoaded, enabled, appearance])
}
