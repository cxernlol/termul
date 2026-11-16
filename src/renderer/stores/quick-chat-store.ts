import { create } from 'zustand'

/** What the main area shows for a quick chat. */
export type QuickChatView =
  | { mode: 'closed' }
  | { mode: 'launcher' }
  | { mode: 'chat'; sessionId: string; readOnly?: boolean }

interface QuickChatState {
  view: QuickChatView
  openLauncher: () => void
  openChat: (sessionId: string) => void
  /** An older no-project chat. History can be read. New prompts are refused. */
  openOlderChat: (sessionId: string) => void
  close: () => void
}

/**
 * The open quick chat. A quick chat has no project, so it does not live in a
 * project pane tree. Selecting a project closes this view.
 */
export const useQuickChatStore = create<QuickChatState>((set) => ({
  view: { mode: 'closed' },
  openLauncher: () => set({ view: { mode: 'launcher' } }),
  openChat: (sessionId) => set({ view: { mode: 'chat', sessionId } }),
  openOlderChat: (sessionId) => set({ view: { mode: 'chat', sessionId, readOnly: true } }),
  close: () => set({ view: { mode: 'closed' } })
}))

/** `true` while the launcher or a quick chat owns the main area. */
export function useQuickChatOpen(): boolean {
  return useQuickChatStore((state) => state.view.mode !== 'closed')
}
