import { logFrontendError } from '@/lib/log-api'
import { type ShellLastColumnTab, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useSSHStore } from '@/stores/ssh-store'

/** Frames to wait for the tool strip button to mount. */
const FOCUS_FRAMES = 10

/** DOM id of a tool strip view button (`ShellToolStrip`). */
export function toolStripButtonId(tab: ShellLastColumnTab): string {
  return `tool-strip-${tab}`
}

/** Focuses the tool strip button for `tab` once it is in the document. */
function focusStripButton(tab: ShellLastColumnTab): void {
  let frames = 0
  const attempt = (): void => {
    const el = document.getElementById(toolStripButtonId(tab))
    if (el) el.focus()
    else if (++frames < FOCUS_FRAMES) requestAnimationFrame(attempt)
  }
  attempt()
}

/**
 * Shows Changes in the right panel for the chat's working copy and moves
 * focus to the tool strip Changes button. Used by "Review changes" in the chat.
 */
export function openChangesTab(projectId: string, cwd: string): void {
  // The SSH workspace replaces the project view, so leave it first.
  useSSHStore.getState().selectProfile(null)
  const layout = useShellLayoutStore.getState()
  layout.setWorktreePick(projectId, cwd)
  layout.setLastColumnTab(projectId, 'changes')
  layout.setSidePanelVisible(true)
  void logFrontendError({
    level: 'info',
    message: `openChangesTab: show Changes in the right panel for project ${projectId}`,
    source: 'column-tab-focus'
  })
  focusStripButton('changes')
}
