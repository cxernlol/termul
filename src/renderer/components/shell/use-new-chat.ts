import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { type NewChatReason, openNewChat } from '@/components/chat/new-chat/open-new-chat'

/**
 * New chat from the Rail, the menus or the phone: a new empty chat in the
 * active pane (`openNewChat`, which skips with a log when no project is
 * open). Chat tabs only render on the workspace route, so a child route goes
 * back to `/` first and the chat opens on the next frame.
 */
export function openNewChatOnWorkspace(
  pathname: string,
  navigate: (to: string) => void,
  reason: NewChatReason
): void {
  const open = (): void => void openNewChat({ reason })
  if (pathname === '/') {
    open()
    return
  }
  navigate('/')
  requestAnimationFrame(open)
}

/** {@link openNewChatOnWorkspace} bound to the current route. */
export function useNewChat(reason: NewChatReason = 'rail'): () => void {
  const pathname = useLocation().pathname
  const navigate = useNavigate()
  return useCallback(
    () => openNewChatOnWorkspace(pathname, navigate, reason),
    [navigate, pathname, reason]
  )
}
