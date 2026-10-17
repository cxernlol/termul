import { createContext, useContext, useMemo } from 'react'
import {
  getTopRowPlatform,
  type PaneTopRowRole,
  paneTopRowRole,
  type TopRowPlatform,
  type TopRowRoles
} from '@/lib/top-row'

export interface TopRowValue {
  roles: TopRowRoles
  platform: TopRowPlatform
}

const TopRowContext = createContext<TopRowValue | null>(null)

/** Publishes who owns drag space and window controls in the shell's top row. */
export function TopRowProvider({
  roles,
  platform,
  children
}: TopRowValue & { children: React.ReactNode }): React.JSX.Element {
  const value = useMemo<TopRowValue>(() => ({ roles, platform }), [roles, platform])
  return <TopRowContext.Provider value={value}>{children}</TopRowContext.Provider>
}

/** The top row roles, or `null` outside the flagged shell (classic look). */
export function useTopRow(): TopRowValue | null {
  return useContext(TopRowContext)
}

/** Platform flags: the provider's, else read at call time (web, tests). */
export function useTopRowPlatform(): TopRowPlatform {
  return useContext(TopRowContext)?.platform ?? getTopRowPlatform()
}

/** One pane's top row role, or `null` without a provider. */
export function usePaneTopRow(paneId: string): PaneTopRowRole | null {
  const value = useContext(TopRowContext)
  return useMemo(
    () => (value ? paneTopRowRole(value.roles, value.platform, paneId) : null),
    [value, paneId]
  )
}
