import { beforeEach, describe, expect, it } from 'vitest'
import { quickChatPanelKey, useQuickChatStore } from './quick-chat-store'

function openView() {
  const view = useQuickChatStore.getState().view
  if (view.mode !== 'chat') throw new Error('expected an open quick chat')
  return view
}

describe('quick chat panel key', () => {
  beforeEach(() => useQuickChatStore.setState({ view: { mode: 'closed' } }))

  it('keys a chat by its own id', () => {
    useQuickChatStore.getState().openChat('sess-1')
    expect(quickChatPanelKey(openView())).toBe('sess-1')
  })

  it('keeps the placeholder key when the placeholder on screen becomes its session', () => {
    useQuickChatStore.getState().openChat('launch-1')
    useQuickChatStore.getState().adoptChat('launch-1', 'sess-9')
    expect(openView().sessionId).toBe('sess-9')
    expect(quickChatPanelKey(openView())).toBe('launch-1')
  })

  it('gives another chat its own key, also while a placeholder is open', () => {
    useQuickChatStore.getState().openChat('launch-1')
    useQuickChatStore.getState().openChat('sess-2')
    expect(quickChatPanelKey(openView())).toBe('sess-2')
  })

  it('ignores an adoption for a chat that is not on screen', () => {
    useQuickChatStore.getState().openChat('sess-2')
    useQuickChatStore.getState().adoptChat('launch-1', 'sess-9')
    expect(openView()).toEqual({ mode: 'chat', sessionId: 'sess-2' })
  })
})
