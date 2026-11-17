import type { ClaudeAccountView, ClaudeRateLimit } from '@shared/types/claude-accounts.types'
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, ExternalLink, Pin } from '@/components/icons'
import { toastAccountChoiceError } from '@/components/settings/provider/account-choice-error'
import {
  type AccountReadiness,
  accountReadiness,
  NOT_READY_REASON,
  StatusDot
} from '@/components/settings/provider/account-status'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import {
  fiveHourUsage,
  planLabel,
  type UsageReading,
  type UsageTone,
  usageTone
} from '@/lib/claude-usage-format'
import { cn } from '@/lib/utils'
import {
  type ChatSwitchToast,
  chatSwitchToast,
  showChatSwitchToast,
  switchChatClaudeAccount,
  switchProjectClaudeAccount
} from '@/stores/claude-account-switch'
import { useSettingsModalStore } from '@/stores/settings-modal-store'
import { useChatClaudeAccount } from './use-chat-claude-account'
import {
  type AccountChoice,
  type ProjectClaudeAccount,
  useProjectClaudeAccount
} from './use-project-claude-account'

const TONE_TEXT: Record<UsageTone, string> = {
  normal: 'text-secondary-foreground',
  warning: 'text-warning',
  critical: 'text-destructive'
}

const DOT_TONE = { normal: 'ok', warning: 'warning', critical: 'critical' } as const

const spoken = (r: UsageReading): string =>
  `${r.label.charAt(0).toLowerCase()}${r.label.slice(1)} ${r.percent}% used`

/** What the chip's menu chooses: the Account of one chat or of a Project. */
interface AccountScope {
  label: string
  /** The row that clears the explicit choice. */
  follow: { label: string; account: ClaudeAccountView | null }
  /** The explicit choice; `null` while following. */
  chosenId: string | null
  /** The chat runs its own Account, not its Project's. */
  chatOnly: boolean
  /** The note shown when the pick is the choice already made. */
  unchanged: string
  /** Apply the choice; resolves the toast to show, or `null` when nothing changed. */
  choose: (
    accountId: string | null,
    next: ClaudeAccountView | undefined
  ) => Promise<ChatSwitchToast | null>
}

/**
 * Composer chip for a Claude chat. The menu sets the Account of this chat
 * only; "Follow project" returns it to its Project's Account.
 */
export function ClaudeAccountChip({ sessionId }: { sessionId: string }): React.JSX.Element | null {
  const ctx = useChatClaudeAccount(sessionId)
  if (!ctx) return null
  return (
    <AccountChip
      ctx={ctx}
      rateLimit={ctx.rateLimit}
      scope={{
        label: 'Account for this chat',
        follow: { label: 'Follow project', account: ctx.projectAccount },
        chosenId: ctx.ownAccount ? ctx.current.account.id : null,
        chatOnly: ctx.ownAccount,
        unchanged: ctx.ownAccount
          ? `This chat already uses ${ctx.current.account.name}`
          : 'This chat already follows the project',
        choose: async (accountId, next) => {
          const moved = await switchChatClaudeAccount(
            {
              sessionId,
              projectId: ctx.projectId,
              runsOn: ctx.current.account.id,
              ownAccountId: ctx.ownAccount ? ctx.current.account.id : null,
              projectAccountId: ctx.projectAccount.id
            },
            accountId
          )
          return chatSwitchToast(moved, accountId === null ? null : (next?.name ?? accountId))
        }
      }}
    />
  )
}

/**
 * The chip before a chat exists (the agent launcher). The menu switches the
 * Project's Account; open Claude chats that follow the Project restart on it.
 */
export function ProjectClaudeAccountChip({
  projectId
}: {
  projectId: string
}): React.JSX.Element | null {
  const ctx = useProjectClaudeAccount(projectId)
  if (!ctx) return null
  return (
    <AccountChip
      ctx={ctx}
      rateLimit={null}
      scope={{
        label: 'Account for this project',
        follow: { label: 'Follow default', account: ctx.defaultAccount },
        chosenId: ctx.explicit ? ctx.current.account.id : null,
        chatOnly: false,
        unchanged: ctx.explicit
          ? `This project already uses ${ctx.current.account.name}`
          : 'This project already follows the default account',
        choose: async (accountId, next) => {
          await switchProjectClaudeAccount(projectId, accountId)
          return {
            kind: 'success',
            title: next ? `This project now uses ${next.name}` : 'Account changed'
          }
        }
      }}
    />
  )
}

/**
 * Which Account is in use and how much of its 5-hour window is used, plus any
 * other window near its limit.
 */
function AccountChip({
  ctx,
  rateLimit,
  scope
}: {
  ctx: ProjectClaudeAccount
  rateLimit: ClaudeRateLimit | null
  scope: AccountScope
}): React.JSX.Element {
  const openAppSettings = useSettingsModalStore((s) => s.openApp)
  const [switching, setSwitching] = useState(false)

  const signedOut = accountReadiness(ctx.current.account, ctx.current.usage) !== 'ready'
  const used = signedOut ? null : fiveHourUsage(ctx.current.usage, rateLimit)
  const segments = used
    ? [used.main, ...(used.other && used.other.tone !== 'normal' ? [used.other] : [])]
    : []
  const tone = usageTone(Math.max(0, ...segments.map((s) => s.percent)))
  const snapshot = ctx.accounts.snapshot

  const choose = async (accountId: string | null): Promise<void> => {
    if (accountId === scope.chosenId) {
      toast.info(scope.unchanged)
      return
    }
    const next =
      accountId === null
        ? (scope.follow.account ?? undefined)
        : snapshot?.accounts.find((a) => a.id === accountId)
    setSwitching(true)
    try {
      const result = await scope.choose(accountId, next)
      await ctx.accounts.reload()
      showChatSwitchToast(result)
    } catch (err) {
      toastAccountChoiceError(err, 'Could not switch the account')
      void ctx.accounts.reload()
    } finally {
      setSwitching(false)
    }
  }

  const row = (
    choiceId: string | null,
    label: string,
    sub: string,
    selected: boolean,
    readiness: AccountReadiness
  ) => (
    <DropdownMenuItem
      key={choiceId ?? 'follow'}
      disabled={readiness !== 'ready'}
      onSelect={() => void choose(choiceId)}
      className="flex items-center gap-2"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs text-foreground">{label}</span>
        <span className="truncate text-2xs text-muted-foreground">{sub}</span>
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {selected && <Check size={14} />}
      </span>
    </DropdownMenuItem>
  )

  const readinessOf = (account: AccountChoice['account']): AccountReadiness =>
    accountReadiness(account, ctx.accounts.usage[account.id])

  const describe = (account: AccountChoice['account']): string => {
    const readiness = readinessOf(account)
    if (readiness !== 'ready')
      return `${NOT_READY_REASON[readiness]} · sign in from Manage accounts`
    const usage = ctx.accounts.usage[account.id]
    const windows = fiveHourUsage(usage, null)
    const readings = [windows?.main, windows?.other].flatMap((r) =>
      r ? [`${r.label} ${r.percent}%`] : []
    )
    return (
      [planLabel(usage?.subscriptionType ?? null), ...readings].filter(Boolean).join(' · ') ||
      'Signed in'
    )
  }

  const name = ctx.current.account.name
  const followed = scope.follow.account
  const followReadiness = followed ? readinessOf(followed) : 'ready'
  const followState =
    followReadiness === 'ready' ? '' : ` · ${NOT_READY_REASON[followReadiness].toLowerCase()}`
  const subject = scope.chatOnly ? 'Claude account for this chat only' : 'Claude account'
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return
        void ctx.accounts.reload()
        void ctx.accounts.refreshUsage(false)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={switching}
          aria-busy={switching}
          className={cn(
            'relative flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-2xs text-muted-foreground transition-colors ease-out',
            "after:absolute after:-inset-1 after:content-['']",
            'hover:text-foreground data-[state=open]:text-foreground disabled:opacity-60'
          )}
          aria-label={`${subject}: ${[name, ...segments.map(spoken)].join(', ')}. Change account`}
        >
          {switching ? (
            <Spinner size={10} decorative />
          ) : (
            <StatusDot tone={signedOut ? 'signed-out' : DOT_TONE[tone]} />
          )}
          <span className="max-w-24 truncate">{name}</span>
          {scope.chatOnly && (
            <Pin size={11} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          {segments.map((segment, i) => (
            <span key={segment.short} className="flex items-center gap-1.5 tabular-nums">
              {i > 0 && <span aria-hidden>·</span>}
              <span className={TONE_TEXT[segment.tone]}>
                {segment.short} {segment.percent}%
              </span>
            </span>
          ))}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{scope.label}</DropdownMenuLabel>
        {followed &&
          row(
            null,
            scope.follow.label,
            `Uses ${followed.name}${followState}`,
            scope.chosenId === null,
            followReadiness
          )}
        {(snapshot?.accounts ?? []).map((account) =>
          row(
            account.id,
            account.name,
            describe(account),
            account.id === scope.chosenId,
            readinessOf(account)
          )
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => openAppSettings('provider')}
          className="flex items-center gap-2"
        >
          <span className="flex-1 text-xs">Manage accounts</span>
          <ExternalLink size={12} className="text-muted-foreground" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
