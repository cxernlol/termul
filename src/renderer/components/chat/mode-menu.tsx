import { type KeyboardEvent, useId, useRef } from 'react'
import {
  Bot,
  Eye,
  FileEdit,
  FolderEdit,
  Hand,
  Maps,
  MessageQuestion,
  ShieldAlert,
  Sparkles,
  type TermulIcon
} from '@/components/icons'
import type { SessionMode } from '@/lib/acp-api'
import { cn } from '@/lib/utils'
import { PICKER_LABEL, PICKER_ROW_SELECTED_BOX } from './agent-model-selector/selector-tokens'

/** How much a mode lets the agent do without asking. */
export type ModeRisk = 'ask' | 'act' | 'danger' | 'other'

interface ModeKind {
  risk: ModeRisk
  icon: TermulIcon
}

/**
 * Known agent modes by id: Claude Agent (`default`, `acceptEdits`, `plan`,
 * `auto`, `bypassPermissions`), Cursor (`agent`, `plan`, `ask`), and Codex
 * (`read-only`, `workspace-write`, `agent`, `agent-full-access`). Codex calls
 * `agent` "Auto review" and Cursor calls it "Agent"; both edit without asking
 * first, so both are `act`.
 */
const MODE_KINDS: Record<string, ModeKind> = {
  default: { risk: 'ask', icon: Hand },
  plan: { risk: 'ask', icon: Maps },
  ask: { risk: 'ask', icon: MessageQuestion },
  'read-only': { risk: 'ask', icon: Eye },
  acceptEdits: { risk: 'act', icon: FileEdit },
  auto: { risk: 'act', icon: Sparkles },
  agent: { risk: 'act', icon: Bot },
  'workspace-write': { risk: 'act', icon: FolderEdit },
  bypassPermissions: { risk: 'danger', icon: ShieldAlert },
  'agent-full-access': { risk: 'danger', icon: ShieldAlert }
}

export function modeKind(modeId: string | undefined): ModeKind {
  return (modeId && MODE_KINDS[modeId]) || { risk: 'other', icon: Bot }
}

const GROUP_ORDER: ModeRisk[] = ['ask', 'act', 'danger', 'other']

function groupLabel(risk: ModeRisk, agentName: string | undefined): string {
  if (risk === 'ask') return 'Ask first'
  if (risk === 'act') return agentName ? `Let ${agentName} act` : 'Let the agent act'
  if (risk === 'danger') return 'Use with care'
  return 'Other modes'
}

function dangerDescription(description: string | null | undefined): string {
  const base = description?.trim()
  if (!base) return 'Use with care.'
  return `${base}${/[.!?]$/.test(base) ? '' : '.'} Use with care.`
}

/**
 * The mode chip label. The modes that ask before edits by default
 * (Claude Agent `default`) read "Ask first", the name of their menu group,
 * not the agent's generic "Default". Other modes keep the agent's name.
 */
export function modeChipLabel(modeId: string | undefined, name: string): string {
  return modeId === 'default' ? 'Ask first' : name
}

/** The chip icon for the current mode; yellow when the mode is risky. */
export function ModeIcon({
  modeId,
  size = 13,
  className
}: {
  modeId: string | undefined
  size?: number
  className?: string
}): React.JSX.Element {
  const { risk, icon: Icon } = modeKind(modeId)
  return (
    <Icon
      size={size}
      aria-hidden="true"
      className={cn(
        'shrink-0',
        risk === 'danger' ? 'text-warning' : 'text-muted-foreground',
        className
      )}
    />
  )
}

/**
 * The mode menu (Paper "Mode menu", the model picker's values): every mode
 * has an icon, a 12/16 name and a one-line description; modes are grouped by
 * risk ("Ask first", "Let <agent> act") under the picker's labels; risky
 * modes sit below a 0.5px hairline with a yellow icon. The picked mode has
 * the picker's 10% fill and no tick; hover and focus are 6%. Up and Down
 * move the focus.
 */
export function ModeMenuList({
  modes,
  selectedId,
  agentName,
  touch,
  onPick,
  rowHandlers
}: {
  modes: readonly SessionMode[]
  selectedId: string | undefined
  agentName?: string
  touch: boolean
  onPick: (modeId: string) => void
  /** Extra per-row handlers (touch tap detection on mobile). */
  rowHandlers?: (modeId: string) => React.ButtonHTMLAttributes<HTMLButtonElement>
}): React.JSX.Element {
  const groups = GROUP_ORDER.map((risk) => ({
    risk,
    modes: modes.filter((m) => modeKind(m.id).risk === risk)
  })).filter((g) => g.modes.length > 0)
  const showLabels = groups.length > 1
  const uid = useId()
  const listRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const list = listRef.current
    if (!list) return
    // The handler sits on the row. Searching that button finds no rows,
    // because data-mode-id is on the button itself, not a descendant.
    const rows = Array.from(list.querySelectorAll<HTMLButtonElement>('[data-mode-id]'))
    const index = rows.indexOf(event.currentTarget)
    if (index < 0) return
    event.preventDefault()
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1
    rows[(next + rows.length) % rows.length]?.focus()
  }

  return (
    <div
      ref={listRef}
      data-testid="mode-chip-options"
      className="max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain"
    >
      {groups.map(({ risk, modes: groupModes }, groupIndex) => {
        const labelId = `${uid}-mode-group-${risk}`
        return (
          <fieldset key={risk} aria-labelledby={labelId} className="min-w-0">
            {risk === 'danger' && groupIndex > 0 ? (
              <div aria-hidden="true" className="mx-1 my-1 h-[0.5px] bg-border" />
            ) : null}
            <div
              id={labelId}
              className={cn(PICKER_LABEL, (!showLabels || risk === 'danger') && 'sr-only')}
            >
              {groupLabel(risk, agentName)}
            </div>
            {groupModes.map((mode) => {
              const selected = mode.id === selectedId
              const { icon: Icon } = modeKind(mode.id)
              const description =
                risk === 'danger' ? dangerDescription(mode.description) : mode.description
              return (
                <button
                  key={mode.id}
                  type="button"
                  data-mode-id={mode.id}
                  aria-pressed={selected}
                  onClick={() => onPick(mode.id)}
                  onKeyDown={onKeyDown}
                  {...rowHandlers?.(mode.id)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 text-left',
                    'transition-colors duration-150 ease-out',
                    'hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus-ring',
                    touch ? 'min-h-11 py-2.5' : 'py-1.5',
                    selected && PICKER_ROW_SELECTED_BOX
                  )}
                >
                  <Icon
                    size={16}
                    aria-hidden="true"
                    className={cn(
                      'shrink-0',
                      risk === 'danger' ? 'text-warning' : 'text-muted-foreground'
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col text-xs leading-4">
                    <span className="truncate text-foreground">{mode.name}</span>
                    {description ? (
                      <span className="text-muted-foreground">{description}</span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </fieldset>
        )
      })}
    </div>
  )
}
