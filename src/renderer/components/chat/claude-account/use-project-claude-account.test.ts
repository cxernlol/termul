import type { ClaudeAccountsSnapshot } from '@shared/types/claude-accounts.types'
import { describe, expect, it } from 'vitest'
import { claudeAccountFor } from './use-project-claude-account'

const snapshot: ClaudeAccountsSnapshot = {
  accounts: [
    { id: 'default', name: 'Default', builtin: true, signedIn: true },
    { id: 'work', name: 'Work', builtin: false, signedIn: true },
    { id: 'spare', name: 'Spare', builtin: false, signedIn: true }
  ],
  defaultAccountId: 'default',
  projectAccounts: { office: 'work' },
  chatAccounts: { s1: 'spare', s2: 'gone' },
  autoSwitch: true
}

describe('claudeAccountFor', () => {
  it.each([
    ['a chat override wins over its project', 'office', 's1', 'spare'],
    ['a chat override wins over the default', 'home', 's1', 'spare'],
    ['a chat without an override uses its project', 'office', 's3', 'work'],
    ['no project choice uses the default', 'home', 's3', 'default'],
    ['a chat naming an unknown account falls through to its project', 'office', 's2', 'work'],
    ['no session id ignores chat overrides', 'office', undefined, 'work'],
    ['no session id and no project choice uses the default', 'home', undefined, 'default']
  ])('%s', (_case, projectId, sessionId, expected) => {
    expect(claudeAccountFor(snapshot, projectId, sessionId)).toBe(expected)
  })
})
