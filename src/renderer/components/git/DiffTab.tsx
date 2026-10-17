import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { GitDiffPane } from '@/components/git/GitDiffPane'
import { useServerAdmitsRemoteWrites } from '@/hooks/use-server-admits-remote-writes'
import { logFrontendError } from '@/lib/log-api'
import { type GitDiffViewMode, loadGitDiffViewMode } from '@/lib/parse-unified-diff'
import { diffKey, useGitStatusStore } from '@/stores/git-status-store'

interface DiffTabProps {
  /** The tab's stored working copy path. Never re-resolved. */
  cwd: string
  /** Repo-relative path of the new side. */
  path: string
  staged: boolean
  isVisible: boolean
}

const READ_ONLY_REASON = 'This server is read-only for remote clients.'

/**
 * Main-area Diff tab (CAP-9): one file's staged or working-tree diff, with
 * hunk stage/unstage against the tab's own working copy. Reads and refreshes
 * through `git-status-store`; a failed load shows a Retry state instead of
 * "No diff available". Write gating uses `useServerAdmitsRemoteWrites`
 * (`components/ui/write-gate.tsx` does not exist in this tree).
 */
export function DiffTab({ cwd, path, staged, isVisible }: DiffTabProps): React.JSX.Element {
  const key = diffKey(cwd, path, staged)
  const diff = useGitStatusStore((state) => state.diffs[key])
  const error = useGitStatusStore((state) => state.diffErrors[key])
  const fetchDiff = useGitStatusStore((state) => state.fetchDiff)
  const stageHunk = useGitStatusStore((state) => state.stageHunk)
  const unstageHunk = useGitStatusStore((state) => state.unstageHunk)
  const admitsWrites = useServerAdmitsRemoteWrites()

  const [diffViewMode, setDiffViewMode] = useState<GitDiffViewMode>(loadGitDiffViewMode)
  const [isMutating, setIsMutating] = useState(false)
  // Synchronous guard: a fast second click must not build a patch from the
  // pre-mutation diff and apply it at a shifted offset.
  const hunkInFlight = useRef(false)
  const loadInFlight = useRef<string | null>(null)
  const wasVisible = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback((): void => {
    if (loadInFlight.current === key) return
    loadInFlight.current = key
    void fetchDiff(cwd, path, staged, { notify: false }).finally(() => {
      if (loadInFlight.current === key) loadInFlight.current = null
      if (!mounted.current) return
      // A mutation can invalidate the key while this fetch is in flight, which
      // discards the response; load again so the tab never sits on the spinner.
      const state = useGitStatusStore.getState()
      if (state.diffs[key] === undefined && state.diffErrors[key] === undefined) load()
    })
  }, [cwd, path, staged, key, fetchDiff])

  const needsFetch = diff === undefined && error === undefined
  useEffect(() => {
    if (!isVisible) {
      wasVisible.current = false
      return
    }
    const becameVisible = !wasVisible.current
    wasVisible.current = true
    // Missing cache (first open, or invalidated by a write) and a re-shown tab
    // both read through the store, so an externally edited file is not stale.
    if (needsFetch || becameVisible) load()
  }, [isVisible, needsFetch, load])

  const runHunk = useCallback(
    async (action: 'stage' | 'unstage', patch: string): Promise<void> => {
      if (!admitsWrites || hunkInFlight.current) return
      hunkInFlight.current = true
      setIsMutating(true)
      try {
        await (action === 'stage' ? stageHunk : unstageHunk)(cwd, path, patch)
      } catch (cause) {
        void logFrontendError({
          level: 'warn',
          source: 'DiffTab.runHunk',
          message: `failed: ${action} hunk rejected (details surfaced via UI toast only)`
        })
        toast.error(`Failed to ${action} hunk: ${String(cause)}`)
      } finally {
        hunkInFlight.current = false
        if (mounted.current) setIsMutating(false)
      }
    },
    [admitsWrites, cwd, path, stageHunk, unstageHunk]
  )

  const handleStageHunk = useCallback((patch: string) => runHunk('stage', patch), [runHunk])
  const handleUnstageHunk = useCallback((patch: string) => runHunk('unstage', patch), [runHunk])

  return (
    <div className="flex h-full w-full flex-col min-w-0 bg-card/30">
      <GitDiffPane
        variant="desktop"
        selectedFile={path}
        selectedStaged={staged}
        currentDiff={error === undefined ? diff : undefined}
        diffViewMode={diffViewMode}
        onDiffViewModeChange={setDiffViewMode}
        onStageHunk={handleStageHunk}
        onUnstageHunk={handleUnstageHunk}
        failure={error === undefined ? undefined : { detail: error, onRetry: load }}
        controlsDisabled={!admitsWrites || isMutating}
        disabledReason={admitsWrites ? null : READ_ONLY_REASON}
      />
    </div>
  )
}
