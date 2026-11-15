import type { CodexAccountUsage, CodexAccountView } from '@shared/types/codex-accounts.types'
import { codexAccountsApi } from '@/lib/codex-accounts-api'
import { codexWindowLabel, planLabel, primaryCodexWindow } from '@/lib/codex-usage-format'
import { AddAccountDialogShell, type AddAccountProvider } from './AddAccountFlow'
import { CodexSignInRun } from './CodexSignInStep'

interface CodexAddAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names already in use, so suggestions skip them. */
  existingNames: string[]
  defaultAccountName: string | null
  /** Latest usage reads, to summarise the new Account when it is ready. */
  usage: Record<string, CodexAccountUsage>
  /** Called after the Account list changed (created, signed in, default). */
  onChanged: () => Promise<void>
  /** Read the new Account's usage after it signed in. */
  onSignedIn: (account: CodexAccountView) => Promise<void>
}

/**
 * "Add account" for Codex: the Sign in step picks ChatGPT in the browser or a
 * device code. A running sign-in cannot be stopped from here, so the dialog
 * stays open until it ends (the host sign-in window has its own Cancel).
 */
export function CodexAddAccountDialog({
  usage,
  ...props
}: CodexAddAccountDialogProps): React.JSX.Element {
  const provider: AddAccountProvider<CodexAccountView> = {
    name: 'Codex',
    create: async (name) => {
      const created = await codexAccountsApi.add(name)
      return { id: created.id, name: created.name, builtin: false, signedIn: false }
    },
    setDefault: (id) => codexAccountsApi.setDefault(id),
    summary: (account) => {
      const read = usage[account.id]
      const primary = primaryCodexWindow(read)
      return {
        plan: planLabel(read?.planType ?? null),
        usageLabel: primary ? codexWindowLabel(primary) : 'Usage',
        usageValue: primary ? `${Math.round(primary.percent)}% used` : 'not started'
      }
    },
    renderSignIn: ({ account, onSignedIn, onFailed, onCancel, setLocked }) => (
      <CodexSignInRun
        account={account}
        onRunningChange={setLocked}
        onSignedIn={onSignedIn}
        onFailed={onFailed}
        onCancel={onCancel}
      />
    ),
    failedReason: 'The sign-in window closed or timed out.'
  }
  return <AddAccountDialogShell provider={provider} {...props} />
}
