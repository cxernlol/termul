import { CODEX_CHATGPT_METHOD, type CodexAccountView } from '@shared/types/codex-accounts.types'
import { useState } from 'react'
import { Globe } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { CODEX_SIGN_IN_METHODS, signInCodexAccount } from '@/lib/codex-account-sign-in'
import { AccountSignInWaiting, AccountStepHeader } from './account-dialog-parts'
import { accountErrorText } from './account-error'

/**
 * The Codex "Sign in" step: pick ChatGPT in the browser or a device code,
 * then wait while the host sign-in window shows the page or the code. Same
 * layout as the Claude sign-in step.
 */
export function CodexSignInStep({
  accountName,
  method,
  error,
  onPick,
  onCancel
}: {
  accountName: string
  /** The method that is running, or null while the user picks one. */
  method: string | null
  error: string | null
  onPick: (methodId: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const description =
    method === null
      ? 'Codex accounts use a ChatGPT login. Sign in with the browser, or use a device code on another device.'
      : method === CODEX_CHATGPT_METHOD
        ? 'Your browser opened ChatGPT. Sign in with the account you want to add, then come back here.'
        : 'Enter the code from the sign-in window on any device, then come back here.'
  return (
    <>
      <AccountStepHeader
        tone="muted"
        icon={<Globe size={15} />}
        title={`Sign in to ${accountName}`}
      >
        {description}
      </AccountStepHeader>
      {method === null ? (
        <div className="grid gap-2">
          {CODEX_SIGN_IN_METHODS.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={option.id === CODEX_CHATGPT_METHOD ? 'default' : 'secondary'}
              onClick={() => onPick(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : (
        <AccountSignInWaiting />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <DialogFooter>
        {/* A running sign-in cannot be stopped here: the host window has its own Cancel. */}
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={method !== null}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * Runs a Codex sign-in: the method pick, then the wait. `onRunningChange`
 * reports a running sign-in, so the dialog can stay open until it ends.
 * Without `onFailed` a failure shows its reason here and the pick comes back.
 */
export function CodexSignInRun({
  account,
  onRunningChange,
  onSignedIn,
  onFailed,
  onCancel
}: {
  account: CodexAccountView
  onRunningChange: (running: boolean) => void
  onSignedIn: () => void
  onFailed?: (reason: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [method, setMethod] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async (methodId: string): Promise<void> => {
    setMethod(methodId)
    setError(null)
    onRunningChange(true)
    try {
      await signInCodexAccount(account.id, methodId)
      onRunningChange(false)
      onSignedIn()
    } catch (err) {
      onRunningChange(false)
      if (onFailed) {
        onFailed(accountErrorText(err))
        return
      }
      setError(accountErrorText(err))
      setMethod(null)
    }
  }

  return (
    <CodexSignInStep
      accountName={account.name}
      method={method}
      error={error}
      onPick={(methodId) => void start(methodId)}
      onCancel={onCancel}
    />
  )
}
