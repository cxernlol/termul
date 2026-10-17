import { RAIL_ROW_INSET_CLASS } from '@/components/shell/rail-layout'
import { QUIET_ICON_BUTTON_CLASS } from '@/components/ui/panel-styles'
import { cn } from '@/lib/utils'

/** Look of a section header's trailing icon button (same box as a group row's `…`). */
export const RAIL_SECTION_BUTTON_CLASS = cn(
  QUIET_ICON_BUTTON_CLASS,
  'size-5 cursor-pointer [&_svg]:size-3.5'
)

interface RailSectionHeaderProps {
  /** Section name, e.g. `Groups` or `Projects`. */
  label: string
  /** Trailing control, usually one {@link RAIL_SECTION_BUTTON_CLASS} icon button. */
  children?: React.ReactNode
  className?: string
}

/**
 * Small muted section label of the shell Rail project list ("Groups",
 * "Projects"). The label starts on the shared Rail icon column and an icon
 * button sits at the end. The row is not focusable; only its button is.
 */
export function RailSectionHeader({
  label,
  children,
  className
}: RailSectionHeaderProps): React.JSX.Element {
  return (
    <div
      data-testid={`rail-section-${label.toLowerCase()}`}
      className={cn(
        'flex h-8 w-full select-none items-center justify-between pr-1.5',
        RAIL_ROW_INSET_CLASS,
        className
      )}
    >
      <h3 className="label-panel min-w-0 truncate">{label}</h3>
      {children}
    </div>
  )
}
