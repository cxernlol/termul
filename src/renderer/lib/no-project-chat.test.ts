import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

import { setRouterNavigate } from '@/lib/router-navigate'
import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { isQuickChatLeaving, useQuickChatStore } from '@/stores/quick-chat-store'
import {
  adoptQuickChat,
  leaveQuickChatView,
  noProjectChatKind,
  openNoProjectChat,
  showNoProjectChat
} from './no-project-chat'

describe('no-project-chat', () => {
  beforeEach(() => {
    navigate.mockReset()
    setRouterNavigate(navigate)
    window.location.hash = '#/'
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useAcpStore.setState({
      sessions: {},
      sessionIndex: [
        mockSessionIndexEntry({ id: 'q', projectId: '__unassigned__', kind: 'quick' }),
        mockSessionIndexEntry({ id: 'old', projectId: '__unassigned__' }),
        mockSessionIndexEntry({ id: 'p', projectId: 'p1' })
      ]
    })
  })

  it('classifies quick, older and project chats', () => {
    const state = useAcpStore.getState()
    expect(noProjectChatKind(state, 'q')).toBe('quick')
    expect(noProjectChatKind(state, 'old')).toBe('older')
    expect(noProjectChatKind(state, 'p')).toBeNull()
    expect(noProjectChatKind(state, 'unknown')).toBeNull()
  })

  it('shows a quick chat on its chat route and an older chat read-only', () => {
    showNoProjectChat('q', 'quick', 'test')
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'chat', sessionId: 'q' })
    expect(navigate).toHaveBeenCalledWith('/c/q')
    expect(openNoProjectChat('old', 'test')).toBe(true)
    expect(useQuickChatStore.getState().view).toEqual({
      mode: 'chat',
      sessionId: 'old',
      readOnly: true
    })
  })

  it('leaves a project chat alone', () => {
    expect(openNoProjectChat('p', 'test')).toBe(false)
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'closed' })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('closes the quick view at once and leaves its route on the next task', () => {
    vi.useFakeTimers()
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'q' } })
    window.location.hash = '#/c/q'
    leaveQuickChatView('test')
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'closed' })
    expect(isQuickChatLeaving('q')).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(navigate).toHaveBeenCalledWith('/')
    expect(isQuickChatLeaving('q')).toBe(false)
    vi.useRealTimers()
  })

  it('adds no history entry when the caller already changed the route', () => {
    vi.useFakeTimers()
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'q' } })
    window.location.hash = '#/c/q'
    leaveQuickChatView('test')
    // The caller's own navigation (Alt+T, a project pick) lands first.
    window.location.hash = '#/c/new-project-chat'
    vi.runAllTimers()
    expect(navigate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('keeps the route when the same quick chat opens again before it settles', () => {
    vi.useFakeTimers()
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'q' } })
    window.location.hash = '#/c/q'
    leaveQuickChatView('test')
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'q' } })
    vi.runAllTimers()
    expect(navigate).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('moves the view to the started session and replaces the placeholder route', () => {
    useQuickChatStore.getState().openChat('launch-1')
    window.location.hash = '#/c/launch-1'
    adoptQuickChat('launch-1', 'sess-1', 'test')
    expect(useQuickChatStore.getState().view).toEqual({
      mode: 'chat',
      sessionId: 'sess-1',
      panelKey: 'launch-1'
    })
    expect(navigate).toHaveBeenCalledWith('/c/sess-1', { replace: true })
  })

  it('ignores the start of a placeholder that is no longer on screen', () => {
    useQuickChatStore.getState().openChat('sess-2')
    adoptQuickChat('launch-1', 'sess-1', 'test')
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'chat', sessionId: 'sess-2' })
    expect(navigate).not.toHaveBeenCalled()
  })
})
