/**
 * The worktree the Workspace-switcher pick resolves to (shell revamp AD-2).
 *
 * Pure: the pick path is passed in (read from the shell-layout store by the
 * caller), so this module only imports types. Every "active worktree" read in
 * production code goes through here.
 */

import { pickedWorkingCopy } from '@/lib/working-copy'
import type { Project, Worktree } from '@/types/project'

/**
 * Why a worktree flagged `outsideProjectRoot` cannot be picked, launched into
 * or opened from this surface. Single source for every disabled row, tooltip
 * and screen-reader text that explains it.
 */
export const OUTSIDE_PROJECT_ROOT_REASON = 'Outside the project folder; open it on the desktop app.'

/**
 * The listed worktree `pickPath` names, or `undefined` when the pick resolves
 * as the project folder (no pick, pruned, disabled/outside-root) or there is
 * no project.
 */
export function activeWorktreeOf(
  project: Pick<Project, 'path' | 'worktrees'> | null | undefined,
  pickPath: string | null | undefined
): Worktree | undefined {
  const wc = pickedWorkingCopy(project, pickPath)
  if (wc?.state !== 'resolved' || wc.kind !== 'worktree') return undefined
  return project?.worktrees?.find((w) => w.id === wc.worktreeId)
}
