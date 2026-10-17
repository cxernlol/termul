import { RAIL_ICON_BOX_CLASS, RAIL_ROW_INSET_CLASS } from '@/components/shell/rail-layout'
import { Kbd } from '@/components/ui/kbd'
import { QUIET_ICON_BUTTON_CLASS } from '@/components/ui/panel-styles'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface RailRowProps {
  /** Visible label. */
  label: string
  /** Accessible name and tooltip title. Defaults to `label`. */
  name?: string
  /** Muted second tooltip line (why the row is off, or its shortcut). */
  hint?: string
  /** Leading glyph (16px). */
  icon: React.ReactNode
  /** Keyboard shortcut chip at the end of the row. */
  chip?: string
  disabled?: boolean
  /** Sets `aria-pressed` and the keycap "you are here" surface. */
  pressed?: boolean
  onClick: () => void
}

/**
 * Expanded Rail action row: glyph + label, 32px, same rest, hover, keycap and
 * disabled states as the 36px `RailButton`, with the tooltip on the right.
 */
export function RailRow({
  label,
  name,
  hint,
  icon,
  chip,
  disabled = false,
  pressed,
  onClick
}: RailRowProps): React.JSX.Element {
  const accessibleName = name ?? label
  const button = (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        QUIET_ICON_BUTTON_CLASS,
        RAIL_ROW_INSET_CLASS,
        'flex h-8 w-full shrink-0 justify-start rounded-lg text-xs font-medium disabled:pointer-events-none disabled:opacity-40',
        pressed && 'keycap text-foreground'
      )}
      aria-label={accessibleName}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      disabled={disabled}
    >
      <span data-rail-icon-column className={RAIL_ICON_BOX_CLASS}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {chip && <Kbd className="inline-flex h-4.5 shrink-0 items-center px-1">{chip}</Kbd>}
    </button>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events, so the wrapper carries
            the tooltip that explains why the row is off. */}
        {disabled ? <span className="block w-full">{button}</span> : button}
      </TooltipTrigger>
      <TooltipContent side="right" className="flex flex-col gap-0.5 px-2.5 py-1.5 text-xs">
        <span className="text-popover-foreground">{accessibleName}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  )
}
