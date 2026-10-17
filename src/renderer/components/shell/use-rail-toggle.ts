import { useCallback } from 'react'
import { toast } from 'sonner'
import { useUpdatePanelVisibility } from '@/hooks/use-app-settings'
import { useSidebarVisible } from '@/stores/sidebar-store'

/** Accessible name of every control that expands or collapses the Rail. */
export const RAIL_TOGGLE_LABEL = 'Expand or collapse projects'

/**
 * Expands or collapses the Rail through the same persisted path as today's
 * sidebar toggle (`updatePanelVisibility('sidebarVisible', ...)`), with an
 * error toast when saving fails.
 */
export function useRailToggle(): { expanded: boolean; toggle: () => void } {
  const expanded = useSidebarVisible()
  const updatePanelVisibility = useUpdatePanelVisibility()

  const toggle = useCallback(() => {
    void updatePanelVisibility('sidebarVisible', !expanded).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update sidebar visibility')
    })
  }, [expanded, updatePanelVisibility])

  return { expanded, toggle }
}
