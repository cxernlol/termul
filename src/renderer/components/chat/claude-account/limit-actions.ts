import type { ClaudeLimitActionEvent } from '@shared/types/claude-accounts.types'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { ACP_EVENTS, onAcpEvent } from '@/lib/acp-api'
import { logFrontendError } from '@/lib/log-api'
import { renewAgentCredentials, useAcpStore } from '@/stores/acp-store'
import { CLAUDE_AGENT_CONFIG_ID } from '@/stores/claude-account-switch'

/** When the host continues each chat after its limit resets, epoch ms. */
export const useClaudeResumeAt = create<Record<string, number>>(() => ({}))

function setResumeAt(sessionId: string, at: number | null): void {
  useClaudeResumeAt.setState((s) => {
    const { [sessionId]: _done, ...rest } = s
    return at === null ? rest : { ...rest, [sessionId]: at }
  }, true)
}

type FollowEvent = Extract<ClaudeLimitActionEvent, { action: 'switched' | 'resumed' }>

/**
 * Point the chat at the agent the host moved it to. `waiting` when the chat
 * still runs on the replaced agent but this client has not seen the new one
 * connect yet (that status arrives on its own channel).
 */
function followAgent(e: FollowEvent): 'followed' | 'waiting' | 'stale' {
  const state = useAcpStore.getState()
  const session = state.sessions[e.sessionId]
  if (!session || e.fromAgentId === null || session.agentId !== e.fromAgentId) return 'stale'
  if (state.agentStatus[e.newAgentId] !== 'connected') return 'waiting'
  useAcpStore.setState((s) => {
    let sessionUsage = s.sessionUsage
    const usage = s.sessionUsage[e.sessionId]
    if (usage?.rateLimit) {
      const { rateLimit: _cleared, ...rest } = usage
      sessionUsage = { ...s.sessionUsage, [e.sessionId]: rest }
    }
    return {
      sessions: {
        ...s.sessions,
        [e.sessionId]: { ...session, agentId: e.newAgentId, status: 'active' }
      },
      sessionUsage
    }
  })
  return 'followed'
}

/** How long a follow waits for the host's new agent to connect here. */
export const FOLLOW_WAIT_MS = 60_000

/** Follows waiting for their new agent to connect, by chat. */
const pendingFollows = new Map<
  string,
  { event: FollowEvent; timer: ReturnType<typeof setTimeout> }
>()
let stopWatching: (() => void) | null = null

function dropPending(sessionId: string): void {
  const pending = pendingFollows.get(sessionId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingFollows.delete(sessionId)
  if (pendingFollows.size === 0) {
    stopWatching?.()
    stopWatching = null
  }
}

function followed(e: FollowEvent): void {
  void logFrontendError({
    level: 'info',
    source: 'claudeLimit.follow',
    message: `Chat ${e.sessionId} follows host agent ${e.newAgentId} (${e.action})`
  })
  if (e.action === 'switched') {
    renewAgentCredentials(CLAUDE_AGENT_CONFIG_ID, e.projectId)
    toast.success(`${e.from.name} reached its limit. Continued on ${e.to.name}.`)
  }
}

/** A closed chat, or one that moved elsewhere first, reads `stale`. */
function retryPending(): void {
  for (const { event } of [...pendingFollows.values()]) {
    const outcome = followAgent(event)
    if (outcome === 'waiting') continue
    dropPending(event.sessionId)
    if (outcome === 'followed') followed(event)
  }
}

function follow(e: FollowEvent): void {
  dropPending(e.sessionId)
  const outcome = followAgent(e)
  if (outcome === 'followed') followed(e)
  if (outcome !== 'waiting') return
  const timer = setTimeout(() => {
    if (pendingFollows.get(e.sessionId)?.event !== e) return
    dropPending(e.sessionId)
    void logFrontendError({
      level: 'warn',
      source: 'claudeLimit.follow',
      message: `Chat ${e.sessionId}: host agent ${e.newAgentId} did not connect here within ${FOLLOW_WAIT_MS} ms; stopped waiting`
    })
  }, FOLLOW_WAIT_MS)
  pendingFollows.set(e.sessionId, { event: e, timer })
  stopWatching ??= useAcpStore.subscribe(retryPending)
}

/** Failures already shown, by chat and session log position. */
const reportedFailures = new Set<string>()

/**
 * `eventSeq` is the event's position in the chat's log; a replayed failure
 * keeps it, so it toasts once.
 */
export function applyClaudeLimitAction(e: ClaudeLimitActionEvent, eventSeq?: number): void {
  switch (e.action) {
    case 'resume_scheduled':
      setResumeAt(e.sessionId, e.at)
      return
    case 'resume_cancelled':
      setResumeAt(e.sessionId, null)
      return
    case 'failed': {
      setResumeAt(e.sessionId, null)
      if (eventSeq !== undefined) {
        const key = `${e.sessionId}:${eventSeq}`
        if (reportedFailures.has(key)) return
        reportedFailures.add(key)
      }
      toast.warning('Troupe could not continue the chat', { description: e.reason })
      return
    }
    case 'switched':
    case 'resumed':
      setResumeAt(e.sessionId, null)
      follow(e)
  }
}

/** Mount once per renderer root. */
export function useClaudeLimitActions(): void {
  useEffect(
    () =>
      onAcpEvent<ClaudeLimitActionEvent>(ACP_EVENTS.claudeLimitAction, (e, eventSeq) =>
        applyClaudeLimitAction(e, eventSeq)
      ),
    []
  )
}
