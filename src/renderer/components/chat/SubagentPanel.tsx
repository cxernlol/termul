import type { Subagent, SubagentWorkspace } from '@shared/types/subagent'
import { useReducedMotion } from 'framer-motion'
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Clock, FileDiff, Folder, GitBranch, Square, X } from '@/components/icons'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Button } from '@/components/ui/button'
import { IconActionButton } from '@/components/ui/icon-action-button'
import { Message, MessageContent } from '@/components/ui/message'
import type { ToolCall } from '@/lib/acp-api'
import type { FilePathResolutionContext } from '@/lib/file-path-links'
import { cn } from '@/lib/utils'
import { type ChatMessage as ChatMessageType, useAgentIdentity } from '@/stores/acp-store'
import { AgentProse } from './chat-agent-prose'
import { buildTimeline, consolidateThoughtGroups } from './chat-timeline'
import { isSubagentWaiting, SubagentAvatar, SubagentStatusLabel } from './SubagentRow'
import {
  formatTokens,
  lastSubagentMessage,
  type SubagentStatus,
  subagentResultText,
  subagentTitle,
  subagentToolCount,
  subagentType
} from './subagent-strip'
import { useSubagentChildCalls, useSubagentSurface } from './subagent-surface-context'
import { SubagentElapsed } from './subagent-time'
import { layoutTurnSteps, TurnSteps, useTurnStepWindow } from './TurnSteps'
import type { ParentTurn } from './tool-call-summary'
import { useEnterTracker } from './use-enter-tracker'
import { useStopSubagent } from './use-stop-subagent'

function Section({
  title,
  children
}: {
  title: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

/** A section the agent sent no data for: one muted line saying why. */
function Missing({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

/**
 * The task the subagent was given, as the opening user turn of its chat. A
 * long prompt is clamped to a few lines until the reader expands it.
 */
function PromptTurn({ prompt }: { prompt: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    // A longer prompt for the same subagent may now overflow the clamp.
    void prompt
    const el = ref.current
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1)
  }, [expanded, prompt])
  return (
    <Message align="end" className="py-2">
      <MessageContent className="w-fit max-w-[85%] items-end">
        <Bubble variant="tinted" align="end" className="max-w-full">
          <BubbleContent>
            <p ref={ref} className={cn('whitespace-pre-wrap', !expanded && 'line-clamp-3')}>
              {prompt}
            </p>
          </BubbleContent>
        </Bubble>
        {(overflows || expanded) && (
          <Button
            type="button"
            variant="link"
            size="xs"
            className="px-0"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show less' : 'Show full prompt'}
          </Button>
        )}
      </MessageContent>
    </Message>
  )
}

/** Where an orchestrated run works: its worktree's path and branch, or the chat's own folder. */
function WorkspaceSection({ workspace }: { workspace: SubagentWorkspace }): React.JSX.Element {
  return (
    <Section title="Workspace">
      <div className="flex flex-col gap-1.5 text-xs">
        {workspace.path && (
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <Folder size={14} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate font-mono text-foreground">{workspace.path}</span>
          </div>
        )}
        {workspace.branch && (
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <GitBranch size={14} className="shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap font-mono text-foreground">{workspace.branch}</span>
          </div>
        )}
        {workspace.base && <p className="pl-[22px] text-muted-foreground">{workspace.base}</p>}
        {!workspace.path && !workspace.branch && !workspace.base && (
          <p className="text-muted-foreground">Runs in the chat's own folder.</p>
        )}
      </div>
    </Section>
  )
}

/** "3 files changed, +42 -7" split into its parts; null when the shape is not the host's. */
function diffStatParts(
  diffStat: string
): { files: string; added?: string; removed?: string } | null {
  const match = /^(.*),\s*\+(\d+)(?:\s+-(\d+))?$/.exec(diffStat)
  return match ? { files: match[1], added: match[2], removed: match[3] } : null
}

/**
 * The settled worktree run's changes: the diff stat with its additions and
 * removals in their tones, and the branch the work sits on. Raw text when the
 * stat does not parse into parts.
 */
function DiffSummary({
  diffStat,
  branch
}: {
  diffStat: string
  branch?: string
}): React.JSX.Element {
  const parts = diffStatParts(diffStat)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
      {parts ? (
        <>
          <span className="flex items-center gap-1.5">
            <FileDiff size={14} className="shrink-0" aria-hidden="true" />
            <span className="text-foreground">{parts.files}</span>
          </span>
          <span className="tabular-nums">
            <span className="text-success">+{parts.added}</span>
            {parts.removed && <span className="text-destructive"> &minus;{parts.removed}</span>}
          </span>
        </>
      ) : (
        <span className="flex items-center gap-1.5">
          <FileDiff size={14} className="shrink-0" aria-hidden="true" />
          <span className="text-foreground">{diffStat}</span>
        </span>
      )}
      {branch && (
        <span className="flex min-w-0 items-center gap-1.5">
          <GitBranch size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate font-mono text-foreground">{branch}</span>
        </span>
      )}
    </div>
  )
}

/**
 * Paths a worktree run names resolve in its own checkout, so a relative link
 * never opens the chat's copy of the same file.
 */
function useRecordFilePathContext(
  record: Subagent | undefined
): FilePathResolutionContext | undefined {
  const { filePathContext } = useSubagentSurface()
  const path = record?.workspace?.path
  return useMemo(
    () => (path ? { cwd: path, projectRoot: path } : filePathContext),
    [path, filePathContext]
  )
}

/** The subagent's messages as chat messages; only the newest streams, and only while it runs. */
function subagentChatMessages(toolCall: ToolCall, running: boolean): ChatMessageType[] {
  const messages = toolCall.subagentMessages ?? []
  return messages.map((message, index) => ({
    id: `${toolCall.toolCallId}:${message.seq}`,
    role: 'agent',
    blocks: [{ type: 'text', text: message.text }],
    streaming: running && index === messages.length - 1,
    timestamp: message.timestamp,
    seq: message.seq
  }))
}

/**
 * What the subagent did, laid out like the main chat: its messages with its
 * tool calls between them, folded into work runs, and nested subagents as
 * groups. A muted line says why when the agent reports nothing.
 */
function Steps({
  toolCall,
  status,
  childCalls,
  parentTurn,
  agentName
}: {
  toolCall: ToolCall
  status: SubagentStatus
  childCalls: readonly ToolCall[]
  parentTurn: ParentTurn
  agentName: string
}): React.JSX.Element | null {
  const filePathContext = useRecordFilePathContext(toolCall.subagent)
  const running = status === 'running'
  const items = useMemo(
    () =>
      consolidateThoughtGroups(
        buildTimeline(subagentChatMessages(toolCall, running), [...childCalls])
      ),
    [toolCall, running, childCalls]
  )
  const layout = useMemo(() => layoutTurnSteps(items), [items])
  const stepWindow = useTurnStepWindow(`subagent:${toolCall.toolCallId}`)
  const itemKeys = useMemo(() => items.map((item) => item.key), [items])
  const enter = useEnterTracker(toolCall.toolCallId, itemKeys)
  if (items.length === 0) {
    const transcript = toolCall.subagent?.caps.transcript ?? 'none'
    if (transcript === 'final') {
      return <Missing>{agentName} reports only this subagent's result, not its steps.</Missing>
    }
    if (transcript === 'none') {
      return <Missing>{agentName} doesn't report what this subagent does.</Missing>
    }
    return running ? <Missing>Nothing to show yet.</Missing> : null
  }
  return (
    <div data-subagent-steps="" className="flex min-w-0 flex-col">
      <TurnSteps
        items={items}
        layout={layout}
        stepWindow={stepWindow}
        active={running}
        parentTurn={parentTurn}
        enter={enter}
        filePathContext={filePathContext}
        nested
      />
    </div>
  )
}

/**
 * True when the result is the end of what the subagent wrote, so the steps
 * above already show it: its last message, or (an orchestrated run's settle
 * card) every message it wrote, joined as streamed.
 */
function endsTheSteps(toolCall: ToolCall, result: string): boolean {
  const answer = result.trim()
  const written = (toolCall.subagentMessages ?? []).map((message) => message.text).join('')
  return answer.length > 0 && written.trim().endsWith(answer)
}

function Outcome({
  toolCall,
  status,
  agentName
}: {
  toolCall: ToolCall
  status: SubagentStatus
  agentName: string
}): React.JSX.Element | null {
  const reduced = useReducedMotion() ?? false
  const record = toolCall.subagent
  const filePathContext = useRecordFilePathContext(record)
  const outputFile = record?.background ? record.outputFile : undefined
  const outputLine = outputFile && (
    <p className="break-all font-mono text-xs text-muted-foreground">Output file: {outputFile}</p>
  )

  if (status === 'running') {
    return (
      <>
        {record?.caps.transcript !== 'live' && !lastSubagentMessage(toolCall) && (
          <Missing>The result shows here when it finishes.</Missing>
        )}
        {outputLine}
      </>
    )
  }

  const result = subagentResultText(toolCall)
  const shown = result && !endsTheSteps(toolCall, result) ? result : undefined
  const error = record?.activity === 'idle' ? record.end.error?.trim() : undefined
  // A settled worktree run keeps its diff summary next to the result; the
  // worktree survives, so the changes are where the user can find them.
  const diff =
    record?.workspace?.mode === 'worktree' && record.workspace.diffStat ? (
      <DiffSummary diffStat={record.workspace.diffStat} branch={record.workspace.branch} />
    ) : null
  if (!result && !error) {
    return (
      <>
        <Missing>
          {record?.background && record.source !== 'orchestrated'
            ? `This subagent ran in the background and reported to ${agentName}, not to this chat.`
            : 'The subagent returned no result.'}
        </Missing>
        {outputLine}
        {diff}
      </>
    )
  }
  const errorLine = error && error !== result?.trim() && (
    <p className="whitespace-pre-wrap break-words text-sm text-destructive">{error}</p>
  )
  if (!shown && !errorLine && !outputLine && !diff) return null
  return (
    <Section title="Result">
      {errorLine}
      {shown && (
        <AgentProse
          text={shown}
          streaming={false}
          reduced={reduced}
          filePathContext={filePathContext}
          linkScope={`subagent:${toolCall.toolCallId}`}
        />
      )}
      {outputLine}
      {diff}
    </Section>
  )
}

/** Stops the subagent at once: the panel is a deliberate view, so no confirm. */
function StopButton({
  toolCall,
  status
}: {
  toolCall: ToolCall
  status: SubagentStatus
}): React.JSX.Element | null {
  const { canStop, stopping, stop } = useStopSubagent(toolCall, status)
  if (!canStop) return null
  return (
    <Button type="button" variant="outline" size="xs" disabled={stopping} onClick={stop}>
      <Square size={10} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      {stopping ? 'Stopping' : 'Stop'}
    </Button>
  )
}

export interface SubagentPanelProps {
  toolCall: ToolCall
  status: SubagentStatus
  parentTurn: ParentTurn
  /** Place in the list the panel opened from. */
  position: { index: number; total: number }
  /** `keyboard`: the close came from a key (Esc, or Enter/Space on a button) and plays no exit. */
  onBack: (keyboard: boolean) => void
  onClose: (keyboard: boolean) => void
  /** Step to the previous (-1) or next (+1) sibling. */
  onStep: (delta: -1 | 1) => void
  /** Renders the title (a sheet needs its own accessible title element). */
  renderTitle?: (title: string) => ReactNode
  /** Where the clicked row's avatar was: the header avatar grows out of it. */
  morphFrom?: DOMRect | null
}

/** The avatar's travel from the row into the header: the eye follows it across. */
const AVATAR_MORPH_MS = 340

/**
 * Shared-element morph (FLIP) of the header avatar: it starts on the row's
 * avatar and settles in place, with transform only. No morph under reduced
 * motion or before layout (jsdom). Unmount cancels it.
 */
function useAvatarMorph(
  ref: React.RefObject<HTMLElement | null>,
  from: DOMRect | null | undefined,
  reduced: boolean
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !from || reduced || typeof el.animate !== 'function') return
    const to = el.getBoundingClientRect()
    if (to.width === 0 || from.width === 0) return
    const dx = from.left + from.width / 2 - (to.left + to.width / 2)
    const dy = from.top + from.height / 2 - (to.top + to.height / 2)
    const scale = from.width / to.width
    const animation = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transform: 'translate(0, 0) scale(1)' }
      ],
      { duration: AVATAR_MORPH_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
    )
    return () => animation.cancel()
  }, [ref, from, reduced])
}

/**
 * The detail view of one subagent: who it is and how it stands, then its
 * work read like a chat: the task it was given as the opening user turn, the
 * messages it wrote with its tool calls between them, and the result when it
 * adds something. A section the agent did not report is one muted line
 * saying why.
 */
export function SubagentPanel({
  toolCall,
  status,
  parentTurn,
  position,
  onBack,
  onClose,
  onStep,
  renderTitle,
  morphFrom
}: SubagentPanelProps): React.JSX.Element {
  const avatarRef = useRef<HTMLSpanElement>(null)
  useAvatarMorph(avatarRef, morphFrom, useReducedMotion() ?? false)
  const { agentId } = useSubagentSurface()
  const childCalls = useSubagentChildCalls(toolCall.toolCallId)
  const record = toolCall.subagent
  const title = subagentTitle(toolCall)
  const agentName = useAgentIdentity(agentId ?? null).name || 'The agent'
  const toolCount = subagentToolCount(toolCall, childCalls)
  const totalTokens = record?.usage?.totalTokens
  const meta = [
    // An orchestrated run leads with its child agent ("Codex"), a reported
    // record with its role or stated purpose.
    record?.agent?.name ?? subagentType(toolCall),
    record?.model,
    toolCount ? `${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}` : undefined,
    totalTokens !== undefined ? formatTokens(totalTokens) : undefined
  ].filter(Boolean)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys step siblings from anywhere inside; every control inside stays its own focus target
    <div
      data-testid="subagent-panel"
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose(true)
        } else if (
          position.total > 1 &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
          !(event.target as Element).closest('[data-subagent-panel-body]')
        ) {
          event.preventDefault()
          onStep(event.key === 'ArrowUp' ? -1 : 1)
        }
      }}
    >
      <div className="flex items-center gap-1 px-1.5 pt-1.5">
        <IconActionButton label="Back" onClick={(event) => onBack(event.detail === 0)}>
          <ArrowLeft />
        </IconActionButton>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
          Subagent of this chat
          {position.total > 1 && ` · ${position.index + 1} of ${position.total}`}
        </span>
        <IconActionButton label="Close" onClick={(event) => onClose(event.detail === 0)}>
          <X />
        </IconActionButton>
      </div>
      <div className="flex items-center gap-3 border-b border-border px-4 pb-3">
        <span ref={avatarRef} data-subagent-morph="" className="relative z-10 inline-flex shrink-0">
          <SubagentAvatar
            agent={record?.agent}
            status={status}
            waiting={isSubagentWaiting(toolCall, status)}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {renderTitle ? (
            renderTitle(title)
          ) : (
            <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          )}
          {meta.length > 0 && (
            <p className="break-words text-xs tabular-nums text-muted-foreground">
              {meta.join(' · ')}
            </p>
          )}
        </div>
        <div data-slot="subagent-actions" className="flex shrink-0 items-center gap-2">
          <SubagentStatusLabel toolCall={toolCall} status={status} />
          <SubagentElapsed toolCall={toolCall} status={status} />
          <StopButton toolCall={toolCall} status={status} />
        </div>
      </div>
      <div
        data-subagent-panel-body
        className="scroller-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {record?.workspace && <WorkspaceSection workspace={record.workspace} />}
        <div className="flex min-w-0 flex-col">
          {record?.prompt?.trim() ? (
            <PromptTurn key={toolCall.toolCallId} prompt={record.prompt} />
          ) : (
            <Missing>{agentName} did not share the task it gave this subagent.</Missing>
          )}
          <Steps
            key={toolCall.toolCallId}
            toolCall={toolCall}
            status={status}
            childCalls={childCalls}
            parentTurn={parentTurn}
            agentName={agentName}
          />
        </div>
        <Outcome toolCall={toolCall} status={status} agentName={agentName} />
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
        <Clock size={14} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">Runs on its own — you can't message a subagent.</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={(event) => onClose(event.detail === 0)}
        >
          Back to chat
        </Button>
      </div>
    </div>
  )
}
