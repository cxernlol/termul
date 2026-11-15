import type { CodexAccountUsage, CodexAccountView } from '@shared/types/codex-accounts.types'
import type { AccountTone } from './account-status'

/** Whether Codex chats can start on an Account: only a confirmed login passes. */
export type CodexAccountReadiness = 'ready' | 'signed-out' | 'unconfirmed'

export function codexAccountReadiness(
  account: CodexAccountView,
  usage?: Pick<CodexAccountUsage, 'status'>
): CodexAccountReadiness {
  if (account.signedIn === false || usage?.status === 'signed_out') return 'signed-out'
  return account.signedIn === true ? 'ready' : 'unconfirmed'
}

export const CODEX_NOT_READY_REASON: Record<Exclude<CodexAccountReadiness, 'ready'>, string> = {
  'signed-out': 'Signed out',
  unconfirmed: 'Could not check sign-in'
}

/** The status dot of a Codex account row, the same tones as a Claude row. */
export const CODEX_STATUS_TONE: Record<CodexAccountReadiness, AccountTone> = {
  ready: 'ok',
  'signed-out': 'signed-out',
  unconfirmed: 'unknown'
}
