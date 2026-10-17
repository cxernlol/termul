import type { FileChangeEvent, IpcResult } from '@shared/types/ipc.types'
import type {
  FsWatchChangeDelta,
  FsWatchDelta,
  FsWatchState
} from '@shared/types/web-protocol.types'
import { useProjectStore } from '@/stores/project-store'
import { getAcpTransport } from './acp-transport'
import { dispatchTypedEvent, globalCallbacks } from './filesystem-watch-events'
import { logFrontendError } from './log-api'

/**
 * Web/remote watch bookkeeping: normalized watched directory → the registered
 * project whose host watch serves it, and a refcount per project so the host
 * `fs` watch is requested once per project, not once per directory.
 */
const webWatchedDirs = new Map<string, string>()
const webProjectWatchRefs = new Map<string, number>()

function normalizeWatchPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized
}

/**
 * The registered, non-archived project whose root contains `dirPath` (the
 * longest matching root wins), or `null` when none does.
 */
function resolveWatchProjectId(dirPath: string): string | null {
  const target = normalizeWatchPath(dirPath)
  let bestId: string | null = null
  let bestLength = -1
  for (const project of useProjectStore.getState().projects) {
    if (!project.path || project.isArchived) continue
    const root = normalizeWatchPath(project.path)
    const prefix = root.endsWith('/') ? root : `${root}/`
    const contains = target === root || target.startsWith(prefix)
    if (contains && root.length > bestLength) {
      bestId = project.id
      bestLength = root.length
    }
  }
  return bestId
}

// ---------------------------------------------------------------------------
// #856: web FS-change watch — the host's `fs` watch deltas → the shared
// onFileChanged/onFileCreated/onFileDeleted callback chain.
// ---------------------------------------------------------------------------

/** Releases of the `fs` watch subscription, per project. */
const webFsSubscriptions = new Map<string, () => void>()
/** Projects whose `fs` watch already delivered a state: a later state is a resubscribe. */
const webFsStateSeen = new Set<string>()

function logWebWatchFailure(source: string, projectId: string, err: unknown): void {
  void logFrontendError({
    level: 'warn',
    source: `tauri-filesystem-api.${source}`,
    message: `Host watch for project ${projectId} failed: ${
      err instanceof Error ? err.message : String(err)
    }`
  })
}

/**
 * Web live refresh is best-effort: a host watch that cannot be set up (project
 * gone, socket down) is logged and the call still succeeds, so the explorer
 * root loads without a live-refresh subscription. The directory and its
 * refcount are claimed synchronously BEFORE the watch is requested, so a delta
 * that races the state frame is not dropped; the watch client asks the host
 * (and asks again after a reconnect), and a refusal re-arms with backoff.
 */
export async function watchWebDirectory(dirPath: string): Promise<IpcResult<void>> {
  const normalized = normalizeWatchPath(dirPath)
  if (webWatchedDirs.has(normalized)) return { success: true, data: undefined }
  const projectId = resolveWatchProjectId(dirPath)
  if (!projectId) return { success: true, data: undefined }
  const watchedBefore = webProjectWatchRefs.has(projectId)
  claimWebWatch(normalized, projectId)
  // Directories of this project whose host watch ended and are still wanted
  // rejoin the active bookkeeping NOW, so unwatching this directory cannot
  // release the project while they remain mounted.
  const adopted = [...(webLostWatchDirs.get(projectId) ?? [])].filter(
    (dir) => !webWatchedDirs.has(dir)
  )
  webLostWatchDirs.delete(projectId)
  for (const dir of adopted) claimWebWatch(dir, projectId)
  if (!watchedBefore) startProjectFsWatch(projectId)
  return { success: true, data: undefined }
}

function claimWebWatch(normalizedDir: string, projectId: string): void {
  webWatchedDirs.set(normalizedDir, projectId)
  webProjectWatchRefs.set(projectId, (webProjectWatchRefs.get(projectId) ?? 0) + 1)
}

export async function unwatchWebDirectory(dirPath: string): Promise<IpcResult<void>> {
  const normalized = normalizeWatchPath(dirPath)
  for (const lost of webLostWatchDirs.values()) lost.delete(normalized)
  const projectId = webWatchedDirs.get(normalized)
  if (!projectId) return { success: true, data: undefined }
  webWatchedDirs.delete(normalized)
  const refs = (webProjectWatchRefs.get(projectId) ?? 1) - 1
  if (refs > 0) {
    webProjectWatchRefs.set(projectId, refs)
    return { success: true, data: undefined }
  }
  webProjectWatchRefs.delete(projectId)
  stopProjectFsWatch(projectId)
  return { success: true, data: undefined }
}

/** Delays before each attempt to re-arm a watch the host ended (e.g. a root that vanished briefly). */
const REWATCH_DELAYS_MS = [2_000, 10_000, 30_000]
/** Directories whose host watch ended and are still wanted by the explorer, per project. */
const webLostWatchDirs = new Map<string, Set<string>>()
/** Pending re-arm timer per project. */
const webRewatchTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** Re-arm attempts made since the project's watch last delivered a state. */
const webRewatchAttempts = new Map<string, number>()

/**
 * Subscribe to the host's `fs` watch of a project: the first state frame means
 * the watch is live; a later one means the stream was interrupted (reconnect,
 * lost delta, host restart), so every watched directory refreshes; each delta
 * feeds the shared callback chain; a final `ended` delta or a refusal forgets
 * the watch and re-arms the still-wanted directories with backoff.
 */
function startProjectFsWatch(projectId: string): void {
  const watches = getAcpTransport().watches
  if (!watches) return
  webFsStateSeen.delete(projectId)
  const release = watches.subscribe<FsWatchState, FsWatchDelta>(
    'fs',
    {
      onState: () => {
        webRewatchAttempts.delete(projectId)
        if (webFsStateSeen.has(projectId)) refreshWatchedDirs(projectId)
        else webFsStateSeen.add(projectId)
      },
      onDelta: (delta) => {
        // Only projects this client still wants (a late delta after unwatch).
        if (!webProjectWatchRefs.has(projectId) || !delta) return
        if ('ended' in delta) {
          rearmEndedWatch(projectId)
          return
        }
        if (!Array.isArray(delta.paths)) return
        for (const event of fsChangedPathsToEvents(delta)) {
          // 'change' feeds every subscriber that registered for 'change'; the
          // create/delete-typed subscribers are served by the desktop
          // watcher's precise kinds — on web the tree refresh (the actual #856
          // acceptance) is driven by 'change'.
          dispatchTypedEvent(globalCallbacks, 'change', event)
        }
      },
      onRefused: (error) => {
        logWebWatchFailure('startProjectFsWatch', projectId, error)
        rearmEndedWatch(projectId)
      }
    },
    projectId
  )
  webFsSubscriptions.set(projectId, release)
}

function stopProjectFsWatch(projectId: string): void {
  webFsStateSeen.delete(projectId)
  const release = webFsSubscriptions.get(projectId)
  webFsSubscriptions.delete(projectId)
  release?.()
}

/**
 * A new `fs` state after the first: changes may have been missed. Report one
 * change inside each watched directory, so the explorer refreshes it.
 */
function refreshWatchedDirs(projectId: string): void {
  for (const [dir, id] of webWatchedDirs) {
    if (id !== projectId) continue
    const path = dir.endsWith('/') ? `${dir}.` : `${dir}/.`
    dispatchTypedEvent(globalCallbacks, 'change', { type: 'change', path })
  }
}

/**
 * The host ended a project's watch or refused it: forget it, remember which
 * directories were watched, and retry a few times with backoff so live refresh
 * comes back when the project becomes watchable again. A directory unwatched
 * meanwhile is not re-armed.
 */
function rearmEndedWatch(projectId: string): void {
  const dirs = new Set<string>()
  for (const [dir, id] of webWatchedDirs) {
    if (id === projectId) dirs.add(dir)
  }
  forgetWebProjectWatch(projectId)
  if (dirs.size === 0) return
  webLostWatchDirs.set(projectId, dirs)
  scheduleRewatch(projectId)
}

function scheduleRewatch(projectId: string): void {
  const attempt = webRewatchAttempts.get(projectId) ?? 0
  const delay = REWATCH_DELAYS_MS[attempt]
  const pending = webRewatchTimers.get(projectId)
  if (pending) clearTimeout(pending)
  if (delay === undefined) {
    webRewatchTimers.delete(projectId)
    webLostWatchDirs.delete(projectId)
    webRewatchAttempts.delete(projectId)
    return
  }
  webRewatchAttempts.set(projectId, attempt + 1)
  const timer = setTimeout(() => {
    webRewatchTimers.delete(projectId)
    const first = webLostWatchDirs.get(projectId)?.values().next().value
    // Re-watched by a caller meanwhile (which adopted the lost directories),
    // or nothing is wanted any more.
    if (first === undefined) {
      webLostWatchDirs.delete(projectId)
      webRewatchAttempts.delete(projectId)
      return
    }
    // Claims every lost directory of the project together.
    void watchWebDirectory(first)
  }, delay)
  webRewatchTimers.set(projectId, timer)
}

/** Drop all client bookkeeping for a project whose host watch ended. */
function forgetWebProjectWatch(projectId: string): void {
  webProjectWatchRefs.delete(projectId)
  for (const [dir, id] of webWatchedDirs) {
    if (id === projectId) webWatchedDirs.delete(dir)
  }
  stopProjectFsWatch(projectId)
}

/**
 * Map one `fs` delta to subscription events. A path that no longer exists was
 * deleted (`unlink`); anything else is reported as a `change` — the explorer
 * refreshes the parent directory either way, and `useFileWatcher` only closes
 * open editor tabs on genuine unlinks. (The batch carries no per-path kind, and
 * stat-ing every path would add a round trip per event; the consumers are
 * refresh-driven, so a conservative `change` is sufficient and never closes a
 * live tab.)
 */
function fsChangedPathsToEvents(delta: FsWatchChangeDelta): FileChangeEvent[] {
  // CodeRabbit: the server normalizes each path to forward slashes but the
  // root may still carry native backslashes (Windows) — normalize BOTH
  // before the prefix check or every change for that root is dropped.
  const normalizedRoot = delta.root.replaceAll('\\', '/')
  return delta.paths
    .filter((path) => path.replaceAll('\\', '/').startsWith(normalizedRoot))
    .map((path) => ({ type: 'change' as const, path }))
}

/** @internal Testing only - reset module state */
export function _resetWebFsWatchForTesting(): void {
  webWatchedDirs.clear()
  webProjectWatchRefs.clear()
  for (const release of webFsSubscriptions.values()) release()
  webFsSubscriptions.clear()
  webFsStateSeen.clear()
  for (const timer of webRewatchTimers.values()) clearTimeout(timer)
  webRewatchTimers.clear()
  webRewatchAttempts.clear()
  webLostWatchDirs.clear()
}
