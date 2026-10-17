import { deepestTrackedKey, useGitStatusStore } from '@/stores/git-status-store'

const DEBOUNCE_MS = 1000

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function shouldCompareCaseInsensitively(path: string, root: string): boolean {
  return (
    /^[a-zA-Z]:\//.test(path) ||
    /^[a-zA-Z]:\//.test(root) ||
    path.startsWith('//') ||
    root.startsWith('//')
  )
}

/** True when `filePath` is inside or equal to the git repo root `repoCwd`. */
export function isPathWithinRepo(filePath: string, repoCwd: string): boolean {
  const path = normalizePath(filePath)
  const root = normalizePath(repoCwd).replace(/\/$/, '')
  const caseInsensitive = shouldCompareCaseInsensitively(path, root)
  const comparablePath = caseInsensitive ? path.toLowerCase() : path
  const comparableRoot = caseInsensitive ? root.toLowerCase() : root
  return comparablePath === comparableRoot || comparablePath.startsWith(`${comparableRoot}/`)
}

const pendingKeys = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Debounced refresh of git status (and the diff stat, when watched) for the
 * deepest tracked working copy whose folder contains `filePath`. No-op when no
 * tracked working copy contains it. This is the file-change source of the git
 * status store (AD-17).
 */
export function scheduleGitStatusRefreshForPath(filePath: string): void {
  const key = deepestTrackedKey(filePath, Object.keys(useGitStatusStore.getState().paths))
  if (!key) return
  pendingKeys.add(key)

  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    const state = useGitStatusStore.getState()
    for (const pending of pendingKeys) {
      const cwd = state.paths[pending]
      if (!cwd) continue
      // Failures are stored in `errors` and logged by the store.
      void state.refreshStatus(cwd).catch(() => {})
      void state.refreshDiffStat(cwd)
    }
    pendingKeys.clear()
    flushTimer = null
  }, DEBOUNCE_MS)
}

/** Test-only reset of module-level debounce state. */
export function resetGitStatusRefreshSchedulerForTests(): void {
  pendingKeys.clear()
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
}
