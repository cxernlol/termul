import type { DetectedShells, ShellInfo } from '@shared/types/ipc.types'
import { useEffect, useState } from 'react'
import { shellApi } from '@/lib/api'

interface AvailableShells {
  loading: boolean
  sortedShells: ShellInfo[] | undefined
}

/** Fetches the detected shells once and sorts them with `defaultShell` first. */
export function useAvailableShells(defaultShell?: string): AvailableShells {
  const [shells, setShells] = useState<DetectedShells | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchShells = async (): Promise<void> => {
      try {
        const result = await shellApi.getAvailableShells()
        if (result.success) {
          setShells(result.data)
        }
      } catch {
        setShells(null)
      } finally {
        setLoading(false)
      }
    }
    void fetchShells()
  }, [])

  const sortedShells = shells?.available?.slice().sort((a, b) => {
    if (defaultShell) {
      if (a.name === defaultShell) return -1
      if (b.name === defaultShell) return 1
    }
    return a.displayName.localeCompare(b.displayName)
  })

  return { loading, sortedShells }
}
