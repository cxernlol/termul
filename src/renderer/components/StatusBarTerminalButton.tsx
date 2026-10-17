import { Terminal } from '@/components/icons'
import { STATUS_BAR_HOVER_CLASS, STATUS_BAR_ITEM_CLASS } from '@/components/status-bar-hit'
import { FOCUS_RING_CLASS } from '@/components/ui/panel-styles'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActiveWorkingCopy } from '@/hooks/use-active-working-copy'
import { useMobileWebShell } from '@/hooks/use-mobile-web-shell'
import { dispatchWorktreeEvent, WORKTREE_EVENTS } from '@/hooks/use-worktree-shortcuts'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/project'

/**
 * Revamp Status bar "Terminal" button. Runs the same action as
 * Ctrl+Shift+Alt+T: the OPEN_TERMINAL listener resolves the working copy and
 * owns the failure toasts, so there is one spawn path. Never writes the
 * Workspace-switcher pick.
 */
export function StatusBarTerminalButton({
  project
}: {
  project: Project | undefined
}): React.JSX.Element | null {
  const isMobileWebShell = useMobileWebShell()
  const workingCopy = useActiveWorkingCopy()
  if (!project || isMobileWebShell) return null

  // An unresolved working copy names its own path, never the project folder.
  const cwd = workingCopy ? workingCopy.path : project.path
  const label = cwd ? `Open terminal at ${cwd}` : 'Open terminal'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() =>
            dispatchWorktreeEvent(WORKTREE_EVENTS.OPEN_TERMINAL, { projectId: project.id })
          }
          aria-label={label}
          className={cn(
            'relative',
            STATUS_BAR_ITEM_CLASS,
            STATUS_BAR_HOVER_CLASS,
            "after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-['']",
            FOCUS_RING_CLASS
          )}
        >
          <Terminal size={12} className="shrink-0" aria-hidden="true" />
          <span className="leading-none">Terminal</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-md break-all">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
