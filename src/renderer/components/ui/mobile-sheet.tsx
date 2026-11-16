import {
  AnimatePresence,
  motion,
  type Transition,
  useIsPresent,
  useReducedMotion,
  type Variants
} from 'framer-motion'
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { ArrowLeft, ChevronRight, Search } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useOverlayStackStore } from '@/stores/overlay-stack-store'
import { INNER_FIELD_FOCUS_CLASS } from './panel-styles'
import { SheetClose, SheetContent, SheetTitle } from './sheet'
import { Switch } from './switch'

const HEADER_BUTTON =
  'flex size-11 items-center justify-center rounded-full text-foreground transition-colors duration-150 ease-out hover:bg-foreground/[0.06] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring'

/*
 * Composer V2 phone sheets (Paper "2.6d"–"2.6n"): rows sit in grouped cards
 * (`muted` fill, the control edge and drop, radius 12) and are split by a
 * 0.5px hairline inset to the text column (`--sheet-divider-inset`: 14px, or
 * 44px when the row has an 18px icon). Rows are 48px, 60px with a subtitle;
 * the title is 15/20, the subtitle 14/18, and both fade at the end.
 */
const GROUP_CARD =
  "flex flex-col overflow-hidden rounded-xl bg-muted shadow-control [&>*+*]:before:pointer-events-none [&>*+*]:before:absolute [&>*+*]:before:right-0 [&>*+*]:before:top-0 [&>*+*]:before:left-[var(--sheet-divider-inset,14px)] [&>*+*]:before:h-[0.5px] [&>*+*]:before:bg-[var(--popover-edge)] [&>*+*]:before:content-['']"

/** Hover 4%, pressed and chosen 10% (`foreground` mix), never a tick. */
const ROW_PRESS =
  'transition-colors duration-150 ease-out pointer-fine:enabled:hover:bg-foreground/[0.04] enabled:active:bg-foreground/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:text-disabled-foreground'

const ROW_TITLE = 'fade-end text-[15px] leading-5'
const ROW_SUBTITLE = 'fade-end text-sm leading-[18px] text-muted-foreground'

export const SUBVIEW_TRIGGER_ATTR = 'data-sheet-subview-trigger'

/** Where a sheet is: the keys of the views pushed above its root, bottom first. */
export interface SheetNav {
  path: readonly string[]
  pop: () => void
}

type Direction = 'push' | 'pop'

const pathId = (path: readonly string[]): string => path.join('\n')

const SLIDE: Transition = { duration: 0.42, ease: [0.32, 0.72, 0, 1] }
const FADE: Transition = { duration: 0.15, ease: 'easeOut' }
const DIM = 0.35

// The view on top slides across the full width; the one beneath moves 30% and dims.
const slide: Variants = {
  enter: (dir: Direction) => (dir === 'push' ? { x: '100%', zIndex: 1 } : { x: '-30%', zIndex: 0 }),
  center: { x: 0 },
  exit: (dir: Direction) => (dir === 'push' ? { x: '-30%', zIndex: 0 } : { x: '100%', zIndex: 1 })
}
const dim: Variants = {
  enter: (dir: Direction) => ({ opacity: dir === 'push' ? 0 : DIM }),
  center: { opacity: 0 },
  exit: (dir: Direction) => ({ opacity: dir === 'push' ? DIM : 0 })
}
const fade: Variants = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }

/**
 * Which way the sheet moved, from the depth of the view it moves to. Derived
 * in render (the stored-previous-value pattern), so the entering and leaving
 * views read the same direction in the same commit.
 */
function useDirection(path: readonly string[]): Direction {
  const key = pathId(path)
  const [last, setLast] = useState({ key, depth: path.length, direction: 'push' as Direction })
  if (last.key !== key) {
    const next = {
      key,
      depth: path.length,
      direction: (path.length < last.depth ? 'pop' : 'push') as Direction
    }
    setLast(next)
    return next.direction
  }
  return last.direction
}

/**
 * One view of the sheet. A leaving view keeps its last content for the
 * transition but is inert, so focus, taps and screen readers only reach the
 * view the sheet is moving to.
 */
const SheetLayer = forwardRef<
  HTMLDivElement,
  { direction: Direction; reduced: boolean; className?: string; children: ReactNode }
>(function SheetLayer({ direction, reduced, className, children }, ref) {
  const present = useIsPresent()
  return (
    <motion.div
      ref={ref}
      custom={direction}
      variants={reduced ? fade : slide}
      initial="enter"
      animate="center"
      exit="exit"
      transition={reduced ? FADE : SLIDE}
      aria-hidden={present ? undefined : true}
      {...(present ? {} : { inert: '' })}
      className="relative flex min-h-0 flex-1 flex-col bg-popover"
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1',
          className
        )}
      >
        {children}
      </div>
      {reduced ? null : (
        <motion.div
          aria-hidden="true"
          custom={direction}
          variants={dim}
          transition={SLIDE}
          className="pointer-events-none absolute inset-0 bg-overlay"
        />
      )}
    </motion.div>
  )
})

function TitleText({ children }: { children: string }): React.JSX.Element {
  const present = useIsPresent()
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={FADE}
      aria-hidden={present ? undefined : true}
      className="min-w-0 truncate [grid-area:1/1]"
    >
      {children}
    </motion.span>
  )
}

/** iOS sheet curve (Vaul): very steep start, gentle settle. */
const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
/** A drag that does not dismiss snaps back fast; a dismiss leaves fast too. */
const SHEET_SETTLE_MS = 200
/** Movement before a press becomes a drag, so taps on Back and the handle stay taps. */
const DRAG_SLOP_PX = 4
/** Release speed that dismisses on its own (px/ms, a flick). */
const DISMISS_VELOCITY = 0.11
/** A move sample older than this at release is a hold, not a flick. */
const STALE_VELOCITY_MS = 100
/** Upward pull past the top: the sheet follows a fifth of the finger. */
const RUBBER_BAND = 0.2

/** The backdrop rendered just before a sheet's content (`data-sheet-overlay`). */
function overlayOf(content: HTMLElement): HTMLElement | null {
  const prev = content.previousElementSibling
  return prev instanceof HTMLElement && prev.hasAttribute('data-sheet-overlay') ? prev : null
}

/** Move the sheet to `y` and fade the backdrop by how far it is from home. */
function placeSheet(content: HTMLElement, y: number, height: number, transition: string): void {
  content.style.transition = transition
  content.style.transform = y === 0 ? '' : `translate3d(0, ${y}px, 0)`
  const overlay = overlayOf(content)
  if (overlay) {
    overlay.style.transition = transition.replace('transform', 'opacity')
    const progress = Math.min(1, Math.max(0, y / (height || 1)))
    overlay.style.opacity = y <= 0 ? '' : String(1 - progress)
  }
}

/**
 * Drag-to-dismiss for a phone bottom sheet (gestures, apple-design): while
 * the finger is down the sheet follows it 1:1 (a fifth of it upward, past
 * the top) and the backdrop fades with the drag; on release a pull past
 * min(64px, 15% of the sheet) or a downward flick closes the sheet from where
 * it is, else it snaps back. Only the handle and header start a drag, so the
 * list keeps its own scroll. Reduced motion: the sheet still tracks the
 * finger (the user makes that motion), then settles without travel.
 */
function useSheetDrag(
  contentRef: React.RefObject<HTMLDivElement>,
  closeRef: React.RefObject<HTMLButtonElement>,
  reduced: boolean
): {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void
} {
  const drag = useRef<{
    id: number
    startY: number
    y: number
    lastY: number
    lastT: number
    velocity: number
    dragging: boolean
    height: number
  } | null>(null)
  // A drag ends with a click on whatever the finger lifted over: swallow it.
  const swallowClick = useRef(false)

  const onMove = useCallback(
    (event: PointerEvent) => {
      const state = drag.current
      const content = contentRef.current
      if (!state || !content || event.pointerId !== state.id) return
      const dy = event.clientY - state.startY
      if (!state.dragging) {
        if (Math.abs(dy) < DRAG_SLOP_PX) return
        state.dragging = true
        state.height = content.offsetHeight
        // The animation must not fight the finger.
        content.style.animation = 'none'
        ;(event.target as Element | null)?.setPointerCapture?.(event.pointerId)
      }
      const now = event.timeStamp
      const dt = Math.max(1, now - state.lastT)
      state.velocity = (event.clientY - state.lastY) / dt
      state.lastY = event.clientY
      state.lastT = now
      state.y = dy >= 0 ? dy : dy * RUBBER_BAND
      placeSheet(content, state.y, state.height, 'none')
    },
    [contentRef]
  )

  const onUp = useCallback(
    (event: PointerEvent) => {
      const state = drag.current
      const content = contentRef.current
      if (!state || event.pointerId !== state.id) return
      drag.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (!state.dragging || !content) return
      swallowClick.current = true
      // A finger that stopped before lifting has no speed left: a sample
      // older than 100ms is not a flick (CodeRabbit on #1868).
      const velocity = event.timeStamp - state.lastT > STALE_VELOCITY_MS ? 0 : state.velocity
      const threshold = Math.min(64, state.height * 0.15)
      const dismiss =
        event.type !== 'pointercancel' &&
        (state.y > threshold || (velocity > DISMISS_VELOCITY && state.y > 0))
      const settle = reduced ? 'none' : `transform ${SHEET_SETTLE_MS}ms ${SHEET_EASE}`
      if (!dismiss) {
        placeSheet(content, 0, state.height, settle)
        return
      }
      // Leave from where the finger let go: no exit keyframe restarting at 0.
      content.setAttribute('data-drag-dismissed', '')
      const overlay = overlayOf(content)
      if (overlay) overlay.style.animation = 'none'
      // Our own close click must pass the swallow above.
      const close = (): void => {
        swallowClick.current = false
        closeRef.current?.click()
      }
      if (reduced) {
        close()
        return
      }
      placeSheet(content, state.height, state.height, settle)
      window.setTimeout(close, SHEET_SETTLE_MS)
    },
    [contentRef, closeRef, onMove, reduced]
  )

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    },
    [onMove, onUp]
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || drag.current) return
      drag.current = {
        id: event.pointerId,
        startY: event.clientY,
        y: 0,
        lastY: event.clientY,
        lastT: event.timeStamp,
        velocity: 0,
        dragging: false,
        height: 0
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [onMove, onUp]
  )

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return { onPointerDown, onClickCapture }
}

interface MobileSheetContentProps
  extends Omit<ComponentPropsWithoutRef<typeof SheetContent>, 'side' | 'title' | 'closeButton'> {
  title: string
  /** The sheet's view stack; without it the sheet has only its root. */
  nav?: SheetNav
  bodyClassName?: string
}

const NO_PATH: readonly string[] = []

/**
 * A bottom sheet with a grab handle that closes it, a header (Back above the
 * root, no ✕) and one scrolling body per view. A push slides the new view in
 * from the right over the dimmed old one; a pop reverses it; a pushed view
 * keeps at least the root view's height. Reduced motion swaps views with a
 * short fade.
 */
export function MobileSheetContent({
  title,
  nav,
  className,
  bodyClassName,
  children,
  ...props
}: MobileSheetContentProps): React.JSX.Element {
  const path = nav?.path ?? NO_PATH
  const key = path.at(-1) ?? ''
  const depth = path.length
  const contentRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const reduced = useReducedMotion() ?? false
  const direction = useDirection(path)
  const closeRef = useRef<HTMLButtonElement>(null)
  const sheetDrag = useSheetDrag(contentRef, closeRef, reduced)

  // Composer V2 (decided with the design owner, 2026-11-16): a pushed view
  // keeps the root view's height, so the sheet does not jump while the user
  // moves through the stack. The root height is measured while the root shows;
  // a taller pushed view may still grow the sheet up to its max height.
  const depthRef = useRef(depth)
  depthRef.current = depth
  const rootHeightRef = useRef<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const viewportCallbackRef = useCallback((viewport: HTMLDivElement | null) => {
    viewportRef.current = viewport
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (depthRef.current === 0) rootHeightRef.current = viewport.offsetHeight
    })
    observer.observe(viewport)
    observerRef.current = observer
  }, [])

  const previousPath = useRef(path)
  useLayoutEffect(() => {
    const previous = previousPath.current
    previousPath.current = path
    if (pathId(previous) === pathId(path)) return

    const viewport = viewportRef.current
    if (viewport) {
      // The root height comes from the observer while the root showed: by now
      // the DOM already holds the pushed view.
      const root = rootHeightRef.current
      // Capped by the space the sheet has (85dvh minus the 72px handle and
      // header), so a rotation that shrinks the screen never clips the list.
      viewport.style.minHeight =
        path.length > 0 && root !== null ? `min(${root}px, calc(85dvh - 4.5rem))` : ''
    }

    if (path.length > previous.length) {
      backRef.current?.focus()
      return
    }
    // Back on a view: focus the row that opened the view just left.
    const left = previous[path.length]
    const trigger = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>(`[${SUBVIEW_TRIGGER_ATTR}]`) ?? []
    ).find((el) => el.getAttribute(SUBVIEW_TRIGGER_ATTR) === left && !el.closest('[inert]'))
    if (trigger) trigger.focus()
    else if (path.length > 0) backRef.current?.focus()
  }, [path])

  return (
    <SheetContent
      ref={contentRef}
      side="bottom"
      closeButton={false}
      className={cn(
        'flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-[14px] border-t-[0.5px] border-border bg-popover p-0 shadow-[0_-4px_16px_#00000066]',
        // The iOS sheet (gestures): up on the steep Vaul curve, down faster.
        // A drag-dismissed sheet already left the screen: no exit keyframe.
        'data-[state=open]:duration-500 data-[state=closed]:duration-200 data-[state=open]:ease-[cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:ease-[cubic-bezier(0.32,0.72,0,1)] data-[drag-dismissed]:animate-none!',
        className
      )}
      overlayClassName="data-[state=open]:duration-500 data-[state=closed]:duration-200 data-[state=open]:ease-[cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:ease-[cubic-bezier(0.32,0.72,0,1)]"
      {...props}
    >
      {/* The grab handle closes the sheet (tap, or the drag the sheet already
          has): a tactile 36x5 bar with a 44px tap area. Root views have no ✕;
          a pushed view keeps ← Back (Paper "2.6e"). */}
      {/* Handle and header: the drag area (touch-action none, so the browser
          leaves the vertical pan to the sheet). Pointer only: the handle
          (Close) and Escape are the keyboard and screen-reader ways out. */}
      <div
        className="shrink-0 touch-none select-none"
        onPointerDown={sheetDrag.onPointerDown}
        onClickCapture={sheetDrag.onClickCapture}
      >
        <div className="flex h-7 shrink-0 items-center justify-center">
          <SheetClose
            ref={closeRef}
            aria-label="Close"
            className="relative h-[5px] w-9 rounded-full bg-muted shadow-control after:absolute after:-inset-x-4 after:-inset-y-[19.5px] after:content-[''] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
          />
        </div>
        <div className="grid h-11 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center px-2">
          {nav && depth > 0 ? (
            <button
              ref={backRef}
              type="button"
              aria-label="Back"
              className={HEADER_BUTTON}
              onClick={nav.pop}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          <SheetTitle className="grid grid-cols-[minmax(0,1fr)] text-center text-base font-medium leading-6">
            <AnimatePresence initial={false}>
              <TitleText key={key}>{title}</TitleText>
            </AnimatePresence>
          </SheetTitle>
        </div>
      </div>
      <div ref={viewportCallbackRef} className="relative flex min-h-0 flex-col overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <SheetLayer key={key} direction={direction} reduced={reduced} className={bodyClassName}>
            {children}
          </SheetLayer>
        </AnimatePresence>
      </div>
    </SheetContent>
  )
}

/**
 * A sheet's view stack. Routes are the caller's own union; `keyOf` names each
 * one for focus return (`SheetRow`'s `subview`) and for the transition. Every
 * level is its own overlay entry, so Escape and system back pop one level.
 * A fresh open starts at the root.
 */
export function useSheetStack<R>(
  overlayId: string,
  sheetOpen: boolean,
  keyOf: (route: R) => string
): SheetNav & {
  stack: readonly R[]
  top: R | null
  push: (route: R) => void
  /** Swap the top view for another at the same depth (it slides in as a push). */
  replace: (route: R) => void
  reset: () => void
  onEscapeKeyDown: (event: KeyboardEvent) => void
} {
  const [stack, setStack] = useState<readonly R[]>([])
  const [wasOpen, setWasOpen] = useState(sheetOpen)
  if (wasOpen !== sheetOpen) {
    setWasOpen(sheetOpen)
    if (sheetOpen && stack.length > 0) setStack([])
  }
  const push = useCallback((route: R) => setStack((s) => [...s, route]), [])
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const replace = useCallback((route: R) => setStack((s) => [...s.slice(0, -1), route]), [])
  const reset = useCallback(() => setStack([]), [])
  useLevelRegistrations(overlayId, sheetOpen ? stack.length : 0, pop)
  const depth = stack.length
  const onEscapeKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (depth === 0) return
      event.preventDefault()
      pop()
    },
    [depth, pop]
  )
  const keyOfRef = useRef(keyOf)
  keyOfRef.current = keyOf
  const path = useMemo(() => stack.map((route) => keyOfRef.current(route)), [stack])
  return { stack, top: stack.at(-1) ?? null, path, push, pop, replace, reset, onEscapeKeyDown }
}

/** One overlay entry per pushed level, so each system back pops one level. */
function useLevelRegistrations(overlayId: string, depth: number, pop: () => void): void {
  const popRef = useRef(pop)
  popRef.current = pop
  const registered = useRef(0)
  useEffect(() => {
    const store = useOverlayStackStore.getState()
    while (registered.current < depth) {
      registered.current += 1
      store.registerOverlay(`${overlayId}:subview:${registered.current}`, () => popRef.current())
    }
    while (registered.current > depth) {
      store.unregisterOverlay(`${overlayId}:subview:${registered.current}`)
      registered.current -= 1
    }
  }, [overlayId, depth])
  useEffect(
    () => () => {
      const store = useOverlayStackStore.getState()
      for (; registered.current > 0; registered.current -= 1) {
        store.unregisterOverlay(`${overlayId}:subview:${registered.current}`)
      }
    },
    [overlayId]
  )
}

export function SheetGroup({
  label,
  className,
  children
}: {
  label?: string
  className?: string
  children: ReactNode
}): React.JSX.Element {
  const labelId = useId()
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would give the rows form semantics
    <div role="group" aria-labelledby={label ? labelId : undefined} className={className}>
      {label ? (
        <h3
          id={labelId}
          className="flex h-7 items-end px-1 pb-1 text-sm font-normal leading-[18px] text-muted-foreground"
        >
          {label}
        </h3>
      ) : null}
      <div className={GROUP_CARD}>{children}</div>
    </div>
  )
}

/** A row's 18px icon slot (Paper "2.6d": plain icons, no well). */
export function SheetIconWell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="flex size-[18px] shrink-0 items-center justify-center text-base text-muted-foreground [&_svg]:size-[18px]"
    >
      {children}
    </span>
  )
}

type SheetRowProps = {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  value?: ReactNode
  onSelect?: () => void
  disabled?: boolean
  aside?: ReactNode
  'aria-label'?: string
  testId?: string
} & (
  | { accessory?: 'chevron'; subview?: string }
  | { accessory: 'check'; selected: boolean; role?: 'radio' }
)

/** A row with an 18px icon: the hairline above it starts at the text (44px). */
const DIVIDER_AFTER_ICON = { '--sheet-divider-inset': '44px' } as React.CSSProperties

export function SheetRow(props: SheetRowProps): React.JSX.Element {
  const {
    title,
    subtitle,
    icon,
    value,
    onSelect,
    disabled = false,
    aside,
    'aria-label': ariaLabel,
    testId
  } = props
  const check = props.accessory === 'check' ? props : null
  const subview = props.accessory === 'check' ? undefined : props.subview
  const id = useId()
  const hasValue = value !== undefined && value !== null
  const inner = (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={`${id}-title`} className={ROW_TITLE}>
          {title}
        </span>
        {subtitle ? (
          <span id={`${id}-subtitle`} className={ROW_SUBTITLE}>
            {subtitle}
          </span>
        ) : null}
      </span>
      {hasValue ? (
        <span
          id={`${id}-value`}
          className="flex max-w-[45%] shrink-0 items-center gap-1.5 truncate text-[15px] leading-5 text-muted-foreground"
        >
          {value}
        </span>
      ) : null}
      {props.accessory === 'chevron' ? (
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      ) : null}
    </>
  )
  const layout = cn(
    'flex min-w-0 flex-1 items-center gap-3 py-2 pl-3.5 pr-2.5 text-left',
    subtitle ? 'min-h-[60px]' : 'min-h-12'
  )
  const pressed = check
    ? check.role === 'radio'
      ? { 'aria-checked': check.selected }
      : { 'aria-pressed': check.selected }
    : {}
  return (
    <div
      className={cn(
        'relative flex min-w-0 items-stretch text-foreground',
        // The picked choice: the 10% fill across the whole row (its star or
        // other aside too), no tick (Paper "2.6e"/"2.6k").
        check?.selected && 'bg-foreground/10'
      )}
      style={icon ? DIVIDER_AFTER_ICON : undefined}
    >
      {onSelect ? (
        <button
          type="button"
          role={check?.role}
          aria-label={ariaLabel}
          aria-labelledby={
            ariaLabel ? undefined : hasValue ? `${id}-title ${id}-value` : `${id}-title`
          }
          aria-describedby={subtitle ? `${id}-subtitle` : undefined}
          disabled={disabled}
          onClick={onSelect}
          data-testid={testId}
          {...{ [SUBVIEW_TRIGGER_ATTR]: subview }}
          {...pressed}
          className={cn(layout, ROW_PRESS)}
        >
          {inner}
        </button>
      ) : (
        <div data-testid={testId} className={layout}>
          {inner}
        </div>
      )}
      {aside}
    </div>
  )
}

export function SheetSwitchRow({
  title,
  subtitle,
  icon,
  checked,
  disabled = false,
  onCheckedChange,
  testId
}: {
  title: string
  subtitle?: ReactNode
  icon?: ReactNode
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
  testId?: string
}): React.JSX.Element {
  const id = useId()
  return (
    <div
      className={cn(
        'relative flex items-center gap-3 py-2 pl-3.5 pr-2.5 text-foreground',
        subtitle ? 'min-h-[60px]' : 'min-h-12'
      )}
      style={icon ? DIVIDER_AFTER_ICON : undefined}
    >
      {icon}
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col">
        <span className={ROW_TITLE}>{title}</span>
        {subtitle ? <span className={ROW_SUBTITLE}>{subtitle}</span> : null}
      </label>
      <Switch
        size="ios"
        id={id}
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

/**
 * A sheet's search field. It never takes focus on its own: a focused field
 * raises the keyboard over the list.
 */
export function SheetSearchField({
  value,
  onChange,
  placeholder,
  label
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}): React.JSX.Element {
  return (
    // A well sunk into the sheet (Paper "2.6e"): the `background` fill, 44px,
    // a 16px search icon and 16px text (iOS zooms into anything smaller).
    <label className="flex h-11 w-full shrink-0 cursor-text items-center gap-2.5 rounded-xl bg-background px-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus-ring">
      <Search size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground',
          INNER_FIELD_FOCUS_CLASS
        )}
      />
    </label>
  )
}
