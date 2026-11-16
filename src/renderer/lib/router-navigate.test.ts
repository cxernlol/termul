import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearChatRoute,
  isChatRouteCurrent,
  navigateToChatSession,
  setRouterNavigate
} from './router-navigate'

describe('clearChatRoute', () => {
  afterEach(() => {
    setRouterNavigate(null)
    window.location.hash = ''
  })

  it('leaves any chat route when no session is given', () => {
    const navigate = vi.fn()
    setRouterNavigate(navigate)
    window.location.hash = '#/c/s-1'
    clearChatRoute()
    expect(navigate).toHaveBeenCalledWith('/')
  })

  it('only leaves the route when it still names the given session', () => {
    const navigate = vi.fn()
    setRouterNavigate(navigate)
    window.location.hash = '#/c/s-newer'
    clearChatRoute('s-stale')
    expect(navigate).not.toHaveBeenCalled()
    clearChatRoute('s-newer')
    expect(navigate).toHaveBeenCalledWith('/')
  })
})

describe('isChatRouteCurrent', () => {
  afterEach(() => {
    window.location.hash = ''
  })

  it('matches the path of the chat route and ignores its search part', () => {
    window.location.hash = '#/c/s-1?from=link'
    expect(isChatRouteCurrent('s-1')).toBe(true)
    expect(isChatRouteCurrent('s-10')).toBe(false)
    window.location.hash = '#/c/s-10'
    expect(isChatRouteCurrent('s-1')).toBe(false)
    window.location.hash = '#/'
    expect(isChatRouteCurrent('s-1')).toBe(false)
  })
})

describe('navigateToChatSession', () => {
  it('pushes a new entry by default and replaces it on request', () => {
    const navigate = vi.fn()
    setRouterNavigate(navigate)
    window.location.hash = '#/c/launch-1'
    navigateToChatSession('sess-1')
    expect(navigate).toHaveBeenLastCalledWith('/c/sess-1')
    navigateToChatSession('sess-2', { replace: true })
    expect(navigate).toHaveBeenLastCalledWith('/c/sess-2', { replace: true })
    setRouterNavigate(null)
  })

  it('does nothing when the route already names the session', () => {
    const navigate = vi.fn()
    setRouterNavigate(navigate)
    window.location.hash = '#/c/sess-1'
    navigateToChatSession('sess-1', { replace: true })
    expect(navigate).not.toHaveBeenCalled()
    setRouterNavigate(null)
  })
})
