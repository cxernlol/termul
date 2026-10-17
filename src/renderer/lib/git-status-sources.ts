/**
 * Named refresh sources of the git status store (AD-17), mounted once per
 * renderer root by `useGitStatusRefresh`:
 *
 * - own writes: inside the store itself (stage/commit/push/...).
 * - terminal git events: `terminalApi.onGitStatusChanged` / `onGitBranchChanged`,
 *   routed to the deepest tracked working copy containing the terminal's cwd.
 * - file changes: `scheduleGitStatusRefreshForPath` (`schedule-git-status-refresh.ts`),
 *   called by the file watcher and the editor save path.
 * - window focus: `onWindowFocus` facade (desktop focus / web visibility).
 * - a 30 s interval, only while the document is visible.
 *
 * Focus and interval refresh every tracked key (status + commit context) and the
 * watched diff stats. Failures are stored in the store's `errors` and logged
 * there (`[git-status]`); nothing here swallows them silently.
 */

import { terminalApi } from '@/lib/api'
import { onWindowFocus } from '@/lib/window-focus-api'
import { deepestTrackedKey, useGitStatusStore } from '@/stores/git-status-store'
import { useTerminalStore } from '@/stores/terminal-store'

export const GIT_STATUS_POLL_INTERVAL_MS = 30_000

/** Keys with a refresh running; the value flags one more run requested meanwhile,
 * so a burst of terminal events collapses into a running + one trailing refresh. */
const inFlight = new Map<string, boolean>()

function refreshKeyCoalesced(key: string): void {
  if (inFlight.has(key)) {
    inFlight.set(key, true)
    return
  }
  inFlight.set(key, false)
  const cwd = useGitStatusStore.getState().paths[key]
  const run = cwd ? useGitStatusStore.getState().refreshWorkingCopy(cwd) : Promise.resolve()
  void run.finally(() => {
    const again = inFlight.get(key)
    inFlight.delete(key)
    if (again) refreshKeyCoalesced(key)
  })
}

function onTerminalGitEvent(ptyId: string, branchChanged = false): void {
  const cwd = useTerminalStore.getState().findTerminalByPtyId(ptyId)?.cwd
  if (!cwd) return
  const state = useGitStatusStore.getState()
  const key = deepestTrackedKey(cwd, Object.keys(state.paths))
  if (!key) return
  refreshKeyCoalesced(key)
  // A branch change also invalidates a loaded branch list (only for keys that have one).
  const path = state.paths[key]
  if (branchChanged && path && state.branches[key] !== undefined) {
    void state.fetchBranches(path)
  }
}

function refreshAllTracked(): void {
  void useGitStatusStore.getState().refreshTracked()
}

/** Starts every source; returns one teardown that stops them all. */
export function startGitStatusRefreshSources(): () => void {
  const stopStatus = terminalApi.onGitStatusChanged((ptyId) => onTerminalGitEvent(ptyId))
  const stopBranch = terminalApi.onGitBranchChanged((ptyId) => onTerminalGitEvent(ptyId, true))
  const stopFocus = onWindowFocus(refreshAllTracked)
  const interval = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    refreshAllTracked()
  }, GIT_STATUS_POLL_INTERVAL_MS)

  return () => {
    stopStatus()
    stopBranch()
    stopFocus()
    clearInterval(interval)
    inFlight.clear()
  }
}
