import type { DetectedShells, ShellInfo } from '@shared/types/ipc.types'
import { useEffect, useState } from 'react'
import { logShellEvent } from '@/components/shell/shell-log'
import { shellApi } from '@/lib/api'

interface AvailableShells {
  loading: boolean
  /** Detected shells, the default first, then by name. `undefined` when detection failed. */
  sortedShells: ShellInfo[] | undefined
  /** The shell a plain new terminal uses, if it is in the list. */
  defaultShell: ShellInfo | undefined
}

/** True when the stored shell setting (a name, a path or a file name) names `shell`. */
function isSameShell(shell: ShellInfo, stored: string | undefined): boolean {
  if (!stored) return false
  return (
    stored === shell.path || stored === shell.name || stored === shell.path.split(/[\\/]/).pop()
  )
}

/**
 * Fetches the detected shells once and sorts them with the default first:
 * `preferred` (the project or app setting) when it matches one, else the
 * host's detected default.
 */
export function useAvailableShells(preferred?: string): AvailableShells {
  const [shells, setShells] = useState<DetectedShells | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchShells = async (): Promise<void> => {
      try {
        const result = await shellApi.getAvailableShells()
        if (cancelled) return
        if (result.success) setShells(result.data)
        else logShellEvent(`shell detection failed: ${result.error}`, 'error')
      } catch (error) {
        logShellEvent(
          `shell detection failed: ${error instanceof Error ? error.message : String(error)}`,
          'error'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchShells()
    return () => {
      cancelled = true
    }
  }, [])

  const available = shells?.available
  const defaultShell =
    available?.find((shell) => isSameShell(shell, preferred)) ??
    available?.find((shell) => shell.path === shells?.default?.path)
  const sortedShells = available?.slice().sort((a, b) => {
    if (a === defaultShell) return -1
    if (b === defaultShell) return 1
    return a.displayName.localeCompare(b.displayName)
  })

  return { loading, sortedShells, defaultShell }
}
