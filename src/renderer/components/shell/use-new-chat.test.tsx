import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNewChat } from './use-new-chat'

const { openNewChat } = vi.hoisted(() => ({
  openNewChat: vi.fn(async () => ({ kind: 'skipped' as const }))
}))
vi.mock('@/components/chat/new-chat/open-new-chat', () => ({ openNewChat }))

function renderNewChat(path: string) {
  return renderHook(() => ({ newChat: useNewChat(), pathname: useLocation().pathname }), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  })
}

beforeEach(() => {
  openNewChat.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useNewChat', () => {
  it('opens a new empty chat from the Rail on the workspace route', () => {
    const { result } = renderNewChat('/')
    act(() => result.current.newChat())
    expect(openNewChat).toHaveBeenCalledWith({ reason: 'rail' })
  })

  it('goes back to the workspace route first, then opens the new chat', () => {
    let frame: FrameRequestCallback | null = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frame = cb
      return 0
    })
    const { result } = renderNewChat('/settings')
    act(() => result.current.newChat())
    expect(result.current.pathname).toBe('/')
    expect(openNewChat).not.toHaveBeenCalled()
    act(() => frame?.(0))
    expect(openNewChat).toHaveBeenCalledWith({ reason: 'rail' })
  })
})
