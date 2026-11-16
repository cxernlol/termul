import { useEffect } from 'react'
import { leaveQuickChatView, openNoProjectChat } from '@/lib/no-project-chat'
import { isWorkspaceRoutePath, useWorkspaceRouteStore } from '@/lib/workspace-route'
import { useQuickChatStore } from '@/stores/quick-chat-store'

/** The session id of a `/c/<id>` path, or `null`. */
function routeSessionId(pathname: string): string | null {
  return pathname.match(/^\/c\/(.+)$/)?.[1] ?? null
}

/**
 * Keep the quick chat view and the route in step when the route changes
 * without a click on the view itself (browser Back/Forward, a typed URL, a
 * routed page such as Snapshots). It also publishes whether the route is a
 * workspace route ({@link useWorkspaceRouteStore}).
 *
 * While the quick view is open, `ChatRoute` is not mounted, so nothing else
 * answers a route change. This hook runs on a pathname change only. It reads
 * the view from the store at that time: a click sets the view first and then
 * the route, so the route then names the open chat and nothing happens.
 */
export function useQuickChatRouteSync(pathname: string): void {
  useEffect(() => {
    useWorkspaceRouteStore.setState({ onWorkspaceRoute: isWorkspaceRoutePath(pathname) })
  }, [pathname])
  useEffect(() => {
    const view = useQuickChatStore.getState().view
    if (view.mode === 'closed') return
    const sessionId = routeSessionId(pathname)
    if (sessionId === view.sessionId) return
    // Back/Forward to another quick or older chat: show that one.
    if (sessionId && openNoProjectChat(sessionId, 'quick-chat.route')) return
    // A project chat, the workspace root or a routed page: the project view
    // shows it. `ChatRoute` mounts after this and opens a project chat.
    leaveQuickChatView('quick-chat.route')
  }, [pathname])
}
