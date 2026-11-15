import type { BaseBranchInfo } from '@shared/types/worktree.types'
import { useEffect, useMemo, useState } from 'react'
import { logFrontendError } from '@/lib/log-api'
import { worktreeApi } from '@/lib/worktree-api'
import type { LaunchIsolationMode } from './prepare-launch-worktree'

export interface BaseBranchChoices {
  baseBranchInfo: BaseBranchInfo | null
  /** Local branch names (detached-HEAD users can pick any of them). */
  branches: string[]
  /** Deduplicated picker options: current branch first (marked), then the default, then the rest. */
  baseOptions: { value: string; label: string }[]
}

/**
 * The base-branch picker of a New worktree pick (CAP-2), shared by the agent
 * launcher and an empty chat's context row. It resolves the origin-aware
 * default base and the local branches once per git project, fills the pick
 * with the default when New worktree is chosen (not on a detached HEAD: the
 * user must pick), and falls back to the default when the picked branch is
 * gone.
 */
export function useBaseBranchChoices({
  projectRoot,
  canUseWorktree,
  projectGitBranch,
  isolationMode,
  baseBranch,
  setBaseBranch,
  logSource = 'agentLauncher.resolveBaseBranch'
}: {
  projectRoot: string | undefined
  canUseWorktree: boolean
  projectGitBranch: string | null
  isolationMode: LaunchIsolationMode
  baseBranch: string | null
  setBaseBranch: (branch: string | null) => void
  logSource?: string
}): BaseBranchChoices {
  const [baseBranchInfo, setBaseBranchInfo] = useState<BaseBranchInfo | null>(null)
  const [branches, setBranches] = useState<string[]>([])

  useEffect(() => {
    if (!canUseWorktree || !projectRoot) return
    let cancelled = false
    void (async () => {
      try {
        const result = await worktreeApi.resolveBaseBranch(projectRoot)
        if (cancelled) return
        if (result.success && result.data) {
          setBaseBranchInfo(result.data)
          const branchResult = await worktreeApi.branches(projectRoot)
          if (cancelled) return
          if (branchResult.success && branchResult.data) {
            setBranches(branchResult.data.filter((b) => !b.isRemote).map((b) => b.name))
          }
        } else {
          void logFrontendError({
            level: 'warn',
            source: logSource,
            message: `resolveBaseBranch failed: ${result.success ? '' : result.error}`
          })
        }
      } catch (err) {
        if (!cancelled) {
          void logFrontendError({
            level: 'warn',
            source: logSource,
            message: `resolveBaseBranch threw: ${String(err)}`
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canUseWorktree, projectRoot, logSource])

  // Entering New worktree fills the resolved default; a detached HEAD skips it.
  useEffect(() => {
    if (isolationMode !== 'worktree' || baseBranch || !baseBranchInfo || baseBranchInfo.isDetached)
      return
    setBaseBranch(baseBranchInfo.defaultBase)
  }, [isolationMode, baseBranch, baseBranchInfo, setBaseBranch])

  // A restored branch may be gone once the list loads: use the default then.
  useEffect(() => {
    if (isolationMode !== 'worktree' || !baseBranch || branches.length === 0) return
    if (branches.includes(baseBranch)) return
    if (baseBranchInfo?.defaultBase) setBaseBranch(baseBranchInfo.defaultBase)
  }, [isolationMode, baseBranch, branches, baseBranchInfo, setBaseBranch])

  const baseOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: { value: string; label: string }[] = []
    const add = (value: string | undefined | null, isCurrent = false): void => {
      if (!value || seen.has(value)) return
      seen.add(value)
      out.push({ value, label: isCurrent ? `${value} (current)` : value })
    }
    add(baseBranchInfo?.currentBranch, true)
    add(baseBranchInfo?.defaultBase)
    add(projectGitBranch, true)
    for (const b of branches) add(b)
    return out
  }, [baseBranchInfo, projectGitBranch, branches])

  return { baseBranchInfo, branches, baseOptions }
}
