/**
 * Read-through projection of the shell-layout rail flag (shell revamp AD-4).
 * `useSidebarVisible()` is `railExpanded`; the imperative setters write through
 * the shell-layout store so its hydration gate and persistence apply.
 */

import { useRailExpanded, useShellLayoutStore } from '@/stores/shell-layout-store'

export function useSidebarVisible(): boolean {
  return useRailExpanded()
}

export function setSidebarVisible(visible: boolean): void {
  useShellLayoutStore.getState().setRailExpanded(visible)
}

export function toggleSidebarVisibility(): void {
  setSidebarVisible(!useShellLayoutStore.getState().railExpanded)
}
