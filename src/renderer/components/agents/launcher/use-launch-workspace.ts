import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { activeWorktreeOf } from '@/lib/active-worktree'
import type { Project } from '@/types/project'
import type { LaunchIsolationMode } from './prepare-launch-worktree'

export interface LaunchWorkspace {
  isolationMode: LaunchIsolationMode
  /** A user (or restored-preference) choice: it stops the chip following the pick. */
  setIsolationMode: Dispatch<SetStateAction<LaunchIsolationMode>>
  existingWorktreeId: string | null
  setExistingWorktreeId: Dispatch<SetStateAction<string | null>>
  /** The pick resolves to the project folder (restored `worktree` mode applies only then). */
  pickIsProjectFolder: boolean
  /** Back to the pick-derived default (agent change). */
  resetWorkspace: () => void
}

/**
 * Workspace chip state for the launcher. It starts from the Workspace-switcher
 * pick (a picked worktree -> Existing worktree on it, else Current checkout)
 * and keeps following the pick until the user chooses a mode. It only READS the
 * pick: launching never writes it. A selected worktree that is no longer listed
 * (or is outside the project root) falls back to Current checkout.
 */
export function useLaunchWorkspace(
  project: Pick<Project, 'path' | 'worktrees'> | null | undefined,
  pick: string | null | undefined
): LaunchWorkspace {
  const picked = activeWorktreeOf(project, pick)
  const pickedId = picked?.id ?? null
  const [isolationMode, setMode] = useState<LaunchIsolationMode>(pickedId ? 'existing' : 'current')
  const [existingWorktreeId, setExistingId] = useState<string | null>(pickedId)
  const touched = useRef(false)

  const setIsolationMode = useCallback<Dispatch<SetStateAction<LaunchIsolationMode>>>((next) => {
    touched.current = true
    setMode(next)
  }, [])

  const setExistingWorktreeId = useCallback<Dispatch<SetStateAction<string | null>>>((next) => {
    touched.current = true
    setExistingId(next)
  }, [])

  const resetWorkspace = useCallback(() => {
    touched.current = false
    setMode(pickedId ? 'existing' : 'current')
    setExistingId(pickedId)
  }, [pickedId])

  // Follow the pick (it may hydrate after mount, or move while the launcher is open).
  useEffect(() => {
    if (touched.current) return
    if (pickedId) {
      setMode('existing')
      setExistingId(pickedId)
    } else {
      setMode((mode) => (mode === 'existing' ? 'current' : mode))
    }
  }, [pickedId])

  // Keep the Existing selection valid: default it, drop it when it vanishes.
  const selectable = (project?.worktrees ?? []).filter((w) => w.outsideProjectRoot !== true)
  const selectableKey = selectable.map((w) => w.id).join('\n')
  // biome-ignore lint/correctness/useExhaustiveDependencies: `selectableKey` stands for `selectable`
  useEffect(() => {
    if (isolationMode !== 'existing') return
    if (existingWorktreeId && selectable.some((w) => w.id === existingWorktreeId)) return
    const fallback = pickedId ?? selectable[0]?.id ?? null
    if (existingWorktreeId === null && fallback) {
      setExistingId(fallback)
      return
    }
    setExistingId(null)
    setMode('current')
  }, [isolationMode, existingWorktreeId, selectableKey, pickedId])

  return {
    isolationMode,
    setIsolationMode,
    existingWorktreeId,
    setExistingWorktreeId,
    pickIsProjectFolder: !picked,
    resetWorkspace
  }
}
