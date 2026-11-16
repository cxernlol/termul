import { useEffect, useState } from 'react'

/**
 * Rail expand/collapse choreography (collapsible-sidebar pattern: CSS
 * `transition-behavior: allow-discrete` + `@starting-style`, no JS animation).
 *
 * - `collapsing`: the width shrinks (200ms) while the rows keep their expanded
 *   layout and every expanded-only part fades out (150ms) before it goes to
 *   `display: none`. The icons stay at x = 28 and do not move.
 * - `settling`: the rows switch to the collapsed layout; collapsed-only parts
 *   (dividers, status dots, the stacked footer) fade in (150ms).
 * - `expanding`: the rows switch to the expanded layout at once; labels and
 *   meta fade in from `@starting-style` while the width grows (200ms).
 * - `idle`: no transition. A resize drag follows the pointer.
 *
 * `ShellRail` sets the phase as `data-rail-motion` on the `group/rail` nav;
 * the class constants below read it.
 */
export type RailMotionPhase = 'idle' | 'collapsing' | 'settling' | 'expanding'

/** Width transition of the Rail, in ms (open and close). */
export const RAIL_WIDTH_MS = 200
/** Fade of the labels and the blocks, in ms. Equal to the `display` hold. */
export const RAIL_FADE_MS = 150

const NEXT_PHASE: Record<RailMotionPhase, { next: RailMotionPhase; ms: number } | null> = {
  idle: null,
  collapsing: { next: 'settling', ms: RAIL_WIDTH_MS },
  settling: { next: 'idle', ms: RAIL_FADE_MS },
  expanding: { next: 'idle', ms: RAIL_WIDTH_MS }
}

/**
 * Phase and row density of the Rail for `expanded` (the persisted state).
 * The density stays `expanded` through `collapsing`, so the labels stay in
 * the DOM while they fade out. Under reduced motion the phase is always
 * `idle` and the state changes in one frame. A toggle in the middle of a
 * phase starts the new phase from the current values.
 */
export function useRailMotion(
  expanded: boolean,
  reducedMotion: boolean
): { phase: RailMotionPhase; density: 'expanded' | 'collapsed' } {
  const [state, setState] = useState<{ expanded: boolean; phase: RailMotionPhase }>({
    expanded,
    phase: 'idle'
  })
  let phase = state.phase
  if (state.expanded !== expanded) {
    // Derived state: set during render so the first frame of a toggle
    // already has the new phase (no frame with the old density).
    phase = reducedMotion ? 'idle' : expanded ? 'expanding' : 'collapsing'
    setState({ expanded, phase })
  }

  useEffect(() => {
    const step = NEXT_PHASE[phase]
    if (!step) return
    const id = window.setTimeout(() => {
      setState((current) => (current.phase === phase ? { ...current, phase: step.next } : current))
    }, step.ms)
    return () => window.clearTimeout(id)
  }, [phase])

  const density = expanded || phase === 'collapsing' ? 'expanded' : 'collapsed'
  return { phase, density }
}

/** Width transition of the Rail nav while it expands or collapses. */
export const RAIL_WIDTH_TRANSITION_CLASS =
  'transition-[width] duration-200 ease-out motion-reduce:transition-none'

/**
 * Expanded-only text inside a row (label, title, trail, meta). It fades out
 * and then goes to `display: none` (the display change waits for the fade);
 * it fades in from `@starting-style` when the Rail expands. The row keeps its
 * fixed height and `nowrap`, so nothing reflows.
 */
export const RAIL_LABEL_FADE_CLASS = [
  'transition-[opacity,display] duration-150 ease-out transition-discrete',
  'group-data-[rail-motion=collapsing]/rail:hidden group-data-[rail-motion=collapsing]/rail:opacity-0',
  'group-data-[rail-motion=expanding]/rail:starting:opacity-0',
  'motion-reduce:transition-none'
].join(' ')

/**
 * A block whose layout differs between the densities (section header or
 * divider, chat list, worktree chip, footer). It keeps its box (no
 * `display: none`, so the rows under it do not jump), fades out while the
 * Rail collapses, and fades in when the other density mounts it.
 */
export const RAIL_BLOCK_FADE_CLASS = [
  'transition-opacity duration-150 ease-out',
  'group-data-[rail-motion=collapsing]/rail:opacity-0',
  'group-data-[rail-motion=expanding]/rail:starting:opacity-0',
  'group-data-[rail-motion=settling]/rail:starting:opacity-0',
  'motion-reduce:transition-none'
].join(' ')

/**
 * A row on the collapsed Rail: a 30px wide fill at x = 13..43 (5px past the
 * list's 8px inset). With the 30px row height it is a square, and the icon
 * sits in its middle on the icon column (x = 28). That is where the expanded
 * row draws the icon, so it does not move on a toggle, and the middle of the
 * 56px collapsed Rail, so the column is symmetric (13px on each side).
 * A row must sit in the list's 8px inset (`px-2`) to land there.
 */
export const RAIL_COLLAPSED_ROW_CLASS = 'ml-[5px] w-7.5 justify-center px-0'
