import { useRef, useState } from 'react'
import { AlertCircle, Check, RotateCcw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import {
  AccountNameStep,
  AccountStepHeader,
  AccountSteps,
  AccountSummary,
  type AddAccountStep
} from './account-dialog-parts'
import { accountErrorText } from './account-error'

interface NamedAccount {
  id: string
  name: string
}

/** What the Sign in step gets from the flow. */
export interface SignInStepContext<A extends NamedAccount> {
  account: A
  onSignedIn: () => void
  onFailed: (reason: string) => void
  onCancel: () => void
  /** True while a sign-in runs that cannot be stopped: the dialog stays open. */
  setLocked: (locked: boolean) => void
}

/** The parts of "Add account" that differ between Claude and Codex. */
export interface AddAccountProvider<A extends NamedAccount> {
  /** "Claude" or "Codex". */
  name: string
  create: (name: string) => Promise<A>
  setDefault: (accountId: string) => Promise<void>
  /** Plan and usage of the new account, for the ready step. */
  summary: (account: A) => { plan: string | null; usageLabel: string; usageValue: string }
  /**
   * A sign-in the flow runs itself right after the name (and on Try again):
   * resolves `true` when signed in, `false` when the user stopped it.
   */
  startSignIn?: (account: A) => Promise<boolean>
  /** Stops a running `startSignIn` when the dialog closes. */
  cancelSignIn?: (account: A) => void
  renderSignIn: (context: SignInStepContext<A>) => React.ReactNode
  /** The failed step's reason when the sign-in gave none. */
  failedReason: string
}

interface AddAccountDialogShellProps<A extends NamedAccount> {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider: AddAccountProvider<A>
  /** Names already in use, so suggestions skip them. */
  existingNames: string[]
  defaultAccountName: string | null
  /** Called after the account list changed (created, signed in, default). */
  onChanged: () => Promise<void>
  /** Reads the new account's usage after it signed in. */
  onSignedIn: (account: A) => Promise<void>
}

/**
 * "Add account" as one dialog that stays open through the sign-in, the same
 * for every provider: Name → Sign in → Done, or a failed step with Try again.
 * The content unmounts on close, so each open starts at Name.
 */
export function AddAccountDialogShell<A extends NamedAccount>({
  open,
  onOpenChange,
  ...flow
}: AddAccountDialogShellProps<A>): React.JSX.Element {
  const [locked, setLocked] = useState(false)
  // The flow's Cancel: Escape and the close button stop a running sign-in too.
  const cancelRef = useRef<() => void>(() => onOpenChange(false))
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else if (!locked) cancelRef.current()
      }}
    >
      <DialogContent className="gap-5 sm:max-w-[400px]">
        <AddAccountFlow
          {...flow}
          setLocked={setLocked}
          cancelRef={cancelRef}
          close={() => {
            setLocked(false)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function AddAccountFlow<A extends NamedAccount>({
  provider,
  existingNames,
  defaultAccountName,
  onChanged,
  onSignedIn,
  setLocked,
  cancelRef,
  close
}: Omit<AddAccountDialogShellProps<A>, 'open' | 'onOpenChange'> & {
  setLocked: (locked: boolean) => void
  cancelRef: React.MutableRefObject<() => void>
  close: () => void
}): React.JSX.Element {
  const [step, setStep] = useState<AddAccountStep>('name')
  const [name, setName] = useState('')
  const [account, setAccount] = useState<A | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Remounts the provider's Sign in step on Try again.
  const [attempt, setAttempt] = useState(0)

  const fail = (reason: string): void => {
    setLocked(false)
    setError(reason)
    setStep('failed')
  }

  const signedIn = async (target: A): Promise<void> => {
    setLocked(false)
    try {
      await onChanged()
      await onSignedIn(target)
      setStep('done')
    } catch (err) {
      fail(accountErrorText(err))
    }
  }

  const signIn = async (target: A): Promise<void> => {
    setStep('signing')
    setError(null)
    setAttempt((n) => n + 1)
    if (!provider.startSignIn) return
    try {
      if (await provider.startSignIn(target)) await signedIn(target)
    } catch (err) {
      fail(accountErrorText(err))
    }
  }

  const submitName = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await provider.create(trimmed)
      setAccount(created)
      await onChanged()
      void signIn(created)
    } catch (err) {
      setError(accountErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  const cancel = (): void => {
    if (step === 'signing' && account) provider.cancelSignIn?.(account)
    close()
  }
  cancelRef.current = cancel

  const makeDefault = async (): Promise<void> => {
    if (!account) return
    setBusy(true)
    try {
      await provider.setDefault(account.id)
      await onChanged()
      close()
    } catch (err) {
      setError(accountErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  const summary = account && step === 'done' ? provider.summary(account) : null

  return (
    <>
      {step !== 'failed' && <AccountSteps step={step} />}

      {step === 'name' && (
        <AccountNameStep
          provider={provider.name}
          name={name}
          onNameChange={setName}
          existingNames={existingNames}
          error={error}
          busy={busy}
          onSubmit={() => void submitName()}
          onCancel={close}
        />
      )}

      {step === 'signing' && account && (
        <SignInSlot key={attempt}>
          {provider.renderSignIn({
            account,
            onSignedIn: () => void signedIn(account),
            onFailed: fail,
            onCancel: cancel,
            setLocked
          })}
        </SignInSlot>
      )}

      {step === 'done' && account && summary && (
        <>
          <AccountStepHeader
            tone="success"
            icon={<Check size={15} />}
            title={`${account.name} is ready`}
          >
            New chats in projects that use {account.name} sign in with it.
          </AccountStepHeader>
          <AccountSummary {...summary} defaultAccountName={defaultAccountName} />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => void makeDefault()} disabled={busy}>
              Make default
            </Button>
            <Button size="sm" onClick={close} disabled={busy}>
              Done
            </Button>
          </DialogFooter>
        </>
      )}

      {step === 'failed' && account && (
        <>
          <AccountStepHeader
            tone="warning"
            icon={<AlertCircle size={15} />}
            title="Sign-in did not finish"
          >
            {error ?? provider.failedReason} {account.name} stays in your list, signed out.
          </AccountStepHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={close}>
              Close
            </Button>
            <Button size="sm" onClick={() => void signIn(account)}>
              <RotateCcw />
              Try again
            </Button>
          </DialogFooter>
        </>
      )}
    </>
  )
}

/** A keyed wrapper, so Try again gives the provider's step fresh state. */
function SignInSlot({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <>{children}</>
}
