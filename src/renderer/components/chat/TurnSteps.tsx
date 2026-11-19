import { useCallback, useMemo, useState } from 'react'
import type { ToolCall } from '@/lib/acp-api'
import type { FilePathResolutionContext } from '@/lib/file-path-links'
import { cn } from '@/lib/utils'
import { ChatMessage } from './ChatMessage'
import { CHAT_ROW_MIN_H } from './chat-layout'
import type { TimelineItem } from './chat-timeline'
import { RowReveal } from './RowReveal'
import { SubagentGroup } from './SubagentGroup'
import { ThoughtGroup } from './ThoughtGroup'
import {
  isSubagentCall,
  type ParentTurn,
  summarizeToolActivity,
  type ToolActivitySummary
} from './tool-call-summary'
import type { EnterTracker } from './use-enter-tracker'
import { WorkRunGroup, type WorkRunItem } from './WorkRunGroup'

/** Steps a turn shows at first, and how many each "Show earlier" adds. */
const TURN_STEP_WINDOW = 40
const TURN_STEP_PAGE = 50

/**
 * How far each turn was expanded, by its first item's key. A tab switch
 * unmounts the chat, and the earlier steps a user asked for must still be
 * there when they come back.
 */
const expandedStepLimits = new Map<string, number>()

interface WorkRun {
  items: WorkRunItem[]
  summary: ToolActivitySummary
  failed: boolean
}

interface SubagentRun {
  key: string
  calls: ToolCall[]
}

export interface TurnStepLayout {
  /** Every call in the turn, for an aggregate diffstat. */
  summary: ToolActivitySummary | null
  /** Each run member's key to its run. */
  workRuns: Map<string, WorkRun>
  /** Each subagent call's key to its group. */
  subagentGroups: Map<string, SubagentRun>
}

/**
 * Each contiguous run of thoughts and tool calls gets its own nested
 * disclosure, so narration between two runs keeps its seat: work, text,
 * work. `workRuns` maps every member's key to its run, so a lone thought
 * (absent) still renders bare. Subagents launched between two narration
 * messages sit outside the runs as one group, at the first one's place;
 * `subagentGroups` maps each member's key to it. `summary` covers every call.
 */
export function layoutTurnSteps(items: readonly TimelineItem[]): TurnStepLayout {
  const allCalls: ToolCall[] = []
  const runs = new Map<string, WorkRun>()
  const groups = new Map<string, SubagentRun>()
  let run: WorkRunItem[] | null = null
  let group: SubagentRun | null = null
  const flush = (): void => {
    if (run) {
      const calls = run.flatMap((item) => (item.kind === 'tool' ? [item.tool] : []))
      const runSummary =
        calls.length > 0
          ? summarizeToolActivity(calls, { thoughts: run.length - calls.length })
          : null
      if (runSummary) {
        const entry = {
          items: run,
          summary: runSummary,
          failed: run.some((member) => member.kind === 'tool' && member.tool.status === 'failed')
        }
        for (const member of run) runs.set(member.key, entry)
      }
    }
    run = null
  }
  for (const item of items) {
    if (item.kind === 'tool') allCalls.push(item.tool)
    if (item.kind === 'tool' && isSubagentCall(item.tool)) {
      if (group) {
        group.calls.push(item.tool)
      } else {
        flush()
        group = { key: item.key, calls: [item.tool] }
      }
      groups.set(item.key, group)
    } else if (item.kind === 'tool' || item.kind === 'thought-group') {
      if (!run) run = []
      run.push(item)
    } else {
      flush()
      group = null
    }
  }
  flush()
  return { summary: summarizeToolActivity(allCalls), workRuns: runs, subagentGroups: groups }
}

export interface TurnStepWindow {
  stepLimit: number
  showEarlier: () => void
  /** Show at least the newest `count` steps. */
  reveal: (count: number) => void
}

/**
 * A long turn renders only its latest steps: every step stays mounted while
 * it shows, and hundreds of them cost hundreds of MB of DOM. Expansion
 * survives an unmount, keyed by the turn's first item.
 */
export function useTurnStepWindow(turnKey: string): TurnStepWindow {
  const [stepLimit, setStepLimit] = useState(
    () => expandedStepLimits.get(turnKey) ?? TURN_STEP_WINDOW
  )
  const reveal = useCallback((count: number) => setStepLimit((limit) => Math.max(limit, count)), [])
  return {
    stepLimit,
    showEarlier: () => {
      const next = stepLimit + TURN_STEP_PAGE
      expandedStepLimits.set(turnKey, next)
      setStepLimit(next)
    },
    reveal
  }
}

interface TurnStepsProps {
  items: TimelineItem[]
  layout: TurnStepLayout
  stepWindow: TurnStepWindow
  /** The steps are still growing: the newest narration and thought stream. */
  active: boolean
  /** Where this turn stands; the subagents inside show running from it. */
  parentTurn: ParentTurn
  enter: EnterTracker
  /** Filesystem roots used for "Open file" actions on file tool calls. */
  filePathContext?: FilePathResolutionContext
  /** The steps sit inside a subagent's panel: a subagent opened from them returns to it on Back. */
  nested?: boolean
}

/** A turn's steps in order: work runs, subagent groups, thoughts and narration between them. */
export function TurnSteps({
  items,
  layout,
  stepWindow,
  active,
  parentTurn,
  enter,
  filePathContext,
  nested = false
}: TurnStepsProps): React.JSX.Element {
  const { workRuns, subagentGroups } = layout
  const { stepLimit, showEarlier } = stepWindow
  const lastItem = items[items.length - 1]
  const { hiddenSteps, hiddenKeys } = useMemo(() => {
    const stepKeys = items
      .filter((item) => {
        const run = workRuns.get(item.key)
        if (run) return run.items[0] === item
        const group = subagentGroups.get(item.key)
        if (group) return group.key === item.key
        return item.kind === 'thought-group' || item.kind === 'message'
      })
      .map((item) => item.key)
    const hidden = Math.max(0, stepKeys.length - stepLimit)
    return { hiddenSteps: hidden, hiddenKeys: new Set(stepKeys.slice(0, hidden)) }
  }, [items, workRuns, subagentGroups, stepLimit])

  return (
    <>
      {hiddenSteps > 0 ? (
        <button
          type="button"
          onClick={showEarlier}
          className={cn(
            'flex w-full cursor-pointer items-center text-left text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            CHAT_ROW_MIN_H
          )}
        >
          Show {hiddenSteps} earlier {hiddenSteps === 1 ? 'step' : 'steps'}
        </button>
      ) : null}
      {items.map((item, index) => {
        if (hiddenKeys.has(item.key)) return null
        const group = subagentGroups.get(item.key)
        if (group) {
          if (group.key !== item.key) return null
          return (
            <RowReveal
              key={item.key}
              animate={enter.animate(item.key)}
              staggerIndex={enter.staggerIndex(item.key)}
            >
              <SubagentGroup calls={group.calls} parentTurn={parentTurn} nested={nested} />
            </RowReveal>
          )
        }
        const run = workRuns.get(item.key)
        if (run) {
          // Only a run's first item renders — as the group's disclosure;
          // the rest live inside it.
          if (run.items[0] !== item) return null
          return (
            <WorkRunGroup
              key={item.key}
              items={run.items}
              summary={run.summary}
              // Lets a still-streaming thought inside the run keep streaming.
              isLiveTail={active && run.items[run.items.length - 1] === lastItem}
              failed={run.failed}
              enter={enter}
              filePathContext={filePathContext}
            />
          )
        }
        if (item.kind === 'thought-group') {
          return (
            <RowReveal
              key={item.key}
              animate={enter.animate(item.key)}
              staggerIndex={enter.staggerIndex(item.key)}
            >
              <ThoughtGroup
                messages={item.messages}
                isLiveTail={active && index === items.length - 1}
              />
            </RowReveal>
          )
        }
        // Every tool sits in a run above. CAP-2 / worktree progress: switch
        // markers and worktree rows never reach the turn bucket
        // (groupTurnActivity emits them top-level), but guard the render
        // so the type stays exhaustive.
        if (
          item.kind === 'tool' ||
          item.kind === 'switch' ||
          item.kind === 'worktree' ||
          item.kind === 'reload'
        )
          return null
        return (
          <ChatMessage
            key={item.key}
            message={item.message}
            showHeader={false}
            isLast={active && index === items.length - 1}
            animateEnter={enter.animate(item.message.id)}
            filePathContext={filePathContext}
          />
        )
      })}
    </>
  )
}
