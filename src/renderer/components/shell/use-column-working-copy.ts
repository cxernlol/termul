import { pickedWorkingCopy } from '@/lib/working-copy'
import { useWorktreePick } from '@/stores/shell-layout-store'
import type { Project } from '@/types/project'

/**
 * The working copy the Side panel columns read: the project's worktree pick
 * when it resolves, else the project folder. `worktreeBranch` is set only for
 * a resolved worktree pick. Read-only (the pick is written elsewhere).
 */
export function useColumnWorkingCopy(project: Project | undefined): {
  cwd: string
  worktreeBranch: string | undefined
} {
  const pick = useWorktreePick(project?.id ?? '')
  const picked = pickedWorkingCopy(project, pick)
  const cwd = picked?.path ?? project?.path ?? ''
  const worktreeBranch =
    picked?.state === 'resolved' && picked.kind === 'worktree'
      ? (project?.worktrees ?? []).find((w) => w.id === picked.worktreeId)?.branch
      : undefined
  return { cwd, worktreeBranch }
}
