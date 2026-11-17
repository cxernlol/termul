import { ownChatAccountId } from '@/components/chat/claude-account/use-project-claude-account'
import { CLAUDE_AGENT_CONFIG_ID } from '@/lib/agents/registry-config-id'
import { claudeAccountsApi } from '@/lib/claude-accounts-api'
import { logFrontendError } from '@/lib/log-api'
import { reuseScopeFor } from '../acp-reuse-keys'

/**
 * The chat's own Claude Account; `null` when it follows its Project,
 * `undefined` when the host cannot list the Accounts.
 */
export async function readOwnChatAccount(sessionId: string): Promise<string | null | undefined> {
  try {
    return ownChatAccountId(await claudeAccountsApi.list(), sessionId)
  } catch {
    void logFrontendError({
      level: 'warn',
      source: 'acp.reuseScope',
      message: `Claude accounts unreadable for chat ${sessionId}; it gets an agent of its own`
    })
    return undefined
  }
}

/**
 * The chat id the agent that reopens existing chat `sessionId` is keyed to
 * ({@link reuseScopeFor}). Only a managed Claude chat can run its own
 * Account, so any other agent reads nothing and shares its Project's agents.
 */
export async function readReuseScope(
  configId: string,
  sessionId: string
): Promise<string | undefined> {
  if (configId !== CLAUDE_AGENT_CONFIG_ID) return undefined
  return reuseScopeFor(sessionId, await readOwnChatAccount(sessionId))
}
