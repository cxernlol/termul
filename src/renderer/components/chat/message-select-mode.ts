import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { logFrontendError } from '@/lib/log-api'

/**
 * "Select text" mode on the phone (Paper "10.3"): one message at a time lets
 * native touch selection run inside it, instead of the long-press that opens
 * its actions sheet. A tiny module store, so starting the mode on one message
 * ends it on any other.
 */
let selectedMessageId: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): string | null {
  return selectedMessageId
}

/** Start select mode on `messageId`; any other message leaves it. */
export function enterMessageSelectMode(messageId: string): void {
  if (selectedMessageId === messageId) return
  selectedMessageId = messageId
  emit()
  // Boundary log: never the message text.
  void logFrontendError({
    level: 'info',
    source: 'MessageActions.selectMode',
    message: 'select text mode entered'
  })
}

/** Leave select mode if `messageId` holds it (no id: leave it on any message). */
export function exitMessageSelectMode(messageId?: string): void {
  if (selectedMessageId === null) return
  if (messageId !== undefined && selectedMessageId !== messageId) return
  selectedMessageId = null
  emit()
  void logFrontendError({
    level: 'info',
    source: 'MessageActions.selectMode',
    message: 'select text mode left'
  })
}

/** True while `messageId` is in select mode, plus a stable exit for it. */
export function useMessageSelectMode(messageId: string): {
  selecting: boolean
  exit: () => void
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const exit = useCallback(() => exitMessageSelectMode(messageId), [messageId])
  // Leaving the message (closing the chat, switching sessions) ends its select
  // mode, so reopening it shows the action row again.
  useEffect(() => () => exitMessageSelectMode(messageId), [messageId])
  return { selecting: current === messageId, exit }
}

/** Test-only: clear the mode without logging. */
export function resetMessageSelectModeForTests(): void {
  selectedMessageId = null
  emit()
}
