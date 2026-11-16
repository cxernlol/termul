import { UNASSIGNED_PROJECT_ID } from '@shared/types/web-projects.types'
import { toast } from 'sonner'
import { UNTITLED_HOST_TITLE } from '@/lib/acp-history-persistence'
import { logFrontendError } from '@/lib/log-api'
import { isChatRouteCurrent, navigateToChatSession } from '@/lib/router-navigate'
import type { AcpState } from '@/stores/acp-store'
import { useAcpStore } from '@/stores/acp-store'
import {
  closeQuickChatView,
  useQuickChatSessionId,
  useQuickChatStore
} from '@/stores/quick-chat-store'

/**
 * A chat with no project: `quick` (ADR-0006) or `older` (a legacy
 * unassigned session, read-only). Neither lives in a project pane tree.
 */
export type NoProjectChat = 'quick' | 'older'

/** `quick`, `older`, or `null` for a project chat or an unknown session. */
export function noProjectChatKind(
  state: Pick<AcpState, 'sessions' | 'sessionIndex'>,
  sessionId: string
): NoProjectChat | null {
  const session = state.sessions[sessionId]
  const entry = state.sessionIndex.find((item) => item.id === sessionId)
  if ((session?.kind ?? entry?.kind) === 'quick') return 'quick'
  const projectId = session?.projectId || entry?.projectId
  return projectId === UNASSIGNED_PROJECT_ID ? 'older' : null
}

/** Show a no-project chat in the quick view and put it on the `#/c/<id>` route. */
export function showNoProjectChat(sessionId: string, kind: NoProjectChat, source: string): void {
  const store = useQuickChatStore.getState()
  if (kind === 'older') store.openOlderChat(sessionId)
  else store.openChat(sessionId)
  navigateToChatSession(sessionId)
  void logFrontendError({
    level: 'info',
    source,
    message: `Opened ${kind} chat ${sessionId} in the quick chat view`
  })
}

/**
 * The launch placeholder `from` on screen became session `to`. The view
 * moves to `to` with the same panel (the typed text stays), and the route
 * entry of the placeholder is replaced, so Back never lands on it.
 */
export function adoptQuickChat(from: string, to: string, source: string): void {
  const view = useQuickChatStore.getState().view
  if (view.mode !== 'chat' || view.sessionId !== from) return
  useQuickChatStore.getState().adoptChat(from, to)
  navigateToChatSession(to, isChatRouteCurrent(from) ? { replace: true } : undefined)
  void logFrontendError({
    level: 'info',
    source,
    message: `Quick chat ${from} started as ${to}`
  })
}

/**
 * Show a no-project chat from a list (Rail, palette) and load its history.
 * A failed load gets a toast.
 */
export function openNoProjectHistoryChat(
  sessionId: string,
  kind: NoProjectChat,
  source: string
): void {
  showNoProjectChat(sessionId, kind, source)
  void useAcpStore
    .getState()
    .openHistorySession(sessionId)
    .catch((error: unknown) => {
      void logFrontendError({
        level: 'warn',
        source,
        message: `Could not open ${kind} chat ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      })
      toast.error('Could not open that chat. Try again.')
    })
}

/**
 * When `sessionId` is a no-project chat, show it in the quick view and return
 * `true`. A project chat or an unknown session returns `false` and changes
 * nothing.
 */
export function openNoProjectChat(sessionId: string, source: string): boolean {
  const kind = noProjectChatKind(useAcpStore.getState(), sessionId)
  if (!kind) return false
  showNoProjectChat(sessionId, kind, source)
  return true
}

/**
 * Close the quick view before a project chat, the project launcher or a
 * project goes on screen. Without this the quick view stays on top and the
 * project change is not visible. A no-op when the view is closed.
 */
export function leaveQuickChatView(source: string): void {
  const sessionId = closeQuickChatView()
  if (!sessionId) return
  void logFrontendError({
    level: 'info',
    source,
    message: `Closed the quick chat view (${sessionId}) for a project view`
  })
}

/** Frames {@link focusQuickChatComposer} waits for the composer to mount. */
const FOCUS_COMPOSER_MAX_FRAMES = 30

/**
 * Put focus in the open quick chat's composer. It waits a few frames for a
 * new chat's composer to mount. The composer focuses itself only on mount
 * in some layouts, so `+` (a new chat, or the empty one already on screen)
 * needs this.
 */
export function focusQuickChatComposer(): void {
  let frames = 0
  const tryFocus = (): void => {
    const editor = document.querySelector<HTMLElement>(
      '[data-testid="quick-chat-main"] [contenteditable="true"]'
    )
    if (editor) {
      editor.focus()
      return
    }
    frames += 1
    if (frames < FOCUS_COMPOSER_MAX_FRAMES) requestAnimationFrame(tryFocus)
  }
  requestAnimationFrame(tryFocus)
}

/** The open quick chat's title (live, then index), or `undefined` when none is open. */
export function useQuickChatTitle(): string | undefined {
  const sessionId = useQuickChatSessionId()
  return useAcpStore((state) => {
    if (!sessionId) return undefined
    return (
      state.sessions[sessionId]?.title ||
      state.sessionIndex.find((entry) => entry.id === sessionId)?.title ||
      UNTITLED_HOST_TITLE
    )
  })
}
