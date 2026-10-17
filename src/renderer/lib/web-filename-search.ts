import type { SearchFileHit } from '@shared/types/ipc.types'
import { logFrontendError } from './log-api'
import { webServerSearch } from './web-server-api'

// ----- Web filename-search event channel (issue #848) ------------------------
//
// The desktop transport streams `search-file-names-batch`/-`done` Tauri
// events. On web there is no Tauri event bus, so `searchFileNamesStreamStart`
// runs the one-shot `GET /search/file-names` HTTP request and fans its result
// out through this emitter to the SAME `onSearchFileNamesBatch`/
// `onSearchFileNamesDone` callbacks. Consumers (composer mentions hook,
// file-explorer store) keep one code path: start → batch → done.

type WebFileNameBatchEvent = { searchId: string; files: SearchFileHit[]; truncated?: boolean }
type WebFileNameDoneEvent = {
  searchId: string
  truncated: boolean
  totalFiles: number
  code?: string
  error?: string
}

export const webFileNameBatchCallbacks = new Set<(event: WebFileNameBatchEvent) => void>()
export const webFileNameDoneCallbacks = new Set<(event: WebFileNameDoneEvent) => void>()

function emitWebFileNameBatch(event: WebFileNameBatchEvent): void {
  for (const cb of webFileNameBatchCallbacks) cb(event)
}

function emitWebFileNameDone(event: WebFileNameDoneEvent): void {
  for (const cb of webFileNameDoneCallbacks) cb(event)
}

/**
 * Run the web one-shot filename search and emit the batch + done events for
 * `searchId`. A superseded search (its `searchId` was cancelled/replaced
 * before the response landed) is dropped silently — the desktop contract
 * does the same by ignoring stale ids at the listener. Failures surface as
 * a done event carrying the transport error, never as a rejected promise.
 */
export async function runWebFileNameSearch(
  searchId: string,
  rootPath: string,
  query: string,
  includeIgnored: boolean
): Promise<void> {
  try {
    const data = await webServerSearch.fileNames(rootPath, query, includeIgnored)
    if (cancelledWebFileNameSearches.has(searchId)) return
    emitWebFileNameBatch({
      searchId,
      files: data.files,
      truncated: data.truncated
    })
    emitWebFileNameDone({
      searchId,
      truncated: data.truncated,
      totalFiles: data.files.length
    })
  } catch (err) {
    if (cancelledWebFileNameSearches.has(searchId)) return
    logFrontendError({
      level: 'warn',
      source: 'tauri-filesystem-api.webFileNameSearch',
      message: `web filename search failed: ${err instanceof Error ? err.message : String(err)}`
    })
    emitWebFileNameDone({
      searchId,
      truncated: false,
      totalFiles: 0,
      code: 'NETWORK_ERROR',
      error: err instanceof Error ? err.message : String(err)
    })
  } finally {
    cancelledWebFileNameSearches.delete(searchId)
  }
}

/** Search ids cancelled via `searchFileNamesStreamCancel` before completion. */
export const cancelledWebFileNameSearches = new Set<string>()

/** @internal Testing only - reset module state */
export function _resetWebFileNameSearchForTesting(): void {
  webFileNameBatchCallbacks.clear()
  webFileNameDoneCallbacks.clear()
  cancelledWebFileNameSearches.clear()
}
