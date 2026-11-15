import { useId } from 'react'
import { ArrowRight, Check } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { AccountGlyph } from './AccountGlyph'

/*
 * The parts of the "Add account" dialogs. Claude and Codex use the same
 * steps, copy and layout: Name → Sign in → Done, or a failed step.
 */

const MAX_NAME_CHARS = 40
const NAME_SUGGESTIONS = ['Work', 'Personal', 'Team']

export type AddAccountStep = 'name' | 'signing' | 'done' | 'failed'

/** "1 Name — 2 Sign in — 3 Done" at the top of the dialog. */
export function AccountSteps({ step }: { step: AddAccountStep }): React.JSX.Element {
  const index = step === 'name' ? 0 : step === 'done' ? 2 : 1
  const steps = ['Name', 'Sign in', 'Done']
  return (
    <ol className="flex items-center gap-1.5" aria-label="Steps">
      {steps.map((label, i) => (
        <li
          key={label}
          className="flex items-center gap-1.5"
          aria-current={i === index ? 'step' : undefined}
        >
          <span
            className={cn(
              'flex size-4 items-center justify-center rounded-full text-4xs font-semibold tabular-nums',
              i < index && 'bg-foreground text-background',
              i === index && 'bg-muted text-foreground ring-1 ring-inset ring-muted-foreground',
              i > index && 'text-muted-foreground ring-1 ring-inset ring-border'
            )}
          >
            {i < index ? <Check size={10} /> : i + 1}
          </span>
          <span
            className={cn(
              'text-2xs',
              i <= index ? 'text-secondary-foreground' : 'text-muted-foreground'
            )}
          >
            {label}
          </span>
          {i < steps.length - 1 && <span aria-hidden="true" className="h-px w-4 bg-border" />}
        </li>
      ))}
    </ol>
  )
}

/** Step 1: the account name, with the suggestions that are not in use yet. */
export function AccountNameStep({
  provider,
  name,
  onNameChange,
  existingNames,
  error,
  busy,
  onSubmit,
  onCancel
}: {
  /** "Claude" or "Codex". */
  provider: string
  name: string
  onNameChange: (name: string) => void
  /** Names already in use, so suggestions skip them. */
  existingNames: string[]
  error: string | null
  busy: boolean
  onSubmit: () => void
  onCancel: () => void
}): React.JSX.Element {
  const inputId = useId()
  const suggestions = NAME_SUGGESTIONS.filter(
    (suggestion) => !existingNames.some((used) => used.toLowerCase() === suggestion.toLowerCase())
  )
  return (
    <>
      <DialogHeader>
        <DialogTitle>Add a {provider} account</DialogTitle>
        <DialogDescription>
          Give it a short name. Troupe shows this name, never the email.
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <Label htmlFor={inputId} className="text-xs">
          Name
        </Label>
        <Input
          id={inputId}
          value={name}
          maxLength={MAX_NAME_CHARS}
          autoFocus
          placeholder="e.g. Work"
          onChange={(event) => onNameChange(event.target.value)}
          className="h-9"
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => onNameChange(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={busy}>
          {busy ? 'Adding…' : 'Continue'}
          {!busy && <ArrowRight />}
        </Button>
      </DialogFooter>
    </>
  )
}

/** A step title with its glyph (sign in, ready, failed). */
export function AccountStepHeader({
  tone,
  icon,
  title,
  children
}: {
  tone: 'muted' | 'success' | 'warning'
  icon: React.ReactNode
  title: React.ReactNode
  /** The description. */
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <DialogHeader className="flex-row items-start gap-3 space-y-0 text-left">
      <AccountGlyph tone={tone}>{icon}</AccountGlyph>
      <div className="flex flex-col gap-1">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{children}</DialogDescription>
      </div>
    </DialogHeader>
  )
}

/** The "Waiting for the sign-in…" line. */
export function AccountSignInWaiting(): React.JSX.Element {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-secondary-foreground"
    >
      <Spinner size={14} decorative />
      Waiting for the sign-in…
    </div>
  )
}

/** The new account's plan, usage and default, on the ready step. */
export function AccountSummary({
  plan,
  usageLabel,
  usageValue,
  defaultAccountName
}: {
  plan: string | null
  usageLabel: string
  usageValue: string
  defaultAccountName: string | null
}): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border border-border bg-background p-3 text-2xs">
      <dt className="text-muted-foreground">Plan</dt>
      <dd className="text-right text-secondary-foreground">{plan ?? '—'}</dd>
      <dt className="text-muted-foreground">{usageLabel}</dt>
      <dd className="text-right tabular-nums text-secondary-foreground">{usageValue}</dd>
      <dt className="text-muted-foreground">Default</dt>
      <dd className="text-right text-secondary-foreground">
        {defaultAccountName ? `No — ${defaultAccountName} stays default` : 'No'}
      </dd>
    </dl>
  )
}
