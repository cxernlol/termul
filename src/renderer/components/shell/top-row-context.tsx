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
  /**
   * The Rail is collapsed: the main area's top row starts with the
   * expand-Rail toggle (`TopRowStartSlot`).
   */
  railToggleInMain: boolean
}

const TopRowContext = createContext<TopRowValue | null>(null)

/** Publishes who owns drag space and window controls in the shell's top row. */
export function TopRowProvider({
  roles,
  platform,
  railToggleInMain = false,
  children
}: Omit<TopRowValue, 'railToggleInMain'> & {
  railToggleInMain?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const value = useMemo<TopRowValue>(
    () => ({ roles, platform, railToggleInMain }),
    [roles, platform, railToggleInMain]
  )
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
