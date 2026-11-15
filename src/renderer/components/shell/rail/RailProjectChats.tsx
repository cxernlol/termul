import { useCallback, useRef, useState } from 'react'
import { ChatEntryIcon } from '@/components/chat/ChatHistoryEntryRow'
import { ChatDeleteConfirmDialog } from '@/components/chat/ChatHistoryTab'
import { ProjectIcon } from '@/components/ProjectIcon'
import { ChatRowTrail, type ProjectChatEntry } from '@/components/sidebar/project-chat-row'
import { usePaneDnd } from '@/hooks/use-pane-dnd'
import { isContextMenuKey, openContextMenuFrom } from '@/lib/context-menu-key'
import { cn } from '@/lib/utils'
import { useProjectChatsHidden } from '@/stores/shell-layout-store'
import type { Project } from '@/types/project'
import type { ChatCardData } from '../chat-cards'
import {
  RAIL_HOVER_PANEL_PADDING,
  RAIL_PROJECT_ROW_HEIGHT,
  RAIL_ROW_GAP,
  railChatsListId
} from '../rail-layout'
import { logRailEvent } from '../shell-log'
import { useChatCardActions } from '../use-chat-card-actions'
import { type ChatRowMenuActions, useChatRowMenuActions } from '../use-chat-row-menu-actions'
import { isOpenChatCard, useChatLiveState, useProjectChats } from '../use-project-chats'
import { RailChatMenu } from './rail-chat-menu'
import {
  RailChatGroup,
  RailChatIcon,
  RailChatItem,
  RailChatList,
  RailChatRow,
  RailChatRowFrame,
  RailChatRowMore,
  RailChatStatusDot,
  RailChatTitle,
  RailChatTrailSlot,
  RailShowMore
} from './rail-chats'
import { RailDensityProvider, useRailCollapsed } from './rail-density'
import {
  RailHoverPanel,
  RailHoverPanelContent,
  RailHoverPanelProjectRow,
  RailHoverPanelTrigger
} from './rail-hover-panel'
import { RAIL_WORKTREE_CHIP_HEIGHT, RailWorktreeChip, usePickedWorktree } from './worktree-switcher'

/**
 * The chat peek opens 4px above the project row that sits on top of the
 * chats, so its project row and chat rows line up with the Rail icons.
 */
const PEEK_ALIGN_OFFSET = -(RAIL_PROJECT_ROW_HEIGHT + RAIL_ROW_GAP + RAIL_HOVER_PANEL_PADDING)

/** A click this soon after a drag ends is the tail of the drag, not an open. */
const CLICK_AFTER_DRAG_MS = 250

interface RailProjectChatRowProps extends React.ComponentPropsWithoutRef<'button'> {
  card: ChatCardData
  open: boolean
  dragging: boolean
  onOpenChat: (entry: ProjectChatEntry) => void
  onDragChat: (entry: ProjectChatEntry, event: React.DragEvent) => void
  onDragChatEnd: () => void
  menuActions: Omit<ChatRowMenuActions, 'onDelete'>
  onRequestDelete: (entry: ProjectChatEntry) => void
  onMenuOpenChange: (open: boolean) => void
}

/**
 * One chat of the project: agent icon, title and the live trail. On the
 * collapsed Rail the trail gives way to a status dot on the icon; the status
 * stays in the accessible name. Drag the row onto a pane edge to split, or
 * into a pane to open the chat there. Right-click, Shift+F10 or the "…"
 * button (shown on hover, in place of the trail) opens the chat row menu.
 */
function RailProjectChatRow({
  card,
  open,
  dragging,
  onOpenChat,
  onDragChat,
  onDragChatEnd,
  menuActions,
  onRequestDelete,
  onMenuOpenChange,
  ...props
}: RailProjectChatRowProps): React.JSX.Element {
  const { entry } = card
  const collapsed = useRailCollapsed()
  const { liveState, statusWord } = useChatLiveState(entry.id)
  const dragEndedAt = useRef<number | null>(null)
  return (
    <RailChatMenu
      entry={entry}
      actions={menuActions}
      onRequestDelete={onRequestDelete}
      onOpenChange={onMenuOpenChange}
    >
      <RailChatRowFrame>
        <RailChatRow
          open={open}
          dragging={dragging}
          draggable
          onDragStart={(event) => {
            dragEndedAt.current = null
            onDragChat(entry, event)
          }}
          onDragEnd={() => {
            dragEndedAt.current = performance.now()
            onDragChatEnd()
          }}
          onClick={() => {
            const endedAt = dragEndedAt.current
            dragEndedAt.current = null
            if (endedAt !== null && performance.now() - endedAt < CLICK_AFTER_DRAG_MS) return
            onOpenChat(entry)
          }}
          onKeyDown={(event) => {
            // WebKit sends no contextmenu event for Shift+F10.
            if (!isContextMenuKey(event)) return
            event.preventDefault()
            openContextMenuFrom(event.currentTarget)
          }}
          title={collapsed ? undefined : entry.title}
          aria-label={statusWord ? `${entry.title}, ${statusWord}` : entry.title}
          {...props}
        >
          <RailChatIcon>
            <ChatEntryIcon
              agentId={entry.agentId}
              agentConfigId={entry.agentConfigId}
              agents={entry.agents}
            />
            {collapsed && <RailChatStatusDot state={liveState} />}
          </RailChatIcon>
          <RailChatTitle>{entry.title}</RailChatTitle>
          {!collapsed && (
            <RailChatTrailSlot>
              <ChatRowTrail
                liveState={liveState}
                lastActivityAt={entry.lastActivityAt}
                closed={entry.status === 'closed'}
              />
            </RailChatTrailSlot>
          )}
        </RailChatRow>
        <RailChatRowMore
          aria-label={`More actions for ${entry.title}`}
          onClick={(event) => openContextMenuFrom(event.currentTarget)}
        />
      </RailChatRowFrame>
    </RailChatMenu>
  )
}

/**
 * Collapses or expands the chat list under the project row. The grid row
 * goes 0fr ↔ 1fr (the rows below follow it), and the chats fade with a 4px
 * lift: 200ms open, 150ms close, on the strong ease-out. Transitions, so a
 * quick second toggle reverses from where it is. Nothing moves on first
 * paint, and nothing moves with reduced motion. A closed list is `inert`.
 */
function RailChatCollapse({
  hidden,
  children
}: {
  hidden: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      data-rail-chats-collapse={hidden ? 'closed' : 'open'}
      // React 18 has no boolean `inert`; an empty string sets the attribute.
      {...(hidden ? { inert: '' } : {})}
      className={cn(
        'grid transition-[grid-template-rows] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
        hidden ? 'grid-rows-[0fr] duration-150' : 'grid-rows-[1fr] duration-200'
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            'transition-[opacity,translate] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
            hidden
              ? '-translate-y-1 opacity-0 duration-150'
              : 'translate-y-0 opacity-100 duration-200'
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

interface RailProjectChatsProps {
  project: Project
  /** Inside the chat peek: rows take the 6% hover fill of the hover panel. */
  peek?: boolean
  /** Peek only: the chat whose Rail icon the pointer is on (hover fill). */
  highlightedChatId?: string | null
  /** Runs after a row opens its chat. */
  onChatOpened?: (entry: ProjectChatEntry) => void
  /** Runs when a row starts a drag into a pane. */
  onChatDragStart?: () => void
  /** Runs when that drag ends (dropped or cancelled). */
  onChatDragEnd?: () => void
  /**
   * Peek only: the owner's delete request. The peek closes while the confirm
   * is open, so the confirm lives with the Rail list, not in the peek.
   */
  onRequestDelete?: (entry: ProjectChatEntry) => void
  /** Peek only: a row menu opened or closed (the peek stays open meanwhile). */
  onChatMenuOpenChange?: (open: boolean) => void
}

/**
 * The active project's chats in the Rail (Sidebar V2): the chat cards scoped
 * by the worktree pick, newest first; the first five, then
 * "Show N more". A click opens or focuses the chat; a drag onto a pane edge
 * splits the pane, a drag into a pane opens the chat there.
 *
 * Collapsed Rail: one agent icon per chat at the same y, "···" for "Show N
 * more", and a hover peek next to the Rail with the project row and these
 * rows drawn expanded.
 */
export function RailProjectChats({
  project,
  peek = false,
  highlightedChatId = null,
  onChatOpened,
  onChatDragStart,
  onChatDragEnd,
  onRequestDelete,
  onChatMenuOpenChange
}: RailProjectChatsProps): React.JSX.Element | null {
  const collapsed = useRailCollapsed()
  const { cards, openChatId } = useProjectChats(project)
  // The peek always lists the chats: it is how the collapsed Rail shows them.
  const hidden = useProjectChatsHidden(project.id) && !peek
  const { onOpen } = useChatCardActions()
  const { onDelete, ...menuActions } = useChatRowMenuActions(project.id)
  const [deleteTarget, setDeleteTarget] = useState<ProjectChatEntry | null>(null)
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const groupRef = useRef<HTMLDivElement>(null)
  const requestDelete = onRequestDelete ?? setDeleteTarget
  const changeChatMenuOpen = onChatMenuOpenChange ?? setChatMenuOpen
  const { startChatDrag, dragPayload } = usePaneDnd()
  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null)
  const [peekOpen, setPeekOpen] = useState(false)
  // A drag from the peek keeps the peek mounted (hidden) until the drag
  // ends: an unmounted drag source gets no dragend, so the drop zones
  // would stay up after a cancelled drag.
  const [peekDragging, setPeekDragging] = useState(false)
  const draggedChatId = dragPayload?.type === 'chat' ? dragPayload.sessionId : null

  const openChat = useCallback(
    (entry: ProjectChatEntry) => {
      logRailEvent(`${peek ? 'peek ' : ''}open chat ${entry.id}`)
      onOpen(entry)
      onChatOpened?.(entry)
    },
    [onOpen, onChatOpened, peek]
  )
  const closePeek = useCallback(() => setPeekOpen(false), [])
  // Close on the next frame: the browser takes the drag image after
  // dragstart, so the source must still be visible then.
  const closePeekAfterDragStart = useCallback(() => {
    requestAnimationFrame(() => setPeekOpen(false))
  }, [])
  const startPeekDrag = useCallback(() => {
    setPeekDragging(true)
    closePeekAfterDragStart()
  }, [closePeekAfterDragStart])
  const endPeekDrag = useCallback(() => setPeekDragging(false), [])
  const dragChat = useCallback(
    (entry: ProjectChatEntry, event: React.DragEvent) => {
      logRailEvent(`${peek ? 'peek ' : ''}drag chat ${entry.id}`)
      startChatDrag(entry.id, event)
      if (collapsed) closePeekAfterDragStart()
      onChatDragStart?.()
    },
    [startChatDrag, peek, collapsed, closePeekAfterDragStart, onChatDragStart]
  )
  const endDragChat = useCallback(() => onChatDragEnd?.(), [onChatDragEnd])
  // The peek repeats the worktree chip, so it moves up by the chip line too.
  const chipOffset = usePickedWorktree(project) ? RAIL_WORKTREE_CHIP_HEIGHT : 0

  // The confirm outlives the row (a deleted chat's row goes away).
  const deleteConfirm = peek ? null : (
    <ChatDeleteConfirmDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => {
        if (!open) setDeleteTarget(null)
      }}
      title={deleteTarget?.title ?? ''}
      onConfirm={() => {
        if (deleteTarget) {
          logRailEvent(`delete chat ${deleteTarget.id}`)
          onDelete(deleteTarget)
        }
      }}
      onClosed={() => groupRef.current?.querySelector<HTMLElement>('button')?.focus()}
    />
  )

  // The collapsed Rail has no chevron: a hidden list is simply not drawn.
  if (cards.length === 0 || (hidden && collapsed)) return deleteConfirm
  const openIndex = cards.findIndex((card) => isOpenChatCard(card, openChatId))
  const group = (
    <RailChatGroup
      ref={groupRef}
      id={peek ? undefined : railChatsListId(project.id)}
      total={cards.length}
      pinnedIndex={openIndex === -1 ? undefined : openIndex}
      data-testid={peek ? 'rail-chat-peek-chats' : 'rail-project-chats'}
    >
      <RailChatList aria-label={`Chats in ${project.name}`}>
        {cards.map((card, index) => {
          const id = card.entry.id
          return (
            <RailChatItem key={id} index={index}>
              <RailProjectChatRow
                card={card}
                open={isOpenChatCard(card, openChatId)}
                dragging={id === draggedChatId}
                onOpenChat={openChat}
                onDragChat={dragChat}
                onDragChatEnd={endDragChat}
                menuActions={menuActions}
                onRequestDelete={requestDelete}
                onMenuOpenChange={changeChatMenuOpen}
                data-highlighted={(peek && id === highlightedChatId) || undefined}
                className={cn(
                  peek &&
                    'hover:bg-foreground/[0.06] group-hover/rail-chat:bg-foreground/[0.06] group-data-[state=open]/rail-chat:bg-foreground/[0.06] data-[highlighted]:bg-foreground/[0.06]'
                )}
                onPointerEnter={collapsed ? () => setHoveredChatId(id) : undefined}
                onPointerLeave={
                  collapsed
                    ? () => setHoveredChatId((current) => (current === id ? null : current))
                    : undefined
                }
              />
            </RailChatItem>
          )
        })}
      </RailChatList>
      <RailShowMore />
    </RailChatGroup>
  )
  if (!collapsed) {
    return (
      <>
        <RailChatCollapse hidden={hidden}>{group}</RailChatCollapse>
        {deleteConfirm}
      </>
    )
  }

  return (
    <>
      <RailHoverPanel open={peekOpen || chatMenuOpen} onOpenChange={setPeekOpen}>
        <RailHoverPanelTrigger asChild>{group}</RailHoverPanelTrigger>
        <RailHoverPanelContent
          alignOffset={PEEK_ALIGN_OFFSET - chipOffset}
          forceMount={peekDragging || undefined}
          className="data-[state=closed]:invisible"
          data-testid="rail-chat-peek"
        >
          <RailDensityProvider density="expanded">
            <RailHoverPanelProjectRow
              icon={<ProjectIcon project={project} size={16} />}
              name={project.name}
            />
            <RailWorktreeChip project={project} collapsed={false} />
            <RailProjectChats
              project={project}
              peek
              highlightedChatId={hoveredChatId}
              onChatOpened={closePeek}
              onChatDragStart={startPeekDrag}
              onChatDragEnd={endPeekDrag}
              onRequestDelete={setDeleteTarget}
              onChatMenuOpenChange={setChatMenuOpen}
            />
          </RailDensityProvider>
        </RailHoverPanelContent>
      </RailHoverPanel>
      {deleteConfirm}
    </>
  )
}
