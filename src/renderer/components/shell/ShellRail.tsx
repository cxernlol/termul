import { useReducedMotion } from 'framer-motion'
import { RailBody } from '@/components/shell/RailBody'
import { RailDensityProvider } from '@/components/shell/rail/rail-density'
import { RAIL_WIDTH_TRANSITION_CLASS, useRailMotion } from '@/components/shell/rail/rail-motion'
import { COLLAPSED_WIDTH, RAIL_HOVER_OPEN_DELAY } from '@/components/shell/rail-layout'
import { useRailResize } from '@/components/shell/use-rail-resize'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useWorktreeReconciler } from '@/hooks/use-worktree-reconciler'
import { cn } from '@/lib/utils'
import { SHELL_LAYOUT_BOUNDS } from '@/stores/shell-layout-store'
import { useSidebarVisible } from '@/stores/sidebar-store'
import type { Project } from '@/types/project'

export interface ShellRailProps {
  projects: Project[]
  activeProjectId: string
  onSelectProject: (id: string) => void
  onNewProject: () => void
  onSSHConnect: (profileId: string) => void
  onSelectSSHProfile: (profileId: string) => void
  activeSSHProfileId: string | null
  /** Opens the command palette (the Rail's Search). */
  onOpenCommandPalette: () => void
  /** Opens the active project's canvas tab. */
  onOpenCanvas: () => void
  /** Whether the canvas can be opened (the active project has a path). */
  canOpenCanvas: boolean
  isShortcutsOpen: boolean
  onShortcutsOpenChange: (open: boolean) => void
  isThemePickerOpen: boolean
  onToggleThemePicker?: () => void
}

/**
 * Shell frame Rail (shell revamp CAP-1): expanded (persisted width 180-360) or
 * collapsed to 56px of icons, following `railExpanded`. Both states draw one
 * `RailBody`; the density context switches its rows to icon-only, 1:1 with
 * the expanded rows (Sidebar V2).
 *
 * A toggle runs the `useRailMotion` phases: the width transitions in CSS
 * (200ms, strong ease-out) and the labels fade out before `display: none`, or
 * fade in from `@starting-style`. The phase is `data-rail-motion` on the nav.
 * Instant under reduced motion and while dragging the resize handle.
 */
export function ShellRail({
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onSSHConnect,
  onSelectSSHProfile,
  activeSSHProfileId,
  onOpenCommandPalette,
  onOpenCanvas,
  canOpenCanvas,
  isShortcutsOpen,
  onShortcutsOpenChange,
  isThemePickerOpen,
  onToggleThemePicker
}: ShellRailProps): React.JSX.Element {
  const reducedMotion = useReducedMotion() ?? false
  const expanded = useSidebarVisible()
  const { width, onResizeMouseDown, onResizeKeyDown } = useRailResize()

  // The reconciler keeps running while the Rail is collapsed (the expanded
  // sidebar variant does not run it).
  useWorktreeReconciler(activeProjectId)

  // Only an expand/collapse animates; a resize follows the pointer.
  const { phase, density } = useRailMotion(expanded, reducedMotion)
  const animating = phase === 'collapsing' || phase === 'expanding'

  const targetWidth = expanded ? width : COLLAPSED_WIDTH
  // While collapsing, the rows keep their expanded width and get clipped, so
  // the labels fade in place instead of reflowing.
  const contentWidth = density === 'expanded' ? width : COLLAPSED_WIDTH

  return (
    <TooltipProvider delayDuration={RAIL_HOVER_OPEN_DELAY}>
      <nav
        aria-label="Projects"
        data-testid="shell-rail"
        data-expanded={expanded}
        data-rail-motion={phase}
        data-rail-surface
        className={cn(
          'group/rail relative h-full shrink-0 overflow-hidden bg-background',
          animating && RAIL_WIDTH_TRANSITION_CLASS
        )}
        style={{ width: targetWidth }}
      >
        <div className="h-full" style={{ width: contentWidth }}>
          <RailDensityProvider density={density}>
            <RailBody
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={onSelectProject}
              onNewProject={onNewProject}
              onSSHConnect={onSSHConnect}
              onSelectSSHProfile={onSelectSSHProfile}
              activeSSHProfileId={activeSSHProfileId}
              onOpenCommandPalette={onOpenCommandPalette}
              onOpenCanvas={onOpenCanvas}
              canOpenCanvas={canOpenCanvas}
              isShortcutsOpen={isShortcutsOpen}
              onShortcutsOpenChange={onShortcutsOpenChange}
              isThemePickerOpen={isThemePickerOpen}
              onToggleThemePicker={onToggleThemePicker}
            />
          </RailDensityProvider>
        </div>

        {expanded && (
          <button
            type="button"
            onMouseDown={onResizeMouseDown}
            onKeyDown={onResizeKeyDown}
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent transition-colors duration-150 ease-out hover:bg-border focus-visible:bg-muted-foreground/40 focus-visible:outline-none active:bg-muted-foreground/40"
            title="Drag to resize"
            aria-label="Resize projects rail"
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={width}
            aria-valuemin={SHELL_LAYOUT_BOUNDS.railWidth.min}
            aria-valuemax={SHELL_LAYOUT_BOUNDS.railWidth.max}
          />
        )}
      </nav>
    </TooltipProvider>
  )
}
