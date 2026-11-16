import { create } from 'zustand'
import { clearChatRoute } from '@/lib/router-navigate'

/** What the main area shows for a quick chat. */
export type QuickChatView =
  | { mode: 'closed' }
  | {
      mode: 'chat'
      sessionId: string
      readOnly?: boolean
      /**
       * React key of the chat panel when it is not `sessionId`: a launch
       * placeholder that became its session keeps the placeholder's key, so
       * the text typed while the chat started stays in the composer.
       */
      panelKey?: string
    }

interface QuickChatState {
  view: QuickChatView
  openChat: (sessionId: string) => void
  /** An older no-project chat. History can be read. New prompts are refused. */
  openOlderChat: (sessionId: string) => void
  /**
   * The launch placeholder `from` became session `to`. Only when `from` is
   * the chat on screen: the view moves to `to` and keeps its panel key.
   */
  adoptChat: (from: string, to: string) => void
  close: () => void
}

/**
 * The open quick chat. A quick chat has no project, so it does not live in a
 * project pane tree. Selecting a project or opening a project chat closes
 * this view (see {@link closeQuickChatView}).
 */
export const useQuickChatStore = create<QuickChatState>((set) => ({
  view: { mode: 'closed' },
  openChat: (sessionId) => set({ view: { mode: 'chat', sessionId } }),
  openOlderChat: (sessionId) => set({ view: { mode: 'chat', sessionId, readOnly: true } }),
  adoptChat: (from, to) =>
    set((state) => {
      const view = state.view
      if (view.mode !== 'chat' || view.sessionId !== from) return state
      return { view: { mode: 'chat', sessionId: to, panelKey: view.panelKey ?? from } }
    }),
  close: () => set({ view: { mode: 'closed' } })
}))

/** `true` while a quick chat owns the main area. */
export function useQuickChatOpen(): boolean {
  return useQuickChatStore((state) => state.view.mode !== 'closed')
}

/** The session id of the open quick chat, or `null`. */
export function useQuickChatSessionId(): string | null {
  return useQuickChatStore((state) => (state.view.mode === 'chat' ? state.view.sessionId : null))
}

/** The quick chat whose view just closed, until its route is settled. */
let leavingSessionId: string | null = null

/** `true` while the view of `sessionId` has closed but its route is not settled yet. */
export function isQuickChatLeaving(sessionId: string): boolean {
  return leavingSessionId === sessionId
}

/**
 * Close the quick view for a project view and return the chat's id (`null`
 * when it was closed). The route leaves `#/c/<id>` on the next task, and only
 * when nothing else changed it first.
 *
 * The router commits a navigation some microtasks later. A route change made
 * here at once and the caller's own change (Alt+T adds `#/c/<new>`, a project
 * pick goes to `#/`) would make two history entries, so Back would stop on an
 * extra `#/`. While the route still names the closed chat, `ChatRoute` checks
 * {@link isQuickChatLeaving} and does not open it again.
 */
export function closeQuickChatView(): string | null {
  const view = useQuickChatStore.getState().view
  if (view.mode === 'closed') return null
  const sessionId = view.sessionId
  useQuickChatStore.getState().close()
  leavingSessionId = sessionId
  setTimeout(() => {
    if (leavingSessionId === sessionId) leavingSessionId = null
    const now = useQuickChatStore.getState().view
    // Opened again in the meantime: its route is right.
    if (now.mode === 'chat' && now.sessionId === sessionId) return
    clearChatRoute(sessionId)
  }, 0)
  return sessionId
}

/** The React key of the open quick chat's panel. */
export function quickChatPanelKey(view: Extract<QuickChatView, { mode: 'chat' }>): string {
  return view.panelKey ?? view.sessionId
}
