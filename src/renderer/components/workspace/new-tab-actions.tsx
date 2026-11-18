import type { ShellInfo } from '@shared/types/ipc.types'
import { createContext, useContext } from 'react'

/**
 * Tab openers the tab bar `+` menu calls for its own pane. WorkspaceLayout
 * owns them (they resolve the working copy cwd and leave the quick chat
 * view), so the pane tree reads them from context instead of threading them
 * through every pane renderer.
 */
export interface NewTabActions {
  /** A new terminal tab in `paneId`: the default shell, or `shell`. */
  addTerminal: (paneId: string, shell?: ShellInfo) => void
  /** A new browser tab in `paneId` (desktop only). */
  addBrowserTab: (paneId: string) => void
}

const NewTabActionsContext = createContext<NewTabActions | null>(null)

export const NewTabActionsProvider = NewTabActionsContext.Provider

/** The tab openers, or `null` outside WorkspaceLayout (tests, previews). */
export function useNewTabActions(): NewTabActions | null {
  return useContext(NewTabActionsContext)
}
