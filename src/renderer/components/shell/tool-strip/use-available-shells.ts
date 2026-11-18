import type { DetectedShells, ShellInfo } from '@shared/types/ipc.types'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { logShellEvent } from '@/components/shell/shell-log'
import { shellApi } from '@/lib/api'

type DetectionStatus = 'idle' | 'loading' | 'ready' | 'failed'

interface DetectionState {
  status: DetectionStatus
  shells: DetectedShells | null
}

/**
 * One shell detection for the whole renderer: every tab bar `+` menu and the
 * tool strip share its result and its in-flight request, so N panes send one
 * `/shells` request. A failed request leaves `failed` (not an empty list), and
 * the next {@link loadShells} tries again.
 */
let state: DetectionState = { status: 'idle', shells: null }
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(next: DetectionState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = (): DetectionState => state

/** Starts the detection unless it already succeeded or is running. */
export function loadShells(): Promise<void> {
  if (state.status === 'ready') return Promise.resolve()
  if (inFlight) return inFlight
  setState({ status: 'loading', shells: null })
  inFlight = (async () => {
    try {
      const result = await shellApi.getAvailableShells()
      if (result.success) {
        setState({ status: 'ready', shells: result.data })
        return
      }
      logShellEvent(`shell detection failed: ${result.error}`, 'error')
    } catch (error) {
      logShellEvent(
        `shell detection failed: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      )
    } finally {
      inFlight = null
    }
    setState({ status: 'failed', shells: null })
  })()
  return inFlight
}

/** Tests only: forget the shared result so each test detects again. */
export function resetAvailableShellsForTests(): void {
  inFlight = null
  state = { status: 'idle', shells: null }
  for (const listener of listeners) listener()
}

interface AvailableShells {
  /** Detection has not finished yet (or has not started). */
  loading: boolean
  /** The last detection failed; {@link AvailableShells.load} tries again. */
  failed: boolean
  /** Detected shells, the default first, then by name. `undefined` until detected. */
  sortedShells: ShellInfo[] | undefined
  /** The shell a plain new terminal uses, if it is in the list. */
  defaultShell: ShellInfo | undefined
  /** Starts the detection, or retries a failed one. */
  load: () => void
}

/** True when the stored shell setting (a name, a path or a file name) names `shell`. */
function isSameShell(shell: ShellInfo, stored: string | undefined): boolean {
  if (!stored) return false
  return (
    stored === shell.path || stored === shell.name || stored === shell.path.split(/[\\/]/).pop()
  )
}

/**
 * The detected shells sorted with the default first: `preferred` (the project
 * or app setting) when it matches one, else the host's detected default.
 * Detection runs on mount unless `lazy`; a lazy caller runs `load` when the
 * user opens its menu.
 */
export function useAvailableShells(
  preferred?: string,
  options?: { lazy?: boolean }
): AvailableShells {
  const lazy = options?.lazy === true
  const { status, shells } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const load = useCallback(() => void loadShells(), [])

  useEffect(() => {
    if (!lazy && getSnapshot().status === 'idle') void loadShells()
  }, [lazy])

  const available = shells?.available
  const defaultShell =
    available?.find((shell) => isSameShell(shell, preferred)) ??
    available?.find((shell) => shell.path === shells?.default?.path)
  const sortedShells = available?.slice().sort((a, b) => {
    if (a === defaultShell) return -1
    if (b === defaultShell) return 1
    return a.displayName.localeCompare(b.displayName)
  })

  return {
    loading: status === 'idle' || status === 'loading',
    failed: status === 'failed',
    sortedShells,
    defaultShell,
    load
  }
}
