/**
 * Store-bound binding of the working-copy resolver (shell revamp AD-1, CAP-7).
 *
 * `lib/working-copy.ts` stays pure; this module only GATHERS its inputs from
 * the live stores (active pane tab, ACP session cwd, terminal cwd, the
 * Workspace-switcher pick) and calls `resolveActiveWorkingCopy`. It never
 * computes or compares paths itself.
 *
 * Resolution order: the active tab's working copy, else the pick (a pruned or
 * surface-disabled pick resolves as the project folder), else the project
 * folder. An `unresolved` result (a managed worktree directory that no listed
 * worktree contains) never falls back to the project folder; consumers refuse
 * the action and call {@link reportUnresolvedWorkingCopy}, which reconciles
 * `project.worktrees` once per distinct unresolved key.
 */

import { logFrontendError } from '@/lib/log-api'
import {
  resolveActiveWorkingCopy,
  type TabPathSources,
  type WorkingCopy,
  workingCopyOf
} from '@/lib/working-copy'
import { reconcileProjectWorktrees } from '@/lib/worktree-reconciler'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { useShellLayoutStore } from '@/stores/shell-layout-store'
import { useTerminalStore } from '@/stores/terminal-store'
import { getAllLeafPanes, useWorkspaceStore, type WorkspaceTab } from '@/stores/workspace-store'
import type { Project } from '@/types/project'

/** The active tab of the active pane (first pane when the active id is stale). */
function readActiveTab(): WorkspaceTab | null {
  const { root, activePaneId } = useWorkspaceStore.getState()
  const leaves = getAllLeafPanes(root)
  const pane = leaves.find((p) => p.id === activePaneId) ?? leaves[0]
  return pane?.tabs.find((t) => t.id === pane.activeTabId) ?? null
}

/** The resolver's path sources, read from the live stores at call time. */
function liveSources(): TabPathSources {
  return {
    sessionCwd: (id) => useAcpStore.getState().sessions[id]?.cwd,
    terminalCwd: (id) => useTerminalStore.getState().terminals.find((t) => t.id === id)?.cwd
  }
}

/**
 * The working copy the active tab / pick / project folder resolve to for
 * `projectId` (default: the active project), or `null` without such a project.
 */
export function getActiveWorkingCopy(projectId?: string): WorkingCopy | null {
  const { projects, activeProjectId } = useProjectStore.getState()
  const id = projectId ?? activeProjectId
  const project = projects.find((p) => p.id === id)
  if (!project) return null
  return resolveActiveWorkingCopy({
    project,
    activeTab: readActiveTab(),
    pickedPath: useShellLayoutStore.getState().worktreePickByProject[project.id],
    sources: liveSources()
  })
}

/**
 * True when `cwd` is a path git writes must refuse: unresolved for some
 * project (a managed worktree directory no listed worktree contains) and
 * resolved for none. Paths no project knows are explicit paths and stay
 * writable.
 */
export function isGitWriteBlocked(
  cwd: string | null | undefined,
  projects: ReadonlyArray<Pick<Project, 'path' | 'worktrees'>>
): boolean {
  if (!cwd) return false
  let unresolved = false
  for (const project of projects) {
    const wc = workingCopyOf(cwd, project)
    if (wc?.state === 'resolved') return false
    if (wc?.state === 'unresolved') unresolved = true
  }
  return unresolved
}

/** `${projectId}\0${unresolvedKey}` pairs whose reconcile already ran. */
const reconciledUnresolved = new Set<string>()

/**
 * Reconcile the project's worktree list once per distinct unresolved key
 * while one is in flight (`reconcileProjectWorktrees` is itself single-flight) and log one
 * `[working-copy]` outcome record. A no-op for a resolved/absent working copy
 * or a key already reconciled. Returns whether a reconcile was started.
 */
export function reportUnresolvedWorkingCopy(
  projectId: string,
  wc: WorkingCopy | null | undefined
): boolean {
  if (!projectId || wc?.state !== 'unresolved') return false
  const dedupeKey = `${projectId}\0${wc.key}`
  if (reconciledUnresolved.has(dedupeKey)) return false
  reconciledUnresolved.add(dedupeKey)
  // The key is only held while a reconcile is in flight: a later action may
  // retry after a failure or an unchanged listing.
  void reconcileProjectWorktrees(projectId)
    .then((outcome) => {
      reconciledUnresolved.delete(dedupeKey)
      void logFrontendError({
        level: 'info',
        source: 'working-copy',
        message: `[working-copy] unresolved ${wc.key} (project ${projectId}): reconcile ${outcome}`
      })
    })
    .catch((error: unknown) => {
      reconciledUnresolved.delete(dedupeKey)
      void logFrontendError({
        level: 'warn',
        source: 'working-copy',
        message: `[working-copy] unresolved ${wc.key} (project ${projectId}): reconcile failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      })
    })
  return true
}

/** Test-only: forget which unresolved keys already reconciled. */
export function resetReconciledUnresolvedForTests(): void {
  reconciledUnresolved.clear()
}
