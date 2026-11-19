import { motion, useReducedMotion } from 'framer-motion'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from '@/components/icons'
import { CollapseExpandMotion } from '@/components/ui/collapse-expand-motion'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { FilePathResolutionContext } from '@/lib/file-path-links'
import { cn } from '@/lib/utils'
import { useToolCallReveal } from '@/stores/tool-call-reveal-store'
import { CHAT_ROW_MIN_H } from './chat-layout'
import { CHEVRON_TRANSITION } from './chat-motion'
import type { TimelineItem } from './chat-timeline'
import { formatTurnDuration } from './format-turn-duration'
import { SubagentGroup } from './SubagentGroup'
import { useSubagentSurface } from './subagent-surface-context'
import { ThinkingStatus } from './ThinkingStatus'
import { layoutTurnSteps, TurnSteps, useTurnStepWindow } from './TurnSteps'
import type { ParentTurn } from './tool-call-summary'
import type { EnterTracker } from './use-enter-tracker'
import { DiffStat } from './WorkRunGroup'

interface TurnActivityProps {
  items: TimelineItem[]
  active: boolean
  /** Where this turn stands; the subagents inside show running from it. */
  parentTurn: ParentTurn
  durationMs: number | null
  attentionRequired: boolean
  hasFinalResponse: boolean
  enter: EnterTracker
  /** Live OpenCode compaction or retry line. Shown only while the turn is active. */
  statusLine?: string | null
  /** Filesystem roots used for "Open file" actions on file tool calls. */
  filePathContext?: FilePathResolutionContext
}

/** Borderless, turn-level disclosure for reasoning, tools, and intermediate narration. */
function TurnActivityComponent({
  items,
  active,
  parentTurn,
  durationMs,
  attentionRequired,
  hasFinalResponse,
  enter,
  statusLine,
  filePathContext
}: TurnActivityProps): React.JSX.Element {
  const reduced = useReducedMotion() ?? false
  const [open, setOpen] = useState(active || (!attentionRequired && !hasFinalResponse))
  const wasActive = useRef(active)

  useEffect(() => {
    if (active) {
      setOpen(true)
    } else if (wasActive.current && (hasFinalResponse || attentionRequired)) {
      setOpen(false)
    }
    wasActive.current = active
  }, [active, attentionRequired, hasFinalResponse])

  const duration = formatTurnDuration(durationMs)
  const layout = useMemo(() => layoutTurnSteps(items), [items])
  const { summary, subagentGroups } = layout
  // Subagents stay in the transcript when the turn folds: a closed turn
  // shows its subagent groups, in launch order, under its header. They move
  // there once the steps have folded away, so a group never shows twice.
  const pinnedGroups = useMemo(() => [...new Set(subagentGroups.values())], [subagentGroups])
  const [stepsFolded, setStepsFolded] = useState(!open)
  useEffect(() => {
    if (open) setStepsFolded(false)
  }, [open])
  const stepWindow = useTurnStepWindow(items[0]?.key ?? '')
  // A Background row in the status pill shows a card of this turn.
  const { sessionId } = useSubagentSurface()
  const revealNonce = useToolCallReveal(sessionId, (id) =>
    items.some((item) => item.kind === 'tool' && item.tool.toolCallId === id)
  )
  const stepCount = items.length
  const { reveal } = stepWindow
  // A new step must not reopen a turn the reader folded while a reveal is pending.
  const revealedNonce = useRef<number | null>(null)
  useEffect(() => {
    if (revealNonce === null || revealNonce === revealedNonce.current) return
    revealedNonce.current = revealNonce
    setOpen(true)
    reveal(stepCount)
  }, [revealNonce, stepCount, reveal])
  const label =
    active && statusLine
      ? statusLine
      : active
        ? 'Working…'
        : duration
          ? `Worked for ${duration}`
          : 'Worked'

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-1 min-w-0">
      <CollapsibleTrigger
        className={cn(
          'flex w-full cursor-pointer items-center gap-1.5 text-left text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          CHAT_ROW_MIN_H,
          attentionRequired && !active && 'text-destructive'
        )}
      >
        <motion.span
          aria-hidden="true"
          className="shrink-0"
          animate={{ rotate: open ? 90 : 0 }}
          transition={reduced ? { duration: 0 } : CHEVRON_TRANSITION}
        >
          <ChevronRight size={13} />
        </motion.span>
        <ThinkingStatus text={label} shimmer={active} className="font-medium" />
        {summary ? <DiffStat added={summary.added} removed={summary.removed} /> : null}
        {attentionRequired && !active ? <span>· needs attention</span> : null}
      </CollapsibleTrigger>
      {!open && stepsFolded && pinnedGroups.length > 0 ? (
        <div data-turn-subagents className="min-w-0 pl-4">
          {pinnedGroups.map((group) => (
            <SubagentGroup key={group.key} calls={group.calls} parentTurn={parentTurn} />
          ))}
        </div>
      ) : null}
      <CollapsibleContent forceMount>
        <CollapseExpandMotion open={open} motion="chat" onExitComplete={() => setStepsFolded(true)}>
          <div className="min-w-0 pb-1 pl-4">
            <TurnSteps
              items={items}
              layout={layout}
              stepWindow={stepWindow}
              active={active}
              parentTurn={parentTurn}
              enter={enter}
              filePathContext={filePathContext}
            />
          </div>
        </CollapseExpandMotion>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Memoized: a turn's activity row wraps every tool card + thought in that
 * turn — under a stream it is the largest subtree in the timeline. With
 * stabilized timeline items + a stable `enter` tracker, an unchanged turn
 * bails out of render entirely instead of re-walking hundreds of icons.
 */
export const TurnActivity = memo(TurnActivityComponent)
