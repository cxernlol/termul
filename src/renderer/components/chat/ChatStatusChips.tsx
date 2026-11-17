import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, FileDiff, TerminalSquare } from '@/components/icons'
import { useMobileWebShell } from '@/hooks/use-mobile-web-shell'
import type { BackgroundCommand, ToolCall } from '@/lib/acp-api'
import { cn } from '@/lib/utils'
import { normalizePath } from '@/lib/working-copy'
import { useAcpStore } from '@/stores/acp-store'
import type { ChatMessage } from '@/stores/acp-store/types'
import { useGitStatusStore } from '@/stores/git-status-store'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'
import { BackgroundCommandRow } from './BackgroundCommandRow'
import { sessionBackgroundCommands } from './background-commands'
import { openChangedFile } from './ChangedFilesList'
import { ChangesPanel } from './ChangesPanel'
import {
  RAIL_EXIT_MS,
  STATUS_RAIL_ICON_CLASS,
  StatusChip,
  StatusChipPanelHeader,
  StatusChipPanelNote,
  type StatusMarkKind,
  StatusRail,
  StatusRailSegment,
  StatusRailSlot
} from './StatusChip'
import { SubagentRow, subagentCountSummary } from './SubagentRow'
import { SubagentRowStop } from './SubagentRowStop'
import type { SubagentCounts, SubagentStatus } from './subagent-strip'
import { useChangesSeen } from './use-changes-seen'
import { type ChatChangedFiles, useChatChangedFiles } from './use-chat-changed-files'
import { useBackgroundWait, useCurrentTurnSubagents } from './use-current-turn-subagents'

export type StatusKind = 'subagents' | 'background' | 'changes'

/** Segment order, top to bottom. */
const KIND_ORDER: readonly StatusKind[] = ['subagents', 'background', 'changes']

interface ChatStatusChipsProps {
  sessionId: string
  cwd: string
  /** The chat's project; the blue "new changes" dot clears when its Git tab shows. */
  projectId?: string | null
  toolCalls: ToolCall[]
  messages: readonly ChatMessage[]
  /** Session `activeTurn`: a subagent with no status yet counts as running while true; its end refreshes git state. */
  turnActive: boolean
  /**
   * "Open in Git" in the Changes panel: opens the Git view (the Changes
   * tab on desktop, the Git sheet on the phone). Called with the segment, which
   * the Git sheet returns focus to. Without it the action is not shown.
   */
  onOpenGitChanges?: (opener: HTMLElement) => void
  /** Hide the rail (phone keyboard open, reconnect notice showing). */
  hidden?: boolean
  /**
   * Quick chats have no Git view. Omit the Changes segment and do not read git
   * status for the chat folder.
   */
  hideChanges?: boolean
  /** False while the chat tab is hidden (tabs stay mounted); closes the panel. */
  isVisible?: boolean
  /** The rail shows or hides: the chat root sets `data-status-rail` for the gutter. */
  onShownChange?: (shown: boolean) => void
  className?: string
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function subagentMark(counts: SubagentCounts): StatusMarkKind | null {
  if (counts.running > 0) return 'spinner'
  if (counts.failed > 0) return 'failed'
  return null
}

/** What a segment shows. The rail keeps the last one of a segment that leaves, for its fade out. */
interface SegmentView {
  label: string
  tooltip?: string
  count: number
  mark: StatusMarkKind | null
  icon: React.ReactNode
}

const SEGMENT_ICON_PROPS = {
  size: 14,
  className: STATUS_RAIL_ICON_CLASS,
  'aria-hidden': 'true'
} as const

/** What every segment gets from the rail: its open state and its surface. */
interface ChipBaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Phone shell: a bottom sheet in place of the popover. */
  sheet: boolean
  /** Max height of the scrolling list. */
  listClassName: string
}

function SubagentsChip({
  view,
  subagents,
  statuses,
  counts,
  waitingLabel,
  onRowOpen,
  ...base
}: ChipBaseProps & {
  view: SegmentView
  subagents: ToolCall[]
  statuses: SubagentStatus[]
  counts: SubagentCounts
  waitingLabel: string | null
  onRowOpen: () => void
}): React.JSX.Element {
  const subagentIds = useMemo(() => subagents.map((tc) => tc.toolCallId), [subagents])
  return (
    <StatusChip
      {...view}
      panelTitle="Subagents"
      open={base.open}
      onOpenChange={base.onOpenChange}
      sheet={base.sheet}
    >
      <StatusChipPanelHeader>{subagentCountSummary(counts)}</StatusChipPanelHeader>
      {waitingLabel && <StatusChipPanelNote>{waitingLabel}</StatusChipPanelNote>}
      <ul
        className={cn(
          'scroller-thin flex flex-col overflow-y-auto overscroll-contain',
          base.listClassName
        )}
      >
        {subagents.map((tc, i) => (
          <li key={tc.toolCallId} className="flex min-w-0 items-center gap-1">
            <div className="min-w-0 flex-1">
              <SubagentRow
                toolCall={tc}
                status={statuses[i] ?? 'stopped'}
                siblings={subagentIds}
                surface="popover"
                onOpen={onRowOpen}
              />
            </div>
            {base.sheet && <SubagentRowStop toolCall={tc} status={statuses[i] ?? 'stopped'} />}
          </li>
        ))}
      </ul>
    </StatusChip>
  )
}

function BackgroundChip({
  view,
  sessionId,
  commands,
  running,
  summary,
  onRowOpen,
  ...base
}: ChipBaseProps & {
  view: SegmentView
  sessionId: string
  commands: readonly BackgroundCommand[]
  running: number
  summary: string
  onRowOpen: () => void
}): React.JSX.Element {
  return (
    <StatusChip
      {...view}
      panelTitle="Background"
      open={base.open}
      onOpenChange={base.onOpenChange}
      sheet={base.sheet}
    >
      <StatusChipPanelHeader>{summary}</StatusChipPanelHeader>
      <ul
        className={cn(
          'scroller-thin flex flex-col overflow-y-auto overscroll-contain',
          base.listClassName
        )}
      >
        {commands.map((command) => (
          <li key={command.toolCallId} className="min-w-0">
            <BackgroundCommandRow sessionId={sessionId} command={command} onOpen={onRowOpen} />
          </li>
        ))}
      </ul>
      {running > 0 && (
        <StatusChipPanelNote>The agent gets each result when the command ends.</StatusChipPanelNote>
      )}
    </StatusChip>
  )
}

function ChangesChip({
  view,
  changes,
  cwd,
  turnActive,
  onOpenGitChanges,
  onClose,
  onOpened,
  ...base
}: ChipBaseProps & {
  view: SegmentView
  changes: ChatChangedFiles
  cwd: string
  turnActive: boolean
  onOpenGitChanges?: (opener: HTMLElement) => void
  onClose: () => void
  /** The panel opened: the changes count as seen. */
  onOpened: () => void
}): React.JSX.Element {
  const segmentRef = useRef<HTMLButtonElement>(null)
  // Set while focus is handed to the Git view, so closing this panel does not
  // pull focus back to the segment.
  const handingOffFocus = useRef(false)

  return (
    <StatusChip
      {...view}
      panelTitle="Changed files"
      open={base.open}
      onOpenChange={(next) => {
        if (next) onOpened()
        base.onOpenChange(next)
      }}
      sheet={base.sheet}
      triggerRef={segmentRef}
      onCloseAutoFocus={(event) => {
        if (!handingOffFocus.current) return
        handingOffFocus.current = false
        event.preventDefault()
      }}
    >
      <ChangesPanel
        changes={changes}
        cwd={cwd}
        turnActive={turnActive}
        showTitle={!base.sheet}
        onOpenFile={(path) => {
          onClose()
          void openChangedFile(path)
        }}
        onOpenGit={
          onOpenGitChanges
            ? () => {
                const opener = segmentRef.current
                if (!opener) return
                handingOffFocus.current = true
                onClose()
                onOpenGitChanges(opener)
              }
            : undefined
        }
      />
    </StatusChip>
  )
}

/**
 * Which segment has its panel open: one at a time. A hidden tab or a segment
 * whose last row went away closes it (adjusted during render, so it does not
 * open again when the segment comes back). Changes is the exception: it stays
 * open at count 0 (a discard empties it) and leaves when its panel closes. On
 * the phone the open sheet takes Back.
 */
function useOpenChip(
  rowCount: Record<StatusKind, number>,
  available: boolean,
  isMobile: boolean,
  hideChanges: boolean
): { base: (kind: StatusKind) => ChipBaseProps; close: () => void; activeKind: StatusKind | null } {
  const [openKind, setOpenKind] = useState<StatusKind | null>(null)
  const keepsOpenAtZero = openKind === 'changes' && !hideChanges
  const activeKind =
    openKind && available && (rowCount[openKind] > 0 || keepsOpenAtZero) ? openKind : null
  if (openKind !== null && activeKind === null) setOpenKind(null)

  const close = useCallback(() => setOpenKind(null), [])
  useOverlayRegistration('chat-status-sheet', isMobile && activeKind !== null, close)

  const listClassName = isMobile ? 'max-h-[min(22.5rem,55dvh)]' : 'max-h-72'
  const base = (kind: StatusKind): ChipBaseProps => ({
    open: activeKind === kind,
    onOpenChange: (next) => setOpenKind(next ? kind : null),
    sheet: isMobile,
    listClassName
  })
  return { base, close, activeKind }
}

/**
 * The segments in the rail, in order, with the ones that just left. A segment
 * that leaves stays for RAIL_EXIT_MS so it can fade out; one that comes back
 * in that time stays. Adjusted during render, so the segment never drops out
 * of the DOM for a frame before its fade.
 */
function useRailSlots(present: Record<StatusKind, boolean>): StatusKind[] {
  const [previous, setPrevious] = useState(present)
  const [exiting, setExiting] = useState<readonly StatusKind[]>([])
  if (KIND_ORDER.some((kind) => previous[kind] !== present[kind])) {
    setPrevious(present)
    setExiting((current) => {
      const next = current.filter((kind) => !present[kind])
      for (const kind of KIND_ORDER) {
        if (previous[kind] && !present[kind] && !next.includes(kind)) next.push(kind)
      }
      return next
    })
  }

  const timers = useRef(new Map<StatusKind, ReturnType<typeof setTimeout>>())
  useEffect(() => {
    for (const kind of exiting) {
      if (timers.current.has(kind)) continue
      timers.current.set(
        kind,
        setTimeout(() => {
          timers.current.delete(kind)
          setExiting((current) => current.filter((item) => item !== kind))
        }, RAIL_EXIT_MS)
      )
    }
    for (const [kind, timer] of timers.current) {
      if (exiting.includes(kind)) continue
      clearTimeout(timer)
      timers.current.delete(kind)
    }
  }, [exiting])
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return KIND_ORDER.filter((kind) => present[kind] || exiting.includes(kind))
}

/** The session's background commands and how to say their state. */
function useBackgroundCommands(sessionId: string): {
  commands: readonly BackgroundCommand[]
  running: number
  /** "1 running, 2 ended". */
  summary: string
  /** "1 command running in the background", or null when none runs. */
  hint: string | null
} {
  const commands = useAcpStore((s) => sessionBackgroundCommands(s.sessions[sessionId]))
  const running = commands.filter((command) => command.state === 'running').length
  const ended = commands.length - running
  const parts: string[] = []
  if (running > 0) parts.push(`${running} running`)
  if (ended > 0) parts.push(`${ended} ended`)
  const hint =
    running > 0
      ? `${running === 1 ? '1 command' : `${running} commands`} running in the background`
      : null
  return { commands, running, summary: parts.join(', '), hint }
}

/** True while Git status for the folder fails after it had read once. */
function useGitStatusFailed(cwd: string): boolean {
  return useGitStatusStore((state) => {
    if (!cwd) return false
    const key = normalizePath(cwd)
    return state.statuses[key] !== undefined && state.errors[key]?.status !== undefined
  })
}

/** What the live region says while the rail shows. */
function liveStatus(
  subagentCount: number,
  waitingLabel: string | null,
  counts: SubagentCounts,
  backgroundHint: string | null
): string {
  const parts: string[] = []
  if (subagentCount > 0) parts.push(waitingLabel ?? `Subagents: ${subagentCountSummary(counts)}`)
  if (backgroundHint) parts.push(backgroundHint)
  return parts.join('. ')
}

/**
 * The status rail at the top right of the chat: Subagents, Background and
 * Changes, each a segment shown only while its list has rows (Changes also
 * while its panel is open). A segment opens its own panel to its left, one at
 * a time; its mark says if something runs, failed or is new. The rail is
 * `absolute`: mount it as a direct child of the chat root (desktop) or of a
 * zero-height anchor below the plan bar (phone shell).
 */
export function ChatStatusChips({
  sessionId,
  cwd,
  projectId = null,
  toolCalls,
  messages,
  turnActive,
  onOpenGitChanges,
  hidden = false,
  isVisible = true,
  hideChanges = false,
  onShownChange,
  className
}: ChatStatusChipsProps): React.JSX.Element | null {
  const isMobile = useMobileWebShell()
  const changes = useChatChangedFiles(
    hideChanges ? '' : cwd,
    hideChanges ? [] : toolCalls,
    turnActive
  )
  const { subagents, backgroundRunning, statuses, counts } = useCurrentTurnSubagents(
    toolCalls,
    messages,
    turnActive
  )
  const waiting = useBackgroundWait(sessionId, backgroundRunning, turnActive)
  const waitingLabel = waiting > 0 ? `Waiting on ${plural(waiting, 'background subagent')}` : null
  const background = useBackgroundCommands(sessionId)
  const commands = background.commands
  const gitFailed = useGitStatusFailed(hideChanges ? '' : cwd)
  const seen = useChangesSeen({
    sessionId,
    cwd,
    projectId,
    files: hideChanges ? [] : changes.files
  })
  const rowCount: Record<StatusKind, number> = {
    subagents: subagents.length,
    background: commands.length,
    changes: hideChanges ? 0 : changes.files.length
  }
  const { base, close, activeKind } = useOpenChip(
    rowCount,
    !hidden && isVisible,
    isMobile,
    hideChanges
  )

  const present: Record<StatusKind, boolean> = {
    subagents: rowCount.subagents > 0,
    background: rowCount.background > 0,
    changes: rowCount.changes > 0 || activeKind === 'changes'
  }
  const firstPresent = KIND_ORDER.find((kind) => present[kind])
  const shown = !hidden && firstPresent !== undefined
  const slots = useRailSlots(present)

  // The rail stays mounted once it has shown, so it can fade out and back.
  const [everShown, setEverShown] = useState(false)
  if (shown && !everShown) setEverShown(true)

  useEffect(() => {
    if (!onShownChange) return
    onShownChange(shown)
    return () => onShownChange(false)
  }, [shown, onShownChange])

  const changesWords = plural(rowCount.changes, 'changed file')
  const views: Record<StatusKind, SegmentView> = {
    subagents: {
      label: `Subagents: ${[subagentCountSummary(counts), waitingLabel?.toLowerCase()].filter(Boolean).join('; ')}`,
      count: subagents.length,
      mark: subagentMark(counts),
      icon: <Bot {...SEGMENT_ICON_PROPS} />
    },
    background: {
      label: `Background commands: ${background.summary}`,
      count: commands.length,
      mark: background.running > 0 ? 'spinner' : null,
      icon: <TerminalSquare {...SEGMENT_ICON_PROPS} />
    },
    changes: {
      label: `Changes: ${changesWords}${gitFailed ? ', Git status failed' : seen.hasNew ? ', new changes' : ''}`,
      tooltip: `${changesWords} · Open list`,
      count: rowCount.changes,
      mark: gitFailed ? 'failed' : seen.hasNew ? 'new' : null,
      icon: <FileDiff {...SEGMENT_ICON_PROPS} />
    }
  }
  // The last view of each segment, for the one that is fading out.
  const lastViews = useRef<Partial<Record<StatusKind, SegmentView>>>({})
  useEffect(() => {
    for (const kind of KIND_ORDER) if (present[kind]) lastViews.current[kind] = views[kind]
  })

  const liveText = shown ? liveStatus(subagents.length, waitingLabel, counts, background.hint) : ''

  const renderSegment = (kind: StatusKind): React.ReactNode => {
    switch (kind) {
      case 'subagents':
        return (
          <SubagentsChip
            {...base('subagents')}
            view={views.subagents}
            subagents={subagents}
            statuses={statuses}
            counts={counts}
            waitingLabel={waitingLabel}
            onRowOpen={close}
          />
        )
      case 'background':
        return (
          <BackgroundChip
            {...base('background')}
            view={views.background}
            sessionId={sessionId}
            commands={commands}
            running={background.running}
            summary={background.summary}
            onRowOpen={close}
          />
        )
      case 'changes':
        return (
          <ChangesChip
            {...base('changes')}
            view={views.changes}
            changes={changes}
            cwd={cwd}
            turnActive={turnActive}
            onOpenGitChanges={onOpenGitChanges}
            onClose={close}
            onOpened={seen.markSeen}
          />
        )
    }
  }

  return (
    <>
      <span aria-live="polite" className="sr-only">
        {liveText}
      </span>
      {everShown && (
        <StatusRail shown={shown} className={className}>
          {slots.map((kind, index) => {
            const exiting = !present[kind]
            // The first slot has no divider. A leaving slot keeps the divider it had.
            const isFirst = exiting
              ? slots.slice(0, index).every((other) => !present[other])
              : kind === firstPresent
            const last = lastViews.current[kind]
            return (
              <StatusRailSlot
                key={kind}
                isFirst={isFirst}
                exiting={exiting}
                detached={firstPresent !== undefined}
              >
                {exiting
                  ? last && (
                      <StatusRailSegment
                        label={last.label}
                        icon={last.icon}
                        count={last.count}
                        mark={last.mark}
                        tabIndex={-1}
                      />
                    )
                  : renderSegment(kind)}
              </StatusRailSlot>
            )
          })}
        </StatusRail>
      )}
    </>
  )
}
