import { toast } from 'sonner'
import { ChevronDown, ChevronRight } from '@/components/icons'
import { FOCUS_RING_CLASS } from '@/components/ui/panel-styles'
import { useUpdatePanelVisibility } from '@/hooks/use-app-settings'
import { cn } from '@/lib/utils'

/**
 * Revamp SSH section collapse chevron (X5): the Archived-projects chevron
 * (`sidebar/project-list.tsx`) reused. Toggles the persisted `sshPanelVisible`
 * with the same error toast as the Activity Rail toggle.
 */
export function SSHSectionChevron({ expanded }: { expanded: boolean }): React.JSX.Element {
  const updatePanelVisibility = useUpdatePanelVisibility()

  const handleToggle = async (): Promise<void> => {
    try {
      await updatePanelVisibility('sshPanelVisible', !expanded)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update SSH panel visibility')
    }
  }

  const label = expanded ? 'Collapse SSH section' : 'Expand SSH section'

  return (
    <button
      type="button"
      onClick={() => void handleToggle()}
      className={cn('shrink-0 rounded-md', FOCUS_RING_CLASS)}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/70">
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
    </button>
  )
}
