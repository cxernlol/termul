/**
 * Read-through projection of the shell-layout SSH section flag (shell revamp
 * AD-4). `useSSHPanelVisible()` is `sshSectionVisible`; the imperative setters
 * write through the shell-layout store so its hydration gate and persistence
 * apply.
 */

import { useShellLayoutStore, useSshSectionVisible } from '@/stores/shell-layout-store'

export function useSSHPanelVisible(): boolean {
  return useSshSectionVisible()
}

export function setSSHPanelVisible(visible: boolean): void {
  useShellLayoutStore.getState().setSshSectionVisible(visible)
}

export function toggleSSHPanelVisibility(): void {
  setSSHPanelVisible(!useShellLayoutStore.getState().sshSectionVisible)
}
