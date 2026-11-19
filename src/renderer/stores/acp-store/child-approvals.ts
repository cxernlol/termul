/**
 * An orchestrated subagent runs as its own host agent and raises its
 * approvals, questions and elicitations under its chat's session, as itself
 * (`agentId` is the child's, matching its record's `agent.agentId`). Those
 * prompts belong to the subagent's run, not to the chat's turn: a turn end
 * drops only the prompts of the agent whose turn it was, and the run's settle
 * card dismisses the run's own. The host releases its relay tickets by the
 * same key.
 */

import type { AgentId, SessionId } from '@/lib/acp-api'
import { logFrontendError } from '@/lib/log-api'
import { parseSubagent } from './subagent-lifecycle'
import type { AcpState } from './types'

type PromptKeys = 'pendingPermissions' | 'pendingQuestions' | 'pendingElicitations'

/** Remove the pending prompts `agentId` raised in `sessionId`. */
export function dropAgentPromptsInSession<T extends { sessionId: SessionId; agentId: AgentId }>(
  pending: Record<string, T>,
  sessionId: SessionId,
  agentId: AgentId
): Record<string, T> {
  const next = { ...pending }
  for (const id of Object.keys(next)) {
    if (next[id].sessionId === sessionId && next[id].agentId === agentId) delete next[id]
  }
  return next
}

/**
 * The card of an orchestrated run that settled dismisses the approvals,
 * questions and elicitations its agent still had up in `sessionId`: nothing
 * else on the chat ends them, as the subagent's own turn end and disconnect
 * never reach the chat. A call that settles no run, or a run with none up,
 * writes nothing.
 */
export function dismissSettledChildApprovals(
  get: () => Pick<AcpState, PromptKeys>,
  set: (partial: Pick<AcpState, PromptKeys>) => void,
  sessionId: SessionId,
  call: { toolCallId: string; _meta?: unknown }
): void {
  const record = parseSubagent(call.toolCallId, call._meta)
  if (record?.source !== 'orchestrated' || record.activity !== 'idle' || !record.agent) return
  const agentId = record.agent.agentId
  const state = get()
  const pendingPermissions = dropAgentPromptsInSession(state.pendingPermissions, sessionId, agentId)
  const pendingQuestions = dropAgentPromptsInSession(state.pendingQuestions, sessionId, agentId)
  const pendingElicitations = dropAgentPromptsInSession(
    state.pendingElicitations ?? {},
    sessionId,
    agentId
  )
  const count = (map: Record<string, unknown> | undefined) => Object.keys(map ?? {}).length
  const permissions = count(state.pendingPermissions) - count(pendingPermissions)
  const questions = count(state.pendingQuestions) - count(pendingQuestions)
  const elicitations = count(state.pendingElicitations) - count(pendingElicitations)
  if (permissions + questions + elicitations === 0) return
  set({ pendingPermissions, pendingQuestions, pendingElicitations })
  void logFrontendError({
    level: 'info',
    source: 'acp.childApprovals',
    message: `Dismissed ${permissions} approval(s), ${questions} question(s) and ${elicitations} elicitation(s) of a settled orchestrated subagent`
  })
}
