import { useEffect } from 'react'
import { normalizePath } from '@/lib/working-copy'
import { useGitStatusStore } from '@/stores/git-status-store'
import { useProjectStore } from '@/stores/project-store'
import type { Project } from '@/types/project'

/**
 * Auto-detect the active project's current git branch and seed
 * `project.gitBranch` with the real HEAD branch — instead of showing a stale
 * hardcoded 'main' in the status bar before any terminal has reported a branch
 * (or when the project has no active terminal at all).
 *
 * Runs on active-project change. Skips projects that are not git repos or have
 * no path. Goes through the git status store (`fetchCommitContext`, the single
 * git cache), which is transport-neutral (desktop invoke / same-origin server
 * HTTP), so the status bar reflects the real branch on both desktop and the
 * termul-server web/remote client.
 *
 * A successful probe (a resolvable HEAD commit) also stamps `isGitRepo: true`.
 * On desktop the worktree reconciler already flips that flag, but on web it
 * early-returns (`isTauriContext()` gate) and `ProjectSummary` carries no git
 * fields — this success path is what lets the web launcher's worktree
 * isolation strip (`canUseWorktree`) appear for a git-repo project.
 *
 * A detached HEAD (`branch: null`) clears the stored `project.gitBranch` so the
 * status bar shows 'detached' truthfully rather than a stale prior branch.
 * The stamp is driven by the cached commit context, not by this hook's own
 * fetch result: the store hands a superseded fetch `null` when another surface
 * (status bar, Changes panel) fetches the same working copy at the same time,
 * and the branch must still land from whichever fetch wins.
 *
 * Best-effort: a fetch failure leaves the existing (or absent) value alone;
 * the manual GitBranchPicker switch path still updates `gitBranch`, and the
 * per-terminal git branch events (useGitBranch) take precedence in the status
 * bar once a terminal reports its branch.
 */
export function useProjectGitBranch(): void {
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const updateProject = useProjectStore((state) => state.updateProject)
  // Only the fields the probe needs, so unrelated project edits do not re-run it.
  const path = useProjectStore(
    (state) => state.projects.find((p) => p.id === activeProjectId)?.path ?? null
  )
  const knownNonGit = useProjectStore(
    (state) => state.projects.find((p) => p.id === activeProjectId)?.isGitRepo === false
  )
  const context = useGitStatusStore((state) =>
    path ? state.commitContexts[normalizePath(path)] : undefined
  )

  // No path or known non-git → nothing to detect. `isGitRepo` is undefined for
  // fresh projects (not yet reconciled) — still attempt detection so a repo is
  // detected on first activation rather than only after the worktree
  // reconciler flips the flag.
  const probe = activeProjectId !== '' && path !== null && !knownNonGit

  useEffect(() => {
    if (!probe || !path) return
    // The store stores and logs a failed fetch (`[git-status]`) and resolves
    // `null`, so there is nothing to catch or log here.
    void useGitStatusStore.getState().fetchCommitContext(path)
  }, [probe, path])

  useEffect(() => {
    // Not a git repo, git missing, or fetch failed → no cached context; leave
    // the existing value alone. The worktree reconciler handles isGitRepo
    // separately.
    if (!probe || !context) return
    const project: Project | undefined = useProjectStore
      .getState()
      .projects.find((p) => p.id === activeProjectId)
    if (!project) return
    // branch is null on a detached HEAD / no-branch state — clear the stored
    // value so the status bar renders 'detached' truthfully instead of a stale
    // prior branch. `hasHead: true` (HEAD resolves) means the path IS a git
    // repo — stamp it so capability gates (worktree isolation picker) hold the
    // same truth on web as the desktop reconciler provides. The route still
    // succeeds with `hasHead: false` for a non-repo path, so the flag must NOT
    // be stamped then.
    const gitBranch = context.branch ?? undefined
    const stampRepo = context.hasHead && project.isGitRepo !== true
    if (project.gitBranch === gitBranch && !stampRepo) return
    updateProject(activeProjectId, {
      gitBranch,
      ...(stampRepo ? { isGitRepo: true } : {})
    })
  }, [probe, context, activeProjectId, updateProject])
}
