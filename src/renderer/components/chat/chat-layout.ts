/**
 * Pane-scoped responsive layout helpers for ACP chat (Story 5.1).
 *
 * Breakpoints are **pane width**, not viewport — split panes on desktop make
 * `sm:`/`md:` viewport utilities wrong. Gutters use Tailwind `@container`
 * variants on the chat pane root; the composer toolbar uses a ResizeObserver
 * seam (`data-composer-toolbar`) because jsdom does not layout CSS container
 * queries reliably.
 */

import { type RefObject, useEffect, useState } from 'react'

/** Pane width below which the composer toolbar uses the explicit two-row layout. */
export const NARROW_PANE_PX = 400

/**
 * Horizontal chat column gutter: tighter on narrow panes, `px-3` (12px) or
 * `px-5` (20px) when the pane container is ≥ {@link NARROW_PANE_PX}.
 */
export const CHAT_GUTTER_X = 'px-3 @[400px]:px-5'

/**
 * Right gutter that keeps content out from under the status rail (12px inset,
 * 60px wide, 72px with its edge). It applies while the chat root has
 * `data-status-rail="shown"` and the pane is narrower than 892px (a 748px
 * column and 72px on each side); a wide pane centres the column clear of the
 * rail. It replaces the right half of {@link CHAT_GUTTER_X} and never animates.
 * `!` because `@[400px]:px-5` is emitted after the `@max` rule and would win.
 */
export const STATUS_RAIL_GUTTER_X = 'in-data-[status-rail=shown]:@max-[892px]:pr-[72px]!'

/**
 * Hit area for text controls in the chat pane.
 * 44px on a narrow pane, 40px when the pane is at least 400px.
 * No min width: a long label must not become a square.
 */
export const CHAT_HIT_MIN_H = 'min-h-11 @[400px]:min-h-10'

/**
 * Hit area for icon controls. The box is the target, so do not add a
 * pseudo-element that can overlap the next control.
 */
export const CHAT_HIT_ICON =
  'relative inline-flex shrink-0 items-center justify-center size-11 @[400px]:size-10'

/**
 * Dense agent-activity rows (tool calls, thought and turn headers). The row is
 * a full-width target, so 28px meets WCAG 2.5.8 for mouse; touch input gets
 * 44px. Keyed on pointer type, not pane width: a narrow desktop pane still has
 * a mouse. Stacked rows touch, so never extend their hit area vertically.
 */
export const CHAT_ROW_MIN_H = 'min-h-7 pointer-coarse:min-h-11'

/** Icon control inside a dense activity row; must not grow the row past {@link CHAT_ROW_MIN_H}. */
export const CHAT_ROW_ICON = 'size-7 pointer-coarse:size-11'

/**
 * Max height for the scrollable body of an inline agent prompt panel
 * (`AskUserQuestion`, `ElicitationQuestions`). Bounded so a long question
 * batch can never push the message list off-screen.
 */
export const QUESTION_PANEL_MAX_H = 'max-h-[min(55vh,30rem)]'

export type ComposerToolbarMode = 'narrow' | 'wide'

/**
 * Resolve narrow vs wide from a measured pane/composer width.
 * Width ≤ 0 (jsdom / pre-layout) stays `wide` so desktop tests keep the
 * single-row toolbar without mocking ResizeObserver.
 */
export function resolveComposerToolbarMode(
  widthPx: number,
  thresholdPx: number = NARROW_PANE_PX
): ComposerToolbarMode {
  if (widthPx <= 0) return 'wide'
  return widthPx < thresholdPx ? 'narrow' : 'wide'
}

/**
 * Observe an element's content box and report `narrow` | `wide` for the
 * composer toolbar. Defaults to `wide` until a positive width is measured.
 */
export function useComposerToolbarMode(
  ref: RefObject<HTMLElement | null>,
  thresholdPx: number = NARROW_PANE_PX
): ComposerToolbarMode {
  const [mode, setMode] = useState<ComposerToolbarMode>('wide')

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = (width: number): void => {
      setMode(resolveComposerToolbarMode(width, thresholdPx))
    }

    // Measure border-box width consistently for both the initial read and the
    // observer callback. The composer root spans the full pane, so its
    // border-box width matches the `@container` (pane) width that the CSS
    // `@[400px]:` gutter variant resolves against — using `contentRect.width`
    // here would exclude the gutter padding and disagree with the CSS threshold
    // by 12–20px, causing a visible narrow↔wide flip near 400px.
    const measureBorderBox = (): number => el.getBoundingClientRect().width

    apply(measureBorderBox())

    // Older mobile WebViews / SSR / jsdom-without-setup may not expose
    // ResizeObserver; fall back to the initial measurement so the composer
    // still renders (wide) instead of throwing inside the effect and
    // unmounting the chat subtree.
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      apply(measureBorderBox())
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, thresholdPx])

  return mode
}

/**
 * Card surface shared by the composer family: the chat composer, the agent
 * launcher composer and the prompt panels that replace the composer. No
 * focus edge: the card holds the editor, so a ring here lit up on every tap
 * or click into it. The caret and the controls' own rings show focus.
 */
export const COMPOSER_SURFACE_CLASS =
  'rounded-2xl border border-border/60 bg-card transition-[border-color]'

/**
 * Composer card at rest. Per-theme lift: `--composer-shadow`.
 */
export const COMPOSER_CARD_CLASS = `${COMPOSER_SURFACE_CLASS} shadow-composer`

/**
 * Composer V2 tray (Paper "Composer V2 · States", desktop): the `card` fill
 * with a 0.5px `border` edge and radius 20. It holds the raised composer card
 * (6px inset on the top and the sides) and the 40px foot row under it.
 */
export const COMPOSER_TRAY_CLASS =
  'flex flex-col rounded-[20px] border-[0.5px] border-border bg-card px-1.5 pt-1.5 transition-[border-color]'

/**
 * Composer V2 raised card inside the tray: the `popover` fill, radius 14
 * (tray radius 20 − 6px inset) and the control edge and drop
 * (`--shadow-control`: 0.5px `--popover-edge` + a 1px drop).
 */
export const COMPOSER_RAISED_CLASS = 'rounded-[14px] bg-popover shadow-control'

/**
 * Composer V2 compact card on the phone (Paper "2.6b"): no tray and no foot
 * row; the `popover` fill, radius 20 and the control edge and drop. The
 * transparent border keeps the drop-zone highlight (`border-primary/70`).
 */
export const COMPOSER_PHONE_CARD_CLASS =
  'rounded-[20px] border border-transparent bg-popover shadow-control transition-[border-color]'

/** Phone composer gutter: 16px from the screen edge (Paper "2.6b"). */
export const COMPOSER_PHONE_GUTTER_X = 'px-4'

/**
 * Phone composer input row (Paper "2.6b"/"2.6g", new and running chat alike):
 * 11px top, 2px bottom, 16px left, 14px right; one 24px line that grows to
 * five, then scrolls. The short placeholder fits one line on a 320px phone.
 */
export const COMPOSER_PHONE_INPUT_ROW_CLASS = 'gap-1 pb-0.5 pl-4 pr-3.5 pt-[11px]'
export const COMPOSER_PHONE_INPUT_MIN_HEIGHT = 24
export const COMPOSER_PHONE_INPUT_MAX_HEIGHT = 120
export const COMPOSER_PHONE_PLACEHOLDER = 'Ask anything…'

/**
 * Prompt panel (AskUserQuestion, ElicitationPrompt) that replaces the
 * composer: the composer surface, raised over the transcript.
 * Per-theme lift: `--prompt-panel-shadow`.
 */
export const PROMPT_PANEL_CLASS = `${COMPOSER_SURFACE_CLASS} shadow-prompt-panel`
