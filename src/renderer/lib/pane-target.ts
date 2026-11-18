import { useProjectStore } from '@/stores/project-store'
import { findPaneById, useWorkspaceStore } from '@/stores/workspace-store'

/**
 * True when the pane tree on screen belongs to the selected project. During a
 * slow project switch the project store already names the new project while
 * the old project's tree is still the visible one: a pane id read from that
 * tree must not be used to open something for the new project. `''` is the
 * tree before the first commit, which belongs to whatever project is selected.
 */
export function isWorkspaceSettled(
  workspaceProjectId: string | undefined,
  selectedProjectId: string | undefined
): boolean {
  return !workspaceProjectId || workspaceProjectId === selectedProjectId
}

/** {@link isWorkspaceSettled} as a hook (re-renders when either side changes). */
export function useWorkspaceSettled(): boolean {
  const workspaceProjectId = useWorkspaceStore((s) => s.activeProjectId)
  const selectedProjectId = useProjectStore((s) => s.activeProjectId)
  return isWorkspaceSettled(workspaceProjectId, selectedProjectId)
}

/**
 * The project that owns `paneId` when that pane is a leaf of the tree on
 * screen and that tree belongs to the selected project; else `null` (a
 * switch is in flight, or the pane is gone). Callers that open a tab for a
 * pane read the project from here, so the tab and its project always agree.
 */
export function committedPaneProject(paneId: string): string | null {
  const workspace = useWorkspaceStore.getState()
  const selected = useProjectStore.getState().activeProjectId
  if (!selected || !isWorkspaceSettled(workspace.activeProjectId, selected)) return null
  return findPaneById(workspace.root, paneId)?.type === 'leaf' ? selected : null
}
