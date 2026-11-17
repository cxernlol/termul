import { invokeIpcWrapped } from './ipc/tauri'
import { logFrontendError } from './log-api'
import { isMac } from './platform'
import { isTauriContext } from './tauri-runtime'

/**
 * IPC Command name
 * Must match the Rust command in src-tauri/src/window_chrome/mod.rs
 */
const SET_TRAFFIC_LIGHTS_HIDDEN_COMMAND = 'set_traffic_lights_hidden'

/**
 * Hides or shows the macOS traffic lights (collapsed Rail). Does nothing
 * outside Tauri on macOS: other surfaces draw their own window controls or
 * have none. A failure is logged and the lights stay as they are.
 */
export async function setTrafficLightsHidden(hidden: boolean): Promise<void> {
  if (!isTauriContext() || !isMac) return

  const result = await invokeIpcWrapped<void>(SET_TRAFFIC_LIGHTS_HIDDEN_COMMAND, { hidden })
  if (!result.success) {
    void logFrontendError({
      level: 'warn',
      source: 'tauri-traffic-lights',
      message: `Traffic lights ${hidden ? 'hide' : 'show'} failed: ${result.error}`
    })
  }
}
