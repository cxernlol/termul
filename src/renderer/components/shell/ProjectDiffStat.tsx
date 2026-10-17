import type { GitDiffStat } from '@shared/types/ipc.types'
import { useEffect } from 'react'
import { DiffStatCounts } from '@/components/ui/diff-stat-counts'
import { selectGitDiffStat, useGitStatusStore } from '@/stores/git-status-store'
import type { Project } from '@/types/project'

/**
 * Uncommitted line stat of one Project row, read from the git-status store
 * only (no cache and no git call of its own). While `enabled` and mounted,
 * the row watches its working copy and asks for one refresh right after
 * watching; it unwatches on unmount. A failed refresh stays in the store's
 * `errors`, so the row simply shows nothing.
 *
 * Returns the stat to show, or `null` when there is nothing to show (not
 * watched, no git, not fetched yet, failed, or a clean tree).
 */
export function useProjectDiffStat(project: Project, enabled: boolean): GitDiffStat | null {
  const path = project.path
  const watched = enabled && Boolean(path) && project.isGitRepo !== false
  const stat = useGitStatusStore(selectGitDiffStat(watched ? path : null))

  useEffect(() => {
    if (!watched || !path) return
    const { watchDiffStat, refreshDiffStat } = useGitStatusStore.getState()
    const unwatch = watchDiffStat(path)
    void refreshDiffStat(path)
    return unwatch
  }, [watched, path])

  if (!watched || !stat || (stat.added <= 0 && stat.removed <= 0)) return null
  return stat
}

/** `+N −M` at the right of a Project row; nothing for a zero stat. */
export function ProjectDiffStat({ stat }: { stat: GitDiffStat }): React.JSX.Element {
  return (
    <span
      data-testid="project-diff-stat"
      className="shrink-0 font-mono text-2xs tabular-nums"
      title="Uncommitted changes"
    >
      <DiffStatCounts added={stat.added} removed={stat.removed} omitZero />
    </span>
  )
}
