import type { ReactNode } from 'react'
import { EntryGlyph } from '@/components/agents/launcher/pickers'
import { ArrowRightLeft, Check, Download } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SessionUsage } from '@/lib/acp-api'
import { cn } from '@/lib/utils'
import {
  conversationUsageMetrics,
  formatReportedCost,
  formatTokenCount,
  isMeaningfulReportedCost
} from '../context-usage-utils'
import type { AgentTab } from './selector-model'
import type { SelectorModelStatus } from './selector-source'
import { pickerRowHeight } from './selector-tokens'

export const ROW =
  'group flex w-full items-center gap-2 rounded-md px-2 text-left text-xs text-foreground transition-colors duration-150 ease-out hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60'

export function rowSize(touch: boolean): string {
  return touch ? 'min-h-11 py-2.5' : 'min-h-8 py-1.5'
}

export function TabGlyph({
  tab,
  colorClassName
}: {
  tab: AgentTab
  /** Default: the glyph's own `text-foreground/80`. Tabs pass `text-current`. */
  colorClassName?: string
}): React.JSX.Element {
  return (
    <EntryGlyph
      config={tab.config}
      templateId={tab.entry?.agent.id ?? tab.config?.templateId}
      name={tab.name}
      colorClassName={colorClassName}
    />
  )
}

/**
 * One model. Selected = a check only, no fill (the fill means hover or focus).
 * `tooltip` opens on hover and on keyboard focus.
 */
export function ModelRow({
  name,
  tooltip,
  selected,
  glyph,
  meta,
  disabled,
  touch,
  onPick
}: {
  name: string
  tooltip?: string
  selected: boolean
  glyph?: ReactNode
  meta?: string
  disabled: boolean
  touch: boolean
  onPick: () => void
}): React.JSX.Element {
  const button = (
    <button
      type="button"
      data-selector-row=""
      aria-pressed={selected}
      disabled={disabled}
      onClick={onPick}
      className={cn(ROW, rowSize(touch))}
    >
      {glyph ? <span className="inline-flex shrink-0">{glyph}</span> : null}
      <span className="fade-end min-w-0 flex-1">{name}</span>
      {meta ? <span className="shrink-0 text-xs text-muted-foreground">{meta}</span> : null}
      <Check
        size={14}
        aria-hidden="true"
        className={cn('shrink-0', selected ? 'opacity-100' : 'opacity-0')}
      />
    </button>
  )
  if (!tooltip || touch) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-64 whitespace-pre-line text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

/** One agent in the "More" list or a search result for an agent name. */
export function AgentRow({
  tab,
  badge,
  highlighted = false,
  disabled,
  touch,
  onPick
}: {
  tab: AgentTab
  badge: string | null
  /** The first search result while typing (v2): Enter in search picks it. */
  highlighted?: boolean
  disabled: boolean
  touch: boolean
  onPick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-selector-row=""
      disabled={disabled}
      data-testid={`selector-agent-${tab.configId}`}
      data-search-highlight={highlighted ? '' : undefined}
      onClick={onPick}
      className={cn(ROW, pickerRowHeight(touch), highlighted && 'bg-foreground/[0.06]')}
    >
      <TabGlyph tab={tab} />
      <span className="fade-end min-w-0 flex-1">{tab.name}</span>
      {badge ? (
        <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-2 text-xs text-muted-foreground shadow-control">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

export function Hint({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
      <ArrowRightLeft size={12} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/** A short message sized like two rows, so the panel does not jump. */
export function ListMessage({
  title,
  detail,
  loading
}: {
  title: string
  detail?: string
  loading?: boolean
}): React.JSX.Element {
  return (
    <div role="status" className="flex min-h-16 flex-col justify-center gap-0.5 px-2 py-1.5">
      <p className="flex items-center gap-1.5 text-xs text-foreground">
        {loading ? <Spinner size={14} decorative /> : null}
        {title}
      </p>
      {detail ? (
        <p className="whitespace-pre-line text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

interface ActionItem {
  key: string
  label: ReactNode
  /** The one action that moves on: the filled primary. */
  primary?: boolean
  /** Share of the row's width (a flex grow factor). */
  grow: number
  disabled?: boolean
  onSelect: () => void
  testId?: string
}

/** A row of real buttons under a message: one primary at most, the rest secondary. */
function ActionButtons({
  items,
  touch
}: {
  items: ActionItem[]
  touch: boolean
}): React.JSX.Element {
  return (
    <div className="flex gap-2 px-1">
      {items.map((item) => (
        <Button
          key={item.key}
          type="button"
          variant={item.primary ? 'default' : 'secondary'}
          size={touch ? 'touch' : 'xs'}
          disabled={item.disabled}
          data-testid={item.testId}
          onClick={item.onSelect}
          style={{ flexGrow: item.grow, flexBasis: 0 }}
          className="min-w-0 gap-1.5 [&_svg]:size-3"
        >
          {item.label}
        </Button>
      ))}
    </div>
  )
}

/** Busy chat: the status line and the Wait / Cancel turn and switch track. */
export function BusyBlock({
  agentName,
  canCancel,
  touch,
  onWait,
  onCancelAndSwitch
}: {
  agentName: string
  canCancel: boolean
  touch: boolean
  onWait: () => void
  onCancelAndSwitch: () => void
}): React.JSX.Element {
  return (
    <div data-testid="agent-switch-busy" className="flex flex-col gap-2 pt-1.5">
      <p role="status" className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <Spinner size={14} decorative />
        {canCancel
          ? `${agentName} is working on a turn.`
          : 'This chat is busy. Wait for the queued prompts or the open request to finish.'}
      </p>
      <ActionButtons
        touch={touch}
        items={[
          { key: 'wait', label: 'Wait', grow: canCancel ? 2 : 5, onSelect: onWait },
          ...(canCancel
            ? [
                {
                  key: 'cancel',
                  label: 'Cancel turn and switch',
                  grow: 3,
                  primary: true,
                  onSelect: onCancelAndSwitch,
                  testId: 'agent-switch-cancel-then-switch'
                }
              ]
            : [])
        ]}
      />
    </div>
  )
}

/** A tab for an agent that is not ready: install it, or the reason it cannot run. */
export function InstallState({
  tab,
  reason,
  installing,
  installBlocked,
  touch,
  onInstall
}: {
  tab: AgentTab
  reason: string | null
  installing: boolean
  installBlocked: boolean
  touch: boolean
  onInstall: (() => void) | null
}): React.JSX.Element {
  if (reason || !onInstall) {
    return (
      <ListMessage
        title={`${tab.name} is not available`}
        detail={reason ?? 'Set it up in Settings to use it here.'}
      />
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <ListMessage
        title={`${tab.name} is not installed`}
        detail="Install it to use its models in this chat."
      />
      <ActionButtons
        touch={touch}
        items={[
          {
            key: 'install',
            grow: 1,
            primary: true,
            disabled: installing || installBlocked,
            label: installing ? (
              <>
                <Spinner size={12} decorative />
                Installing…
              </>
            ) : (
              <>
                <Download size={12} aria-hidden="true" />
                {`Install ${tab.name}`}
              </>
            ),
            onSelect: onInstall,
            testId: `agent-install-${tab.configId}`
          }
        ]}
      />
    </div>
  )
}

/**
 * The launcher's model-list problems (setup error, sign-in) with their fixes:
 * Sign in when the agent asks for it, else Try again. `compact` is the line
 * under a list from the cache.
 */
export function StatusActions({
  title,
  detail,
  status,
  touch,
  compact = false
}: {
  title: string
  detail?: string
  status: SelectorModelStatus
  touch: boolean
  compact?: boolean
}): React.JSX.Element {
  const items: ActionItem[] = [
    ...(status.onSignIn
      ? [
          {
            key: 'sign-in',
            label: status.signInLabel ?? 'Sign in',
            grow: 1,
            primary: true,
            onSelect: status.onSignIn,
            testId: 'selector-sign-in'
          }
        ]
      : []),
    ...(status.onRetry
      ? [
          {
            key: 'retry',
            label: 'Try again',
            grow: 1,
            onSelect: status.onRetry,
            testId: 'selector-retry'
          }
        ]
      : [])
  ]
  return (
    <div className={cn('flex flex-col', compact ? 'gap-1.5 pt-1.5' : 'gap-2')}>
      {compact ? (
        <div className="flex flex-col gap-0.5">
          <p role="status" className="px-2 text-xs text-muted-foreground">
            {title}
          </p>
          {detail ? <p className="px-2 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      ) : (
        <ListMessage title={title} detail={detail} />
      )}
      {items.length > 0 ? <ActionButtons touch={touch} items={items} /> : null}
    </div>
  )
}

/**
 * Session context usage as a passive row: conversation growth against the
 * adjustable window, with the full breakdown (total window, remaining,
 * reported cost) in the tooltip. The composer's ring (ContextUsageIndicator)
 * stays the primary meter; this repeats it where options are set.
 */
export function ContextSummary({
  usage,
  touch
}: {
  usage: SessionUsage
  touch: boolean
}): React.JSX.Element {
  const metrics = conversationUsageMetrics(usage)
  const cost = usage.cost
  const costTitle =
    cost && isMeaningfulReportedCost(cost)
      ? ` Reported cost: ${formatReportedCost(cost.amount, cost.currency)}.`
      : ''
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 text-xs tabular-nums',
        rowSize(touch)
      )}
      title={`Context window: ${formatTokenCount(metrics.totalSize)} tokens. ${formatTokenCount(metrics.remaining)} remaining.${costTitle}`}
    >
      <span className="shrink-0 text-muted-foreground">Context</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {formatTokenCount(metrics.conversationUsed)} / {formatTokenCount(metrics.conversationSize)}
        <span className="text-foreground"> · {Math.round(metrics.percent)}%</span>
      </span>
    </div>
  )
}
