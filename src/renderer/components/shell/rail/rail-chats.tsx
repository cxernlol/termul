import { createContext, forwardRef, useContext, useMemo, useState } from 'react'
import { MoreHorizontal } from '@/components/icons'
import type { ProjectChatLiveState } from '@/components/sidebar/project-chat-row'
import { FOCUS_RING_CLASS } from '@/components/ui/panel-styles'
import { cn } from '@/lib/utils'
import { useRailCollapsed } from './rail-density'
import {
  RAIL_BLOCK_FADE_CLASS,
  RAIL_COLLAPSED_ROW_CLASS,
  RAIL_LABEL_FADE_CLASS
} from './rail-motion'

/** Chats a Rail project shows before "Show N more". */
const RAIL_CHAT_LIMIT = 5

/** Fill of the collapsed Rail status dot per live state (Sidebar V2); idle has none. */
const RAIL_CHAT_STATUS_DOT_CLASS: Record<ProjectChatLiveState, string | null> = {
  'needs-you': 'bg-warning',
  running: 'bg-primary',
  done: 'bg-foreground',
  idle: null
}

interface RailChatGroupContextValue {
  /** Every chat of the group, shown or not. */
  total: number
  /** A row that stays visible past the limit (the open chat). */
  pinnedIndex: number | undefined
  expanded: boolean
  setExpanded: (expanded: boolean) => void
}

const RailChatGroupContext = createContext<RailChatGroupContextValue | null>(null)

function useRailChatGroup(part: string): RailChatGroupContextValue {
  const context = useContext(RailChatGroupContext)
  if (!context) throw new Error(`${part} must be used inside <RailChatGroup>`)
  return context
}

export interface RailChatGroupProps extends React.ComponentPropsWithoutRef<'div'> {
  /** Number of chats in the group. */
  total: number
  /**
   * Index of a row that stays visible while the group is collapsed, even past
   * the limit: the open chat must never hide behind "Show N more".
   */
  pinnedIndex?: number
}

/**
 * Chats under a Rail project: 1px between rows, 4px below the
 * group. Owns the "Show N more" state that {@link RailChatItem} and
 * {@link RailShowMore} read. Compose it as
 * `RailChatGroup > RailChatList > RailChatItem > RailChatRow`, then `RailShowMore`.
 */
export const RailChatGroup = forwardRef<HTMLDivElement, RailChatGroupProps>(function RailChatGroup(
  { total, pinnedIndex, className, children, ...props },
  ref
) {
  const [expanded, setExpanded] = useState(false)
  const value = useMemo(
    () => ({ total, pinnedIndex, expanded, setExpanded }),
    [total, pinnedIndex, expanded]
  )
  return (
    <RailChatGroupContext.Provider value={value}>
      <div ref={ref} className={cn('flex flex-col gap-px pb-1', className)} {...props}>
        {children}
      </div>
    </RailChatGroupContext.Provider>
  )
})

/** The list element of a chat group. Give it an `aria-label`. */
export const RailChatList = forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<'ul'>>(
  function RailChatList({ className, ...props }, ref) {
    return <ul ref={ref} className={cn('flex flex-col gap-px', className)} {...props} />
  }
)

export interface RailChatItemProps extends React.ComponentPropsWithoutRef<'li'> {
  /** Position in the group; rows past the limit render only when expanded. */
  index: number
}

/** One list item. Renders nothing past the limit while the group is collapsed. */
export const RailChatItem = forwardRef<HTMLLIElement, RailChatItemProps>(function RailChatItem(
  { index, ...props },
  ref
) {
  const { expanded, pinnedIndex } = useRailChatGroup('RailChatItem')
  if (!expanded && index >= RAIL_CHAT_LIMIT && index !== pinnedIndex) return null
  return <li ref={ref} {...props} />
})

export interface RailChatRowProps extends React.ComponentPropsWithoutRef<'button'> {
  /** The chat is open in the active pane: keycap surface and `aria-current`. */
  open?: boolean
  /**
   * The row is the source of a drag in flight: 50% opacity and 98% scale, the
   * same feedback as a dragged workspace tab (no scale with reduced motion).
   */
  dragging?: boolean
}

/**
 * One chat row: 30px, 35px left (the agent icon sits under the project
 * name), 12px right, 9px gaps. Compose {@link RailChatIcon},
 * {@link RailChatTitle} and a trail (for example `ChatRowTrail`) inside.
 *
 * Collapsed Rail: the same 30px row with only the agent icon, in a 30px square
 * fill on the icon column (radius 8, hover 6% foreground). The open chat keeps
 * its keycap.
 *
 * Inside a {@link RailChatRowFrame}, the row keeps its hover fill while the
 * pointer is on the frame's More button and while its menu is open.
 *
 * To drag the row into a pane, pass `draggable` and the drag handlers, and
 * set `dragging` while the drag is in flight.
 */
export const RailChatRow = forwardRef<HTMLButtonElement, RailChatRowProps>(function RailChatRow(
  { open = false, dragging = false, className, ...props },
  ref
) {
  const collapsed = useRailCollapsed()
  return (
    <button
      ref={ref}
      type="button"
      aria-current={open ? 'true' : undefined}
      data-open={open || undefined}
      data-dragging={dragging || undefined}
      className={cn(
        'flex h-7.5 min-w-0 items-center text-left text-xs whitespace-nowrap',
        collapsed
          ? cn(RAIL_COLLAPSED_ROW_CLASS, 'rounded-lg')
          : 'w-full gap-2.25 rounded-lg pr-3 pl-8.75',
        'transition-[color,background-color,opacity,scale] duration-150 ease-out focus-visible:ring-inset motion-reduce:transition-none',
        FOCUS_RING_CLASS,
        open
          ? 'keycap'
          : collapsed
            ? 'hover:bg-foreground/[0.06] group-data-[state=open]/rail-chat:bg-foreground/[0.06]'
            : 'hover:bg-row-hover group-hover/rail-chat:bg-row-hover group-data-[state=open]/rail-chat:bg-row-hover',
        dragging && 'scale-[0.98] opacity-50 motion-reduce:scale-100',
        className
      )}
      {...props}
    />
  )
})

/**
 * Frame of one chat row with a menu: the row button and its More button are
 * siblings (no button inside a button). Use it as the context menu trigger,
 * so its `data-state` keeps the row filled while the menu is open.
 */
export const RailChatRowFrame = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function RailChatRowFrame({ className, ...props }, ref) {
    return <div ref={ref} className={cn('group/rail-chat relative', className)} {...props} />
  }
)

/**
 * The trail of a row with a More button: it gives way to the button while the
 * row is hovered, focused or has its menu open. The status stays in the row's
 * accessible name.
 */
export function RailChatTrailSlot({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>): React.JSX.Element {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center',
        RAIL_LABEL_FADE_CLASS,
        'group-hover/rail-chat:invisible group-focus-within/rail-chat:invisible group-data-[state=open]/rail-chat:invisible',
        className
      )}
      {...props}
    />
  )
}

/**
 * "…" at the end of a chat row (20px, 8px from the right, so its glyph ends
 * where the trail ends). Shown on hover, focus or while the menu is open;
 * hidden on the collapsed Rail. A click opens the row's context menu at the
 * button.
 */
export const RailChatRowMore = forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<'button'>, 'children'>
>(function RailChatRowMore({ className, ...props }, ref) {
  const collapsed = useRailCollapsed()
  if (collapsed) return null
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="menu"
      className={cn(
        'absolute top-1/2 right-2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground',
        'opacity-0 group-hover/rail-chat:opacity-100 group-focus-within/rail-chat:opacity-100 group-data-[state=open]/rail-chat:opacity-100 focus-visible:opacity-100',
        'transition-[color,background-color,opacity] duration-150 ease-out hover:bg-foreground/[0.06] hover:text-foreground motion-reduce:transition-none',
        FOCUS_RING_CLASS,
        className
      )}
      {...props}
    >
      <MoreHorizontal size={12} aria-hidden="true" />
    </button>
  )
})

/** 12px agent icon box at the start of a chat row. Holds a {@link RailChatStatusDot}. */
export function RailChatIcon({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex size-3 shrink-0 items-center justify-center', className)}
      {...props}
    />
  )
}

/**
 * 6px status dot on the agent icon's bottom-right corner (collapsed Rail,
 * where the trail is hidden): needs-you warning, running primary, new
 * activity foreground, nothing when idle. Decorative: put the status in the
 * row's accessible name.
 */
export function RailChatStatusDot({
  state,
  className,
  ...props
}: Omit<React.ComponentPropsWithoutRef<'span'>, 'children'> & {
  state: ProjectChatLiveState
}): React.JSX.Element | null {
  const fill = RAIL_CHAT_STATUS_DOT_CLASS[state]
  if (!fill) return null
  return (
    <span
      aria-hidden="true"
      data-rail-chat-status={state}
      className={cn('absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full', fill, className)}
      {...props}
    />
  )
}

/**
 * Chat title: fills the row and fades at its end instead of an ellipsis.
 * Not drawn on the collapsed Rail (the row's accessible name carries it).
 */
export function RailChatTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>): React.JSX.Element | null {
  const collapsed = useRailCollapsed()
  if (collapsed) return null
  return (
    <span
      className={cn(
        'fade-end min-w-0 flex-1 text-xs text-secondary-foreground',
        RAIL_LABEL_FADE_CLASS,
        className
      )}
      {...props}
    />
  )
}

/**
 * "Show N more" / "Show less" under a chat group: 28px, 56px left (the
 * title column), `muted-foreground` 12px. Nothing when every chat fits.
 * Collapsed Rail: the same 28px row reads "···" (centred); its accessible
 * name keeps the words.
 */
export const RailShowMore = forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<'button'>, 'children'>
>(function RailShowMore({ className, onClick, ...props }, ref) {
  const { total, pinnedIndex, expanded, setExpanded } = useRailChatGroup('RailShowMore')
  const collapsed = useRailCollapsed()
  const pinnedPastLimit = pinnedIndex !== undefined && pinnedIndex >= RAIL_CHAT_LIMIT ? 1 : 0
  const hidden = total - RAIL_CHAT_LIMIT - pinnedPastLimit
  if (hidden <= 0 && !expanded) return null
  const words = expanded ? 'Show less' : `Show ${hidden} more`
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={expanded}
      onClick={(event) => {
        setExpanded(!expanded)
        onClick?.(event)
      }}
      aria-label={
        collapsed ? (expanded ? 'Show fewer chats' : `Show ${hidden} more chats`) : undefined
      }
      className={cn(
        // 30px like every Rail row, so the collapsed fill is the same square.
        'flex h-7.5 items-center text-xs text-muted-foreground',
        !collapsed && 'w-full',
        collapsed
          ? cn(RAIL_COLLAPSED_ROW_CLASS, 'rounded-lg hover:bg-foreground/[0.06]')
          : 'rounded-lg pl-14 text-left whitespace-nowrap hover:bg-row-hover',
        'transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-inset',
        FOCUS_RING_CLASS,
        className
      )}
      {...props}
    >
      {collapsed ? (
        <span aria-hidden="true" className={RAIL_BLOCK_FADE_CLASS}>
          ···
        </span>
      ) : (
        <span className={RAIL_LABEL_FADE_CLASS}>{words}</span>
      )}
    </button>
  )
})
