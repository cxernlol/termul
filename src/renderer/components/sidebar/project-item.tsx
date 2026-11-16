import type { GitDiffStat } from '@shared/types/ipc.types'
import { type KeyboardEvent, memo, useEffect, useRef } from 'react'
import { ChevronRight, MoreHorizontal, Plus, Settings } from '@/components/icons'
import { ProjectIcon } from '@/components/ProjectIcon'
import { RAIL_LABEL_FADE_CLASS } from '@/components/shell/rail/rail-motion'
import { RailTooltip } from '@/components/shell/rail-button'
import { RAIL_ICON_BOX_CLASS, RAIL_ROW_INSET_CLASS } from '@/components/shell/rail-layout'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { FIELD_FOCUS_CLASS, FOCUS_RING_CLASS } from '@/components/ui/panel-styles'
import { isContextMenuKey, openContextMenuFrom } from '@/lib/context-menu-key'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/project'
import { ProjectDiffStat } from '../shell/ProjectDiffStat'
import { type ProjectRowStatus, ProjectStatusMarks } from './indicators'

/** A 20px icon action at the end of the row (More, Settings). */
const ROW_ACTION_CLASS =
  'inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-150 ease-out hover:bg-foreground/[0.03] hover:text-foreground'

export interface ProjectItemProps {
  project: Project
  isActive: boolean
  isEditing: boolean
  editName: string
  status: ProjectRowStatus
  onOpenNeedsYou: () => void
  onClick: () => void
  /** Starts a new chat in this project (the row's "+"). */
  onNewChat: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onEditNameChange: (name: string) => void
  onSaveRename: () => void
  onCancelRename: () => void
  onSettingsClick: () => void
  renderContextMenu?: (project: Project) => React.ReactNode
  /** Uncommitted line stat for the row (see `RailProjectItem`); nothing when null. */
  diffStat?: GitDiffStat | null
  /**
   * The open project's chat list under the row is shown. With
   * `onToggleChats`, hover or focus turns the project icon into a chevron
   * that collapses or expands it.
   */
  chatsExpanded?: boolean
  onToggleChats?: () => void
  /** Id of the chat list, for the chevron's `aria-controls`. */
  chatsListId?: string
}

export const ProjectItem = memo(function ProjectItem({
  project,
  isActive,
  isEditing,
  editName,
  status,
  onOpenNeedsYou,
  onClick,
  onNewChat,
  onContextMenu,
  onEditNameChange,
  onSaveRename,
  onCancelRename,
  onSettingsClick,
  renderContextMenu,
  diffStat: watchedDiffStat = null,
  chatsExpanded = true,
  onToggleChats,
  chatsListId
}: ProjectItemProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  // At rest the stat holds the right slot; hover or focus swaps it for the
  // settings gear. It yields to the rename input.
  const diffStat = isEditing ? null : watchedDiffStat

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSaveRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancelRename()
    }
  }

  return (
    <div data-testid={`project-item-${project.id}`}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            onContextMenu={onContextMenu}
            data-project-row
            className={cn(
              'group relative flex h-7.5 w-full cursor-pointer select-none items-center text-left text-xs',
              // Paper 10X5: the open project is a plain row (only the open
              // chat under it is raised), radius 8 like every Rail row.
              'rounded-lg',
              RAIL_ROW_INSET_CLASS,
              'transition-colors duration-150 ease-out',
              'hover:bg-row-hover focus-within:bg-row-hover'
            )}
          >
            {/* The row's own control fills it (under its content, which lets
                pointer events through), so the row actions are its siblings,
                not nested controls. */}
            <button
              type="button"
              onClick={isEditing ? undefined : onClick}
              onKeyDown={(e) => {
                if (!isContextMenuKey(e)) return
                e.preventDefault()
                openContextMenuFrom(e.currentTarget)
              }}
              tabIndex={isEditing ? -1 : undefined}
              className={cn(
                'absolute inset-0 rounded-lg focus-visible:ring-inset',
                FOCUS_RING_CLASS
              )}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Project: ${project.name}${isActive ? ' (active)' : ''}`}
            />
            <span
              data-rail-icon-column
              className={cn(RAIL_ICON_BOX_CLASS, 'pointer-events-none relative')}
            >
              <span
                className={cn(
                  'inline-flex',
                  onToggleChats && 'group-hover:invisible group-focus-within:invisible'
                )}
              >
                <ProjectIcon project={project} size={16} />
              </span>
              {onToggleChats && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleChats()
                  }}
                  aria-expanded={chatsExpanded}
                  aria-controls={chatsExpanded ? chatsListId : undefined}
                  aria-label={`${chatsExpanded ? 'Hide' : 'Show'} chats in ${project.name}`}
                  data-testid="project-chats-toggle"
                  className={cn(
                    'pointer-events-auto absolute inset-0 m-auto inline-flex size-5 items-center justify-center rounded text-muted-foreground',
                    'invisible group-hover:visible group-focus-within:visible',
                    'transition-colors duration-150 ease-out hover:bg-foreground/[0.06] hover:text-foreground',
                    FOCUS_RING_CLASS
                  )}
                >
                  {/* One chevron that turns: right when closed, down when open. */}
                  <ChevronRight
                    size={14}
                    aria-hidden="true"
                    className={cn(
                      'transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                      chatsExpanded && 'rotate-90'
                    )}
                  />
                </button>
              )}
            </span>

            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => onEditNameChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onSaveRename}
                className={`relative h-6 min-w-0 flex-1 rounded border border-border bg-card px-1.5 text-xs text-foreground ${FIELD_FOCUS_CLASS}`}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              // Name and diff stat share one box whose width never changes on
              // hover: the actions sit on top of its end, over a fade, so
              // nothing reflows and the name is not cut again.
              <span
                className={cn(
                  'pointer-events-none relative flex min-w-0 flex-1 items-center gap-2',
                  RAIL_LABEL_FADE_CLASS
                )}
              >
                {/* Fills the row and fades its last 24px instead of an ellipsis. */}
                <span
                  className="fade-end min-w-0 flex-1 font-medium text-secondary-foreground transition-colors duration-150 ease-out group-hover:text-foreground"
                  title={project.name}
                >
                  {project.name}
                </span>
                {diffStat && (
                  <span className="flex shrink-0">
                    <ProjectDiffStat stat={diffStat} />
                  </span>
                )}
                {/* The fade ends in the row's own surface, the hover wash. It
                    shows under the same conditions as the wash (hover and
                    focus-within). */}
                <span
                  className="pointer-events-none absolute inset-y-0 right-0 hidden items-center gap-1 bg-gradient-to-l from-row-hover-solid from-60% to-transparent pl-6 group-hover:flex group-focus-within:flex [&>*]:pointer-events-auto"
                  data-testid="project-row-actions"
                >
                  <RailTooltip label="More actions">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        openContextMenuFrom(e.currentTarget)
                      }}
                      className={`${ROW_ACTION_CLASS} ${FOCUS_RING_CLASS}`}
                      aria-label={`More actions for ${project.name}`}
                      aria-haspopup="menu"
                    >
                      <MoreHorizontal size={12} />
                    </button>
                  </RailTooltip>
                  <RailTooltip label="Project settings">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSettingsClick()
                      }}
                      className={`${ROW_ACTION_CLASS} ${FOCUS_RING_CLASS}`}
                      aria-label={`Settings for ${project.name}`}
                    >
                      <Settings size={12} />
                    </button>
                  </RailTooltip>
                </span>
              </span>
            )}
            {/* Status marks stay outside the name box: always visible, and the
                needs-you pill stays clickable. The activity spinner yields to
                the rename input. */}
            <span
              className={cn(
                'pointer-events-none relative flex shrink-0 items-center gap-2 empty:hidden [&_button]:pointer-events-auto',
                RAIL_LABEL_FADE_CLASS
              )}
            >
              <ProjectStatusMarks
                status={
                  isEditing && status.live === 'activity' ? { ...status, live: null } : status
                }
                onOpenNeedsYou={onOpenNeedsYou}
              />
            </span>
            {/* Always shown, unlike the hover actions. */}
            {!isEditing && (
              <span className={cn('flex shrink-0', RAIL_LABEL_FADE_CLASS)}>
                <RailTooltip label={`New chat in ${project.name}`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onNewChat()
                    }}
                    className={cn(ROW_ACTION_CLASS, FOCUS_RING_CLASS)}
                    aria-label={`New chat in ${project.name}`}
                    data-testid="project-row-new-chat"
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </RailTooltip>
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        {renderContextMenu?.(project)}
      </ContextMenu>
    </div>
  )
})
