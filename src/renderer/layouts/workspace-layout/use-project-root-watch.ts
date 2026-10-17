import { useEffect, useRef } from 'react'
import { useActiveWorkingCopy } from '@/hooks/use-active-working-copy'
import { reportUnresolvedWorkingCopy } from '@/lib/active-working-copy'
import { filesystemApi } from '@/lib/api'
import { useFileExplorerStore } from '@/stores/file-explorer-store'
import type { Project } from '@/types/project'

interface UseProjectRootWatchOptions {
  activeProject: Project | undefined
  activeProjectId: string
}

/**
 * The single owner of the Explorer root and its file watch (AD-1). The scope
 * root is the project folder (`setRootPath`); the active working copy's
 * worktree is applied through the `setWorktreeRoot` override (`null` for the
 * project folder), and the watch follows the effective root.
 *
 * An `unresolved` working copy triggers one reconcile per distinct key. It
 * keeps the current root when the project did not change; on a project switch
 * the root sits at the project folder until the reconcile resolves.
 */
export function useProjectRootWatch({
  activeProject,
  activeProjectId
}: UseProjectRootWatchOptions): void {
  const wc = useActiveWorkingCopy()
  const projectPath = activeProject?.path
  const wcState = wc?.state
  const wcKey = wc?.key
  const wcKind = wc?.state === 'resolved' ? wc.kind : null
  const wcPath = wc?.path

  // `${projectId}\0${projectPath}` whose scope root the explorer currently has.
  const appliedScopeRef = useRef<string | null>(null)
  const watchedRootPathRef = useRef<string | null>(null)
  // The worktree override last applied (`null` = project folder).
  const appliedWorktreePathRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: wcState/wcKey/wcKind/wcPath are the identity of `wc`; the object itself is deliberately not a dependency
  useEffect(() => {
    const explorer = useFileExplorerStore.getState()

    if (typeof projectPath !== 'string' || projectPath === '') {
      // Project removed or has no path: clear the explorer root and unwatch.
      requestIdRef.current += 1
      explorer.setRootPath('')
      explorer.setWorktreeRoot(null)
      appliedWorktreePathRef.current = null
      if (watchedRootPathRef.current) {
        filesystemApi.unwatchDirectory(watchedRootPathRef.current)
        watchedRootPathRef.current = null
      }
      appliedScopeRef.current = null
      return
    }

    const scopeKey = `${activeProjectId}\0${projectPath}`
    const projectChanged = appliedScopeRef.current !== scopeKey

    if (wc?.state === 'unresolved') {
      reportUnresolvedWorkingCopy(activeProjectId, wc)
      // Same project: keep the current root and watch until it resolves.
      if (!projectChanged) return
    }

    // Unresolved on a project switch roots at the project folder (read-only).
    const worktreePath = wc?.state === 'resolved' && wc.kind === 'worktree' ? wc.path : null
    const watchPath = worktreePath ?? projectPath

    if (
      !projectChanged &&
      watchedRootPathRef.current === watchPath &&
      appliedWorktreePathRef.current === worktreePath
    ) {
      return
    }

    const requestId = ++requestIdRef.current
    let cancelled = false
    const isStale = (): boolean => cancelled || requestId !== requestIdRef.current

    function applyRoot(): void {
      const store = useFileExplorerStore.getState()
      if (projectChanged) {
        store.setRootPath(projectPath as string)
        appliedScopeRef.current = scopeKey
      }
      if (projectChanged || appliedWorktreePathRef.current !== worktreePath) {
        useFileExplorerStore.getState().setWorktreeRoot(worktreePath)
        appliedWorktreePathRef.current = worktreePath
      }
    }

    function releasePrevious(keep: string | null): void {
      const previous = watchedRootPathRef.current
      if (previous && previous !== keep) filesystemApi.unwatchDirectory(previous)
    }

    async function applyWorkingCopy(): Promise<void> {
      try {
        const watchResult = await filesystemApi.watchDirectory(watchPath)

        if (isStale()) {
          if (watchedRootPathRef.current !== watchPath) filesystemApi.unwatchDirectory(watchPath)
          return
        }

        applyRoot()

        if (!watchResult.success) {
          useFileExplorerStore.getState().setRootLoadError({
            message: watchResult.error,
            code: watchResult.code
          })
          releasePrevious(null)
          watchedRootPathRef.current = null
          return
        }

        releasePrevious(watchPath)
        watchedRootPathRef.current = watchPath
      } catch (error) {
        if (isStale()) return

        applyRoot()
        const message = error instanceof Error ? error.message : 'Failed to watch project directory'
        useFileExplorerStore.getState().setRootLoadError({ message, code: 'WATCH_FAILED' })
        releasePrevious(null)
        watchedRootPathRef.current = null
      }
    }

    void applyWorkingCopy()

    return () => {
      cancelled = true
    }
  }, [activeProjectId, projectPath, wcState, wcKey, wcKind, wcPath])

  useEffect(() => {
    return () => {
      if (watchedRootPathRef.current) {
        filesystemApi.unwatchDirectory(watchedRootPathRef.current)
      }
    }
  }, [])
}
