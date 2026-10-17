import { PanelLeft } from '@/components/icons'
import { RAIL_TOGGLE_LABEL, useRailToggle } from '@/components/shell/use-rail-toggle'

/**
 * Rail toggle as the first control of the Projects header row. Same name and
 * `aria-pressed` contract as the collapsed Rail's toggle.
 */
export function RailHeaderToggle({ className }: { className: string }): React.JSX.Element {
  const { expanded, toggle } = useRailToggle()
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        toggle()
      }}
      className={className}
      title={RAIL_TOGGLE_LABEL}
      aria-label={RAIL_TOGGLE_LABEL}
      aria-pressed={expanded}
    >
      <PanelLeft size={14} className={expanded ? 'text-foreground' : 'text-muted-foreground'} />
    </button>
  )
}
