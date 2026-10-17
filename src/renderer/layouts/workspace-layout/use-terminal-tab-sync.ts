import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/stores/editor-store'
import { useTerminalStore } from '@/stores/terminal-store'
import {
  getActiveFilePathFromTree,
  getActiveTerminalIdFromTree,
  useWorkspaceStore
} from '@/stores/workspace-store'
import type { Terminal } from '@/types/project'

interface UseTerminalTabSyncOptions {
  terminals: Terminal[]
  activeProjectId: string
}

/** Keeps workspace tabs and the legacy terminal/editor stores in sync with the pane tree. */
export function useTerminalTabSync({
  terminals,
  activeProjectId
}: UseTerminalTabSyncOptions): void {
  // Ensure tabs exist for currently visible project terminals.
  // Project workspace loading/removal is owned by the project-switch
  // coordinator (it commits the target's tree, parked or hydrated).
  // Debounce: rapid terminal store mutations (addTerminal → setTerminalPtyId →
  // addTabToPane) settle before syncTerminalTabs runs, preventing the MOUNT/UNMOUNT
  // cascade where intermediate states look like "orphaned" tabs.
  const ensureCallCountRef = useRef(0)
  const lastEnsuredTerminalIdsRef = useRef<string[]>([])
  const lastEnsuredProjectIdRef = useRef<string>('')
  const syncDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The project whose tree the workspace store currently shows. `activeProjectId`
  // (the project-store intent) runs ahead of it while a switch is loading.
  const committedProjectId = useWorkspaceStore((state) => state.activeProjectId)

  useEffect(() => {
    const terminalIds = terminals.map((terminal) => terminal.id)

    // Clear any pending debounce — only the latest mutation triggers a sync.
    if (syncDebounceTimerRef.current) {
      clearTimeout(syncDebounceTimerRef.current)
      syncDebounceTimerRef.current = null
    }

    // While a switch is loading, the visible tree still belongs to the OLD
    // project: syncing the new project's terminals into it would leak their
    // tabs there. Do nothing until the coordinator commits the target.
    if (committedProjectId !== activeProjectId) return

    // First look at a committed project (just switched, visited or fresh):
    // the commit already reconciled its tree, but terminals may have been
    // created while the switch was loading — sync once regardless of whether
    // the id list differs from the previous project's.
    const projectChanged = activeProjectId !== lastEnsuredProjectIdRef.current
    const prevIds = lastEnsuredTerminalIdsRef.current
    if (
      !projectChanged &&
      terminalIds.length === prevIds.length &&
      terminalIds.every((id, i) => id === prevIds[i])
    ) {
      return
    }

    // Debounce: wait for store mutations to settle before syncing tabs.
    // This prevents the cascade where syncTerminalTabs runs between addTerminal
    // and addTabToPane, sees a tab as orphaned, removes it, triggering
    // ConnectedTerminal unmount and a restore re-trigger.
    syncDebounceTimerRef.current = setTimeout(() => {
      lastEnsuredTerminalIdsRef.current = terminalIds
      lastEnsuredProjectIdRef.current = activeProjectId
      const ensureId = `ensure-${ensureCallCountRef.current++}-${Date.now().toString().slice(-6)}`

      console.log(`[WorkspaceLayout] syncTerminalTabs CALL [${ensureId}]`, {
        projectId: activeProjectId,
        terminalCount: terminalIds.length,
        terminalIds,
        prevCount: prevIds.length,
        callCount: ensureCallCountRef.current
      })

      const workspaceStore = useWorkspaceStore.getState()
      workspaceStore.syncTerminalTabs(terminalIds)
    }, 100)

    return () => {
      if (syncDebounceTimerRef.current) {
        clearTimeout(syncDebounceTimerRef.current)
        syncDebounceTimerRef.current = null
      }
    }
  }, [terminals, activeProjectId, committedProjectId])

  // Sync legacy stores (activeTerminalId, activeFilePath) from workspace pane tree
  useEffect(() => {
    return useWorkspaceStore.subscribe((state, prevState) => {
      if (state.root === prevState.root && state.activePaneId === prevState.activePaneId) return

      const terminalId = getActiveTerminalIdFromTree(state)
      if (terminalId !== null) {
        const termStore = useTerminalStore.getState()
        if (termStore.activeTerminalId !== terminalId) {
          termStore.selectTerminal(terminalId)
        }
      }

      const filePath = getActiveFilePathFromTree(state)
      const editorStore = useEditorStore.getState()
      if (editorStore.activeFilePath !== filePath) {
        editorStore.setActiveFilePath(filePath)
      }
    })
  }, [])
}
