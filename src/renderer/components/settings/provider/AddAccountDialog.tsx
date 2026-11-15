import type { ClaudeAccount, ClaudeAccountUsage } from '@shared/types/claude-accounts.types'
import { Globe } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { claudeAccountsApi, isClaudeLoginCancelled } from '@/lib/claude-accounts-api'
import { planLabel, primaryUsageWindow, usageWindowLabel } from '@/lib/claude-usage-format'
import { AddAccountDialogShell, type AddAccountProvider } from './AddAccountFlow'
import { AccountSignInWaiting, AccountStepHeader } from './account-dialog-parts'
import { LinkSignInStep } from './LinkSignInStep'

interface AddAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names already in use, so suggestions skip them. */
  existingNames: string[]
  defaultAccountName: string | null
  /** Latest usage reads, to summarise the new Account when it is ready. */
  usage: Record<string, ClaudeAccountUsage>
  /** Called after the Account list changed (created, signed in, default). */
  onChanged: () => Promise<void>
  /** Read the new Account's usage after it signed in. */
  onSignedIn: (account: ClaudeAccount) => Promise<void>
}

/**
 * "Add account" for Claude. The desktop app waits for the host's browser
 * (closing the dialog cancels that login); a browser client shows the link
 * sign-in, which stops its own sign-in when it closes.
 */
export function AddAccountDialog({ usage, ...props }: AddAccountDialogProps): React.JSX.Element {
  const flow = claudeAccountsApi.signInFlow()
  const provider: AddAccountProvider<ClaudeAccount> = {
    name: 'Claude',
    create: (name) => claudeAccountsApi.add(name),
    setDefault: (id) => claudeAccountsApi.setDefault(id),
    summary: (account) => {
      const read = usage[account.id]
      const primary = primaryUsageWindow(read)
      return {
        plan: planLabel(read?.subscriptionType ?? null),
        usageLabel: primary ? usageWindowLabel(primary) : 'Usage',
        usageValue: primary ? `${Math.round(primary.percent)}% used` : 'not started'
      }
    },
    startSignIn:
      flow === 'browser'
        ? async (account) => {
            try {
              await claudeAccountsApi.login(account.id)
              return true
            } catch (err) {
              if (isClaudeLoginCancelled(err)) return false
              throw err
            }
          }
        : undefined,
    cancelSignIn:
      flow === 'browser' ? (account) => void claudeAccountsApi.cancelLogin(account.id) : undefined,
    renderSignIn: ({ account, onSignedIn, onCancel }) =>
      flow === 'link' ? (
        <LinkSignInStep account={account} onCancel={onCancel} onSignedIn={onSignedIn} />
      ) : (
        <>
          <AccountStepHeader
            tone="muted"
            icon={<Globe size={15} />}
            title={`Sign in to ${account.name}`}
          >
            Your browser opened claude.ai. Sign in with the account you want to add, then come back
            here.
          </AccountStepHeader>
          <AccountSignInWaiting />
          <p className="text-2xs leading-relaxed text-muted-foreground">
            Already signed in to another account on claude.ai? Sign out there first, or open the
            sign-in page in a private window.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </DialogFooter>
        </>
      ),
    failedReason: 'The browser window closed or timed out.'
  }
  return <AddAccountDialogShell provider={provider} {...props} />
}
