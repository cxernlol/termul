import type {
  ClaudeAccountsSnapshot,
  ClaudeAccountUsage,
  ClaudeAccountView,
  ClaudeUsageWindow
} from '@shared/types/claude-accounts.types'
import { accountReadiness } from '@/components/settings/provider/account-status'
import { type ClaudeAccountsState, useClaudeAccounts } from '@/hooks/use-claude-accounts'
import { primaryUsageWindow } from '@/lib/claude-usage-format'

export interface AccountChoice {
  account: ClaudeAccountView
  usage: ClaudeAccountUsage | undefined
  window: ClaudeUsageWindow | null
}

export interface ProjectClaudeAccount {
  accounts: ClaudeAccountsState
  projectId: string
  /** The Account in use now: the chat's for a chat context, else the Project's. */
  current: AccountChoice
  defaultAccount: ClaudeAccountView | null
  /** `true` when the Project chose an Account (not "Follow default"). */
  explicit: boolean
  /** Signed-in Accounts other than `current` with room left, least used first. */
  alternatives: AccountChoice[]
}

const choice = (
  account: ClaudeAccountView,
  usage: Record<string, ClaudeAccountUsage>
): AccountChoice => ({
  account,
  usage: usage[account.id],
  window: primaryUsageWindow(usage[account.id])
})

/** The chat's own Account, when its entry names an Account the host still has. */
export function ownChatAccountId(
  snapshot: ClaudeAccountsSnapshot,
  sessionId: string
): string | null {
  const id = snapshot.chatAccounts[sessionId]
  return id !== undefined && snapshot.accounts.some((a) => a.id === id) ? id : null
}

/**
 * The Account a chat or Project uses, resolved like the host: the chat's own
 * choice, else its Project's, else the Default Account.
 */
export const claudeAccountFor = (
  snapshot: ClaudeAccountsSnapshot,
  projectId: string,
  sessionId?: string
): string =>
  (sessionId ? ownChatAccountId(snapshot, sessionId) : null) ??
  snapshot.projectAccounts[projectId] ??
  snapshot.defaultAccountId

/** Signed-in Accounts other than `currentId` with room left, least used first. */
export function rankAlternatives(
  snapshot: ClaudeAccountsSnapshot,
  usage: Record<string, ClaudeAccountUsage>,
  currentId: string
): AccountChoice[] {
  return snapshot.accounts
    .filter((a) => a.id !== currentId && accountReadiness(a, usage[a.id]) === 'ready')
    .map((a) => choice(a, usage))
    .filter((c) => (c.window?.percent ?? 0) < 100)
    .sort((x, y) => (x.window?.percent ?? 0) - (y.window?.percent ?? 0))
}

/**
 * The Claude Account context of a Project, or of one of its chats when
 * `sessionId` is given. `null` while the Account list loads.
 */
export function claudeAccountContext(
  accounts: ClaudeAccountsState,
  projectId: string,
  sessionId?: string
): ProjectClaudeAccount | null {
  const { snapshot, usage } = accounts
  if (!snapshot) return null

  const defaultAccount = snapshot.accounts.find((a) => a.id === snapshot.defaultAccountId) ?? null
  const currentId = claudeAccountFor(snapshot, projectId, sessionId)
  const currentAccount = snapshot.accounts.find((a) => a.id === currentId)
  if (!currentAccount) return null

  return {
    accounts,
    projectId,
    current: choice(currentAccount, usage),
    defaultAccount,
    explicit: Boolean(snapshot.projectAccounts[projectId]),
    alternatives: rankAlternatives(snapshot, usage, currentAccount.id)
  }
}

/**
 * The Claude Account context of one Project, before or without a chat.
 * `null` for no Project (nothing is read) and while the Account list loads.
 */
export function useProjectClaudeAccount(projectId: string | null): ProjectClaudeAccount | null {
  const accounts = useClaudeAccounts({ enabled: Boolean(projectId) })
  return projectId ? claudeAccountContext(accounts, projectId) : null
}
