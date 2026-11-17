import type { ClaudeAccountView, ClaudeRateLimit } from '@shared/types/claude-accounts.types'
import { useClaudeAccounts } from '@/hooks/use-claude-accounts'
import { useAcpStore } from '@/stores/acp-store'
import { isClaudeSession } from '@/stores/claude-account-switch'
import {
  claudeAccountContext,
  claudeAccountFor,
  ownChatAccountId,
  type ProjectClaudeAccount
} from './use-project-claude-account'

export interface ChatClaudeAccount extends ProjectClaudeAccount {
  sessionId: string
  /** Live limit state from the running turn, when Claude sent one. */
  rateLimit: ClaudeRateLimit | null
  /** `true` when the chat runs its own Account instead of following its Project. */
  ownAccount: boolean
  /** The Account the chat's Project uses. */
  projectAccount: ClaudeAccountView
}

/** The Claude Account context of one chat; `null` for a chat that is not a managed Claude chat. */
export function useChatClaudeAccount(sessionId: string): ChatClaudeAccount | null {
  const isClaude = useAcpStore((s) => isClaudeSession(s, sessionId))
  const projectId = useAcpStore((s) => s.sessions?.[sessionId]?.projectId ?? '')
  const rateLimit = useAcpStore((s) => s.sessionUsage?.[sessionId]?.rateLimit ?? null)
  const accounts = useClaudeAccounts({ enabled: isClaude && Boolean(projectId) })
  const snapshot = accounts.snapshot
  if (!isClaude || !projectId || !snapshot) return null

  const chat = claudeAccountContext(accounts, projectId, sessionId)
  const projectAccountId = claudeAccountFor(snapshot, projectId)
  const projectAccount = snapshot.accounts.find((a) => a.id === projectAccountId)
  if (!chat || !projectAccount) return null
  return {
    ...chat,
    sessionId,
    rateLimit,
    ownAccount: ownChatAccountId(snapshot, sessionId) !== null,
    projectAccount
  }
}
