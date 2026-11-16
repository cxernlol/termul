import { WindowControlsInset } from '@/components/shell/TopRowChrome'
import { TopRowStartSlot, useTopRowStartSlotVisible } from '@/components/shell/TopRowStartSlot'
import { useTopRow } from '@/components/shell/top-row-context'
import { cn } from '@/lib/utils'

interface TopRowFallbackBarProps {
  /** What the main area shows, when it has a name (an open quick chat's title). */
  title?: string
}

/**
 * Top row of the main area when no pane tab bar exists (no projects, a
 * routed page, or an open quick chat): a 44px drag bar that carries the start
 * slot (expand-Rail toggle), an optional title in the chat tab's type, and,
 * unless the open right panel's header does, the window controls spacer at
 * its end. Rendered by `ShellFrame` in fallback mode.
 */
export function TopRowFallbackBar({ title }: TopRowFallbackBarProps = {}): React.JSX.Element {
  const topRow = useTopRow()
  const dragRegion = topRow?.platform.dragRegions ?? false
  const startSlot = topRow?.roles.showPanelOwner === 'fallback-bar'
  const startSlotVisible = useTopRowStartSlotVisible()
  const windowControls = Boolean(
    topRow && topRow.roles.controlsOwner === 'fallback-bar' && topRow.platform.windowControls
  )
  return (
    <div
      className="flex h-11 shrink-0 items-center border-b-[0.5px] border-border bg-background"
      data-testid="top-row-fallback-bar"
      data-tauri-drag-region={dragRegion ? true : undefined}
    >
      {startSlot && <TopRowStartSlot />}
      {title && (
        <span
          className={cn(
            'min-w-0 truncate text-xs font-medium text-foreground',
            startSlot && startSlotVisible ? 'pl-1.5' : 'pl-3'
          )}
          data-testid="top-row-fallback-title"
          data-tauri-drag-region={dragRegion ? true : undefined}
        >
          {title}
        </span>
      )}
      <div
        className="h-full min-w-0 flex-1"
        data-tauri-drag-region={dragRegion ? true : undefined}
      />
      <WindowControlsInset windowControls={windowControls} />
    </div>
  )
}
