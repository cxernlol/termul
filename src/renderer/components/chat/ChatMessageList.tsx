import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef } from 'react'
import {
  BOTTOM_THRESHOLD_PX,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller
} from '@/components/ui/message-scroller'
import { useMobileWebShell } from '@/hooks/use-mobile-web-shell'
import type { SessionId } from '@/lib/acp-api'
import type { SelectionContext } from '@/lib/composer/selection-context'
import type { FilePathResolutionContext } from '@/lib/file-path-links'
import { cn } from '@/lib/utils'
import { useAcpStore } from '@/stores/acp-store'
import { useToolCallRevealStore } from '@/stores/tool-call-reveal-store'
import { AgentSwitchSeparator } from './AgentSwitchSeparator'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatMessage } from './ChatMessage'
import { CHAT_GUTTER_X, STATUS_RAIL_GUTTER_X } from './chat-layout'
import {
  activityParentTurn,
  groupTurnActivity,
  stabilizedTimeline,
  type TimelineItem,
  type TurnTimelineItem
} from './chat-timeline'
import { opencodeStatusLine } from './opencode-status'
import { RowReveal } from './RowReveal'
import { SelectionContextLayer } from './SelectionContextLayer'
import { SubagentGroup } from './SubagentGroup'
import { ThoughtGroup } from './ThoughtGroup'
import { ToolCallCard } from './ToolCallCard'
import { TurnActivity } from './TurnActivity'
import { isSubagentCall } from './tool-call-summary'
import { type EnterTracker, useEnterTracker } from './use-enter-tracker'
import { WorktreeCreationCard } from './WorktreeCreationCard'

/**
 * Space above the first row and below the last. It lives in the virtualizer
 * (`paddingStart`/`paddingEnd`), not as CSS padding on the viewport: the
 * virtualizer must see the same end as the DOM, or its pinned bottom and
 * `scrollHeight` differ by this amount and the two pull the scroll apart.
 */
const LIST_PADDING_Y_PX = 24

/** Reports the live item count to the scroller so the jump button can badge unread. */
function ItemCountReporter({ count }: { count: number }): null {
  const { setItemCount } = useMessageScroller()
  useEffect(() => {
    setItemCount(count)
  }, [count, setItemCount])
  return null
}

interface ChatMessageListProps {
  items: TimelineItem[]
  /** Active session — resets enter-animation baseline on switch. */
  sessionId: SessionId
  /** True for the complete duration of an in-flight agent turn. */
  showRunningIndicator: boolean
  /** Seed the composer with a user message's text (edit affordance). */
  onEditMessage?: (text: string) => void
  /** Add selected message text to the composer as a selection context. */
  onAddSelectionContext?: (context: SelectionContext) => void
  /** Re-run the latest user turn (regenerate affordance on agent replies). */
  onRetry?: () => void
  /** Filesystem roots used for safe file-path links in agent prose. */
  filePathContext?: FilePathResolutionContext
}

/** Index of the last visible message item in the turn-grouped timeline. */
function lastMessageIndex(items: TurnTimelineItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'message') return i
  }
  return -1
}

/** Stable id for animate-enter tracking across message, tool, thought, and activity rows. */
function timelineItemId(it: TimelineItem): string {
  if (it.kind === 'message') return it.message.id
  if (it.kind === 'tool') return it.tool.toolCallId
  return it.key
}

/** Props shared between the list and its virtualized inner timeline. */
interface TimelineRenderProps {
  sessionId: SessionId
  groupedItems: TurnTimelineItem[]
  lastMsgIndex: number
  enter: EnterTracker
  onEditMessage?: (text: string) => void
  onRetry?: () => void
  filePathContext?: FilePathResolutionContext
  parentTurnActive: boolean
  statusLine: string | null
  /** Whether the scroller log announces additions (off on the mobile shell). */
  live: boolean
}

/**
 * Virtualized timeline body. Lives inside <MessageScrollerProvider> so it can
 * read `viewportEl` (the virtualizer's scroll element) and `pinned` (follow
 * state) from the scroller context. Only near-viewport rows are mounted.
 */
function VirtualizedTimeline({
  sessionId,
  groupedItems,
  lastMsgIndex,
  enter,
  onEditMessage,
  onRetry,
  filePathContext,
  parentTurnActive,
  statusLine,
  live
}: TimelineRenderProps): React.JSX.Element {
  const { viewportEl, pinned, setEndScroller } = useMessageScroller()
  // The virtualizer is the only scroll writer for the live edge. `anchorTo:
  // 'end'` keeps a pinned viewport pinned while the last row grows, follows
  // appended rows only when the reader was at the end, and holds the visible
  // row in place when older history is prepended (keys must stay stable).
  const virtualizer = useVirtualizer({
    count: groupedItems.length,
    getScrollElement: () => viewportEl,
    estimateSize: () => 120,
    overscan: 6,
    getItemKey: (i) => groupedItems[i]?.key ?? i,
    paddingStart: LIST_PADDING_Y_PX,
    paddingEnd: LIST_PADDING_Y_PX,
    anchorTo: 'end',
    followOnAppend: true,
    scrollEndThreshold: BOTTOM_THRESHOLD_PX
  })

  // The jump-to-latest button and viewport resizes go through the virtualizer,
  // so they land on the measured end, not on an estimated scrollHeight.
  useEffect(() => {
    setEndScroller((behavior) =>
      virtualizer.scrollToEnd({ behavior: behavior === 'smooth' ? 'smooth' : 'auto' })
    )
    return () => setEndScroller(null)
  }, [virtualizer, setEndScroller])

  // Open a session at its live edge. The list stays mounted across session
  // switches, and new keys give `anchorTo: 'end'` nothing to anchor to.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sessionId retriggers the jump on a session switch
  useEffect(() => {
    if (viewportEl) virtualizer.scrollToEnd()
  }, [sessionId, viewportEl, virtualizer])

  // `followOnAppend` follows only when the count grows. A coalesced flush can
  // append rows and trim the same number from the head of the live window
  // (`trimLiveWindow`), so the count stays and the new tail would stay below
  // the fold. Follow that case too, but only for a reader at the live edge;
  // history browsing keeps its place. A session switch is the effect above.
  const lastItemKey = groupedItems[groupedItems.length - 1]?.key
  const tailRef = useRef({ sessionId, count: groupedItems.length, lastKey: lastItemKey })
  useEffect(() => {
    const before = tailRef.current
    tailRef.current = { sessionId, count: groupedItems.length, lastKey: lastItemKey }
    if (before.sessionId !== sessionId || !pinned) return
    if (lastItemKey === before.lastKey || groupedItems.length > before.count) return
    virtualizer.scrollToEnd()
  }, [sessionId, groupedItems.length, lastItemKey, pinned, virtualizer])

  // A Background row in the status pill asks to show its card: bring the row
  // holding it into the virtual window; the card scrolls itself into place.
  const revealTarget = useToolCallRevealStore((s) =>
    s.target?.sessionId === sessionId ? s.target : null
  )
  const itemsRef = useRef(groupedItems)
  itemsRef.current = groupedItems
  useEffect(() => {
    if (!revealTarget) return
    const holds = (item: TimelineItem | TurnTimelineItem): boolean =>
      item.kind === 'activity'
        ? item.items.some(holds)
        : item.kind === 'tool' && item.tool.toolCallId === revealTarget.toolCallId
    const index = itemsRef.current.findIndex(holds)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' })
  }, [revealTarget, virtualizer])

  // Reverse-infinite-scroll: lazy-load older messages ONLY on genuine reader
  // intent — the viewport must be scrollable and the reader must have scrolled
  // up off the live edge (not pinned). Without this gate, the first paint (and
  // any session short enough to fit the viewport) has startIndex === 0 and would
  // fire loadOlderMessages with no intent; each prepend changes groupedItems.length
  // and re-runs the effect, cascading until the whole transcript is back in the
  // live window and undoing the bound. The store guards concurrent loads and is
  // idempotent at the history head; this local flag avoids spamming on rapid
  // range notifications. `anchorTo: 'end'` keeps the reader's position across
  // the prepend.
  const loadingOlderRef = useRef(false)
  const startIndex = virtualizer.range?.startIndex
  useEffect(() => {
    if (startIndex === undefined || startIndex > 0) return
    if (groupedItems.length === 0 || loadingOlderRef.current) return
    if (viewportEl === null || pinned) return
    if (viewportEl.scrollHeight <= viewportEl.clientHeight) return
    loadingOlderRef.current = true
    void useAcpStore
      .getState()
      .loadOlderMessages(sessionId, 50)
      .finally(() => {
        loadingOlderRef.current = false
      })
  }, [startIndex, groupedItems.length, sessionId, viewportEl, pinned])

  // When the reader returns to the live edge, drop the per-session backfill
  // allowance so the next coalesced flush trims the window back to the live
  // bound. Bounded browsing: load-on-scroll-up grows the retained window; coming
  // back to the live edge shrinks it again. Best-effort (optional chaining) so
  // isolated tests that mock the store don't crash on the unconditional call.
  useEffect(() => {
    if (!pinned) return
    useAcpStore.getState?.()?.clearSessionBackfill?.(sessionId)
  }, [pinned, sessionId])

  const renderItemContent = (item: TurnTimelineItem, index: number): React.JSX.Element => {
    if (item.kind === 'activity') {
      return (
        <TurnActivity
          items={item.items}
          active={item.active}
          parentTurn={activityParentTurn(groupedItems, item)}
          durationMs={item.durationMs}
          attentionRequired={item.attentionRequired}
          hasFinalResponse={item.hasFinalResponse}
          enter={enter}
          statusLine={item.active ? statusLine : null}
          filePathContext={filePathContext}
        />
      )
    }
    if (item.kind === 'tool') {
      const id = item.tool.toolCallId
      return (
        <RowReveal animate={enter.animate(id)} staggerIndex={enter.staggerIndex(id)}>
          {isSubagentCall(item.tool) ? (
            <SubagentGroup
              calls={[item.tool]}
              parentTurn={parentTurnActive ? 'active' : 'superseded'}
            />
          ) : (
            <ToolCallCard toolCall={item.tool} filePathContext={filePathContext} />
          )}
        </RowReveal>
      )
    }
    if (item.kind === 'thought-group') {
      return (
        <RowReveal animate={enter.animate(item.key)} staggerIndex={enter.staggerIndex(item.key)}>
          <ThoughtGroup messages={item.messages} isLiveTail={false} />
        </RowReveal>
      )
    }
    // Worktree-creation progress row — a session-lifetime launch record.
    if (item.kind === 'reload') {
      return (
        <div role="status" className="flex items-center gap-3 py-1 text-2xs text-muted-foreground">
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span>Agent reloaded</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </div>
      )
    }
    if (item.kind === 'worktree') {
      return (
        <RowReveal animate={enter.animate(item.key)} staggerIndex={enter.staggerIndex(item.key)}>
          <WorktreeCreationCard progressId={item.progressId} />
        </RowReveal>
      )
    }
    // CAP-2 (spec-in-chat-agent-switch): borderless agent-switch separator.
    if (item.kind === 'switch') {
      return <AgentSwitchSeparator switch={item.switch} />
    }
    return (
      <ChatMessage
        message={item.message}
        showHeader
        isLast={index === groupedItems.length - 1}
        isTurnTail={item.isTurnTail}
        turnText={item.turnText}
        actionsPinned={index === lastMsgIndex}
        animateEnter={item.isTurnTail ? false : enter.animate(item.message.id)}
        onEdit={onEditMessage}
        onRetry={onRetry}
        filePathContext={filePathContext}
      />
    )
  }

  // Fallback: when the viewport can't be measured (zero height — jsdom in tests,
  // or the pre-measurement first paint), render all items in normal flow so
  // content is always present. A real production viewport yields virtual items
  // and the windowed path runs.
  const virtualItems = virtualizer.getVirtualItems()
  if (viewportEl === null || virtualItems.length === 0) {
    return (
      <MessageScrollerContent live={live} className="mx-auto w-full max-w-3xl py-4">
        {groupedItems.map((item, index) => (
          <MessageScrollerItem
            key={item.key}
            messageId={item.key}
            scrollAnchor={item.kind === 'message' && item.message.role === 'user'}
          >
            {renderItemContent(item, index)}
          </MessageScrollerItem>
        ))}
      </MessageScrollerContent>
    )
  }

  return (
    <MessageScrollerContent
      live={live}
      className="mx-auto w-full max-w-3xl"
      style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
    >
      {virtualItems.map((virtualItem) => {
        const item = groupedItems[virtualItem.index]
        if (!item) return null
        return (
          <MessageScrollerItem
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            messageId={item.key}
            scrollAnchor={item.kind === 'message' && item.message.role === 'user'}
            data-index={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            {renderItemContent(item, virtualItem.index)}
          </MessageScrollerItem>
        )
      })}
    </MessageScrollerContent>
  )
}

/**
 * Scrollable message thread built on the MessageScroller engine. Agent process
 * output is grouped into one turn-level disclosure; the final reply remains a
 * normal message below it.
 */
export function ChatMessageList({
  items,
  sessionId,
  showRunningIndicator,
  onEditMessage,
  onAddSelectionContext,
  onRetry,
  filePathContext
}: ChatMessageListProps): React.JSX.Element {
  const opencodeNotice = useAcpStore((s) => s.sessions[sessionId]?.opencodeNotice)
  const statusLine = opencodeStatusLine(opencodeNotice)
  // The mobile shell announces turn events through its own live region, so the
  // log stops re-announcing rows as the virtualiser mounts them.
  const live = !useMobileWebShell()
  const groupedItems = useMemo(
    () => groupTurnActivity(items, showRunningIndicator),
    [items, showRunningIndicator]
  )
  // Stabilize item identity across commits: the grouping pipeline mints
  // fresh wrapper objects every time, which would force every memoized row
  // to re-render per store flush. Unchanged items reuse their previous
  // object so memo comparison actually bails.
  const stableRef = useRef<TurnTimelineItem[]>([])
  const stableItems = useMemo(() => {
    stableRef.current = stabilizedTimeline(stableRef.current, groupedItems)
    return stableRef.current
  }, [groupedItems])
  const lastMsgIndex = useMemo(() => lastMessageIndex(stableItems), [stableItems])
  const itemIds = useMemo(() => items.map(timelineItemId), [items])
  const enter = useEnterTracker(sessionId, itemIds)

  if (items.length === 0 && !showRunningIndicator) {
    return <ChatEmptyState sessionId={sessionId} />
  }

  return (
    <SelectionContextLayer className="relative min-h-0 flex-1" onAdd={onAddSelectionContext}>
      {/* Edge fades: content dissolves into the header and the composer dock.
          Both use `terminal-bg`, the panel fill, so the bottom fade does not
          read as a shadow above the composer. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-terminal-bg to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-terminal-bg to-transparent" />
      <MessageScrollerProvider autoScroll followContent={false}>
        <ItemCountReporter count={stableItems.length} />
        <MessageScroller>
          <MessageScrollerViewport className={cn(CHAT_GUTTER_X, STATUS_RAIL_GUTTER_X)}>
            <VirtualizedTimeline
              sessionId={sessionId}
              groupedItems={stableItems}
              lastMsgIndex={lastMsgIndex}
              enter={enter}
              filePathContext={filePathContext}
              onEditMessage={onEditMessage}
              onRetry={onRetry}
              parentTurnActive={showRunningIndicator}
              statusLine={statusLine}
              live={live}
            />
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    </SelectionContextLayer>
  )
}
