import type { FileChangeCallback, FileChangeEvent } from '@shared/types/ipc.types'
import type { WatchEvent } from '@tauri-apps/plugin-fs'

/**
 * Watch event types dispatched by the Tauri watcher (mapped from notify kinds).
 * Type filtering is an internal facade detail — the shared `FilesystemApi`
 * contract keeps one `FileChangeCallback` signature per subscription method.
 */
type FileWatchEventType = 'change' | 'add' | 'unlink'

/** Registry of callbacks keyed by the event types they subscribed for. */
type TypedCallbackRegistry = Map<FileChangeCallback, Set<FileWatchEventType>>

export function registerTypedCallback(
  registry: TypedCallbackRegistry,
  callback: FileChangeCallback,
  eventType: FileWatchEventType
): void {
  const types = registry.get(callback)
  if (types) {
    types.add(eventType)
  } else {
    registry.set(callback, new Set([eventType]))
  }
}

export function unregisterTypedCallback(
  registry: TypedCallbackRegistry,
  callback: FileChangeCallback,
  eventType: FileWatchEventType
): void {
  const types = registry.get(callback)
  if (!types) return
  types.delete(eventType)
  if (types.size === 0) {
    registry.delete(callback)
  }
}

export function dispatchTypedEvent(
  registry: TypedCallbackRegistry,
  eventType: FileWatchEventType,
  event: FileChangeEvent
): void {
  registry.forEach((types, callback) => {
    if (types.has(eventType)) {
      callback(event)
    }
  })
}

/**
 * Access events (open, read, close) are not changes: a real write also fires
 * `modify`, so dropping close-after-write loses nothing. inotify reports a
 * rename as `from`, `to` and then `both`; the first two already carry each
 * path, so `both` is dropped.
 */
export function toFileWatchEventType(kind: WatchEvent['type']): FileWatchEventType | null {
  if (typeof kind !== 'object') return 'change'
  if ('access' in kind) return null
  if ('create' in kind) return 'add'
  if ('remove' in kind) return 'unlink'
  if ('modify' in kind && kind.modify.kind === 'rename') {
    if (kind.modify.mode === 'from') return 'unlink'
    if (kind.modify.mode === 'to') return 'add'
    if (kind.modify.mode === 'both') return null
  }
  return 'change'
}

export const activeCallbacks = new Map<string, TypedCallbackRegistry>()
export const globalCallbacks: TypedCallbackRegistry = new Map()

/** @internal Testing only - reset module state */
export function _resetWatchEventStateForTesting(): void {
  activeCallbacks.clear()
  globalCallbacks.clear()
}
