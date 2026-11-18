import { memo } from 'react'
import { useProjectChatsHidden, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useProjectDiffStat } from '../shell/ProjectDiffStat'
import { useRailCollapsed } from '../shell/rail/rail-density'
import { RailWorktreeChip, RailWorktreeSwitcher } from '../shell/rail/worktree-switcher'
import { railChatsListId } from '../shell/rail-layout'
import { logRailEvent } from '../shell/shell-log'
import { useProjectHasChats } from '../shell/use-project-chats'
import { ProjectIconItem } from './project-icon-item'
import { ProjectItem, type ProjectItemProps } from './project-item'

/**
 * Project row of the shell Rail: the project row plus its uncommitted diff
 * stat. The row watches its working copy in the git-status store while mounted
 * and shows nothing when there is no stat to show. On the collapsed Rail it
 * is the icon-only row with the project card on hover. Under the row, the
 * picked worktree chip; the row anchors the worktree switcher.
 */
export const RailProjectItem = memo(function RailProjectItem(
  props: Omit<ProjectItemProps, 'diffStat'>
): React.JSX.Element {
  const diffStat = useProjectDiffStat(props.project, true)
  const collapsed = useRailCollapsed()
  return (
    <RailWorktreeSwitcher project={props.project} side={collapsed ? 'right' : 'bottom'}>
      {collapsed ? (
        <ProjectIconItem
          project={props.project}
          isActive={props.isActive}
          onClick={props.onClick}
          onContextMenu={props.onContextMenu}
          renderContextMenu={props.renderContextMenu}
          diffStat={diffStat}
        />
      ) : (
        <ChatsToggleRailProjectItem {...props} diffStat={diffStat} />
      )}
      <RailWorktreeChip project={props.project} collapsed={collapsed} />
    </RailWorktreeSwitcher>
  )
})

/**
 * A project's row with the chevron that collapses or expands its chat list
 * (only when it has chats). Every project keeps its own collapse state, so a
 * project switch leaves each list as the user left it. A click on the open
 * project's row also toggles it; a click on another project's row only opens
 * that project.
 */
function ChatsToggleRailProjectItem(props: ProjectItemProps): React.JSX.Element {
  const { project, onClick, isActive } = props
  const hasChats = useProjectHasChats(project)
  const hidden = useProjectChatsHidden(project.id)
  if (!hasChats) return <ProjectItem {...props} />
  const toggle = (): void => {
    logRailEvent(`${hidden ? 'expand' : 'collapse'} chats ${project.id}`)
    useShellLayoutStore.getState().setProjectChatsHidden(project.id, !hidden)
  }
  return (
    <ProjectItem
      {...props}
      chatsExpanded={!hidden}
      chatsListId={railChatsListId(project.id)}
      onToggleChats={toggle}
      onClick={
        isActive
          ? () => {
              toggle()
              onClick()
            }
          : onClick
      }
    />
  )
}
