type RouterNavigate = (path: string, options?: { replace?: boolean }) => void

let navigateFn: RouterNavigate | null = null

export function setRouterNavigate(fn: RouterNavigate | null): void {
  navigateFn = fn
}

/**
 * Whether the URL names the chat route of `sessionId`. Reads the live hash:
 * the router commits its location in a transition, so a route hook can still
 * name a chat route the URL already left. Only the path counts, as in route
 * matching: `#/c/<id>?…` is still that chat route.
 */
export function isChatRouteCurrent(sessionId: string): boolean {
  const [path] = window.location.hash.slice(1).split(/[?#]/, 1)
  return path === `/c/${sessionId}`
}

/**
 * Put `#/c/<sessionId>` on the route. With `replace`, the current history
 * entry changes in place: a launch placeholder that becomes its real session
 * must not leave a dead `#/c/launch-…` entry for Back to land on.
 */
export function navigateToChatSession(sessionId: string, options?: { replace?: boolean }): void {
  if (!navigateFn) return
  if (isChatRouteCurrent(sessionId)) return
  if (options?.replace) navigateFn(`/c/${sessionId}`, { replace: true })
  else navigateFn(`/c/${sessionId}`)
}

/**
 * Leave the chat route. With `sessionId`, only when the URL still names that
 * session — a caller acting on a stale route (router updates run in a
 * transition) must not clobber a newer chat route.
 */
export function clearChatRoute(sessionId?: string): void {
  if (!navigateFn) return
  if (sessionId ? isChatRouteCurrent(sessionId) : window.location.hash.startsWith('#/c/')) {
    navigateFn('/')
  }
}
