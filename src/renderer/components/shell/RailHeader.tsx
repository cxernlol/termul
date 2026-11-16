import { RailToggleButton } from '@/components/shell/RailToggleButton'
import { ShellBrandMark } from '@/components/shell/ShellBrandMark'
import { TrafficLightClearance } from '@/components/shell/TopRowChrome'
import { useTopRowPlatform } from '@/components/shell/top-row-context'
import { cn } from '@/lib/utils'
import { useRailCollapsed } from './rail/rail-density'
import { RAIL_LABEL_FADE_CLASS } from './rail/rail-motion'

/**
 * Top row part of the expanded Rail (Paper "Rail header"), 44px tall, in
 * line with the tab bar and the right panel header. Left to right:
 * - macOS: the traffic-light clearance, then the Troupe mark.
 * - Elsewhere: a 56px slot that centers the mark on the Rail icon column
 *   (x = 28), the x of every row icon below it.
 * Then drag space, then the 28px Rail toggle at the end, its glyph on the
 * right edge of the row actions below (24px from the Rail edge). On desktop
 * every part except the toggle is a window drag handle.
 *
 * Collapsed Rail: the same row, empty (only the macOS traffic lights sit over
 * it) and a drag handle; the expand toggle moves to the start of the main
 * area's top row (`TopRowStartSlot`).
 */
export function RailHeader(): React.JSX.Element {
  const platform = useTopRowPlatform()
  const collapsed = useRailCollapsed()
  const drag = platform.dragRegions ? true : undefined
  if (collapsed) {
    return <div className="h-11 shrink-0" data-testid="rail-header" data-tauri-drag-region={drag} />
  }
  return (
    <div
      className="flex h-11 shrink-0 items-center"
      data-testid="rail-header"
      data-tauri-drag-region={drag}
    >
      {platform.trafficLights && <TrafficLightClearance trafficLights />}
      {/* The mark and the toggle fade out before the Rail collapses and fade
          in when it expands (`RAIL_LABEL_FADE_CLASS`). */}
      <div
        className={cn('flex shrink-0 items-center self-stretch', RAIL_LABEL_FADE_CLASS)}
        data-tauri-drag-region={drag}
      >
        {platform.trafficLights ? (
          <ShellBrandMark dragRegion={platform.dragRegions} />
        ) : (
          <div
            className="flex w-14 shrink-0 items-center justify-center self-stretch"
            data-testid="rail-header-mark-slot"
            data-tauri-drag-region={drag}
          >
            <ShellBrandMark dragRegion={platform.dragRegions} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 self-stretch" data-tauri-drag-region={drag} />
      {/* Right-aligned: the 14px glyph (7px inside the 28px button) ends
          24px from the Rail edge, where the `+` glyphs of the headings and
          rows below end. */}
      <span className={cn('mr-[17px] flex shrink-0', RAIL_LABEL_FADE_CLASS)}>
        <RailToggleButton />
      </span>
    </div>
  )
}
