import { RailToggleButton } from '@/components/shell/RailToggleButton'
import { useTopRow } from '@/components/shell/top-row-context'

/**
 * Whether {@link TopRowStartSlot} renders: the Rail is collapsed (the expand
 * toggle moves here).
 */
export function useTopRowStartSlotVisible(): boolean {
  return Boolean(useTopRow()?.railToggleInMain)
}

/**
 * Start of the top-row bar that touches the Rail (the leftmost top-edge tab
 * bar, the SSH header or the fallback bar, see `showPanelOwner`). With the
 * Rail collapsed it holds the expand-Rail toggle; it needs no room for the
 * macOS traffic lights, which hide while the Rail is collapsed. Renders
 * nothing with the Rail expanded.
 */
export function TopRowStartSlot(): React.JSX.Element | null {
  if (!useTopRowStartSlotVisible()) return null
  return (
    <div className="flex h-full shrink-0 items-center pl-1.5" data-testid="top-row-start-slot">
      {/* Fades in while the Rail's own toggle fades out (Rail collapse). */}
      <span className="flex transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-none">
        <RailToggleButton />
      </span>
    </div>
  )
}
