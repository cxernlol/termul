import { createContext, forwardRef, useContext, useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Status rail: one vertical rail at the top right of the chat. Each kind of
 * chat activity (subagents, background commands, changes) is a segment of it.
 * A segment opens its own panel to its left: a popover on desktop, a bottom
 * sheet on the phone.
 */

/** What the 10px mark slot of a segment shows. No mark is `null`. */
export type StatusMarkKind = 'spinner' | 'failed' | 'new'

/** Fade out of a leaving rail or segment. */
export const RAIL_EXIT_MS = 120

const MARK_EXIT_MS = 150

const ChipSurfaceContext = createContext<'popover' | 'sheet'>('popover')

/**
 * The rail. It stays mounted once it has shown, and `shown` toggles an
 * opacity and scale transition (opacity only under reduced motion). Hidden, it
 * takes no pointer or keyboard input. It is the one child of the chat root
 * that sits above the list's top fade (z-10) and below popovers (z-50).
 */
export function StatusRail({
  shown,
  className,
  children,
  ...props
}: { shown: boolean } & Omit<React.HTMLAttributes<HTMLDivElement>, 'role'>): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={300}>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would give the rail form semantics */}
      <div
        role="group"
        aria-label="Session status"
        data-shown={shown}
        aria-hidden={shown ? undefined : true}
        {...(shown ? {} : { inert: '' })}
        className={cn(
          'absolute right-3 top-3 z-20 flex w-[60px] origin-top-right flex-col rounded-2xl bg-rail-fill p-0.5 shadow-rail',
          'transition-[opacity,scale] ease-[var(--ease-smooth-out)] motion-reduce:transition-[opacity]',
          // First show: grow in from the starting style.
          'starting:opacity-0 motion-safe:starting:scale-[0.97]',
          'data-[shown=true]:scale-100 data-[shown=true]:opacity-100 data-[shown=true]:duration-150',
          'data-[shown=false]:pointer-events-none data-[shown=false]:opacity-0 data-[shown=false]:duration-120 motion-safe:data-[shown=false]:scale-[0.97]',
          className
        )}
        {...props}
      >
        {children}
      </div>
    </TooltipProvider>
  )
}

/**
 * One segment plus its divider. Added: fades in (`@starting-style`). Removed
 * (`exiting`): leaves the layout at once, absolute at its last position, and
 * fades out; the divider goes with it. `detached` is false for the last
 * segment of a rail that is itself fading out, which stays in flow.
 */
export function StatusRailSlot({
  isFirst,
  exiting = false,
  detached = true,
  children
}: {
  isFirst: boolean
  exiting?: boolean
  detached?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [top, setTop] = useState(0)
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  // Remember the slot's place while it is in flow, for its fade out.
  useEffect(() => {
    if (node && !exiting)
      setTop((current) => (current === node.offsetTop ? current : node.offsetTop))
  })
  const out = exiting && detached
  return (
    <div
      ref={setNode}
      data-exiting={exiting ? '' : undefined}
      aria-hidden={exiting ? true : undefined}
      {...(exiting ? { inert: '' } : {})}
      style={out ? { top } : undefined}
      className={cn(
        'transition-opacity duration-150 ease-out starting:opacity-0 motion-reduce:transition-[opacity]',
        exiting && 'pointer-events-none opacity-0 duration-120',
        out && 'absolute inset-x-0.5'
      )}
    >
      {!isFirst && <StatusRailDivider />}
      {children}
    </div>
  )
}

export function StatusRailDivider(): React.JSX.Element {
  return <div aria-hidden="true" className="mx-auto my-px h-[0.5px] w-10 bg-rail-edge" />
}

/**
 * The layers of a mark slot: the current mark and, for one crossfade, the one
 * it replaced. Both are keyed by kind, so the leaving layer is the same element
 * and transitions out instead of vanishing.
 */
function useMarkLayers(kind: StatusMarkKind | null): StatusMarkKind[] {
  const [previous, setPrevious] = useState(kind)
  const [leaving, setLeaving] = useState<StatusMarkKind | null>(null)
  if (previous !== kind) {
    setPrevious(kind)
    setLeaving(previous)
  }
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(null), MARK_EXIT_MS)
    return () => clearTimeout(timer)
  }, [leaving])
  const layers: StatusMarkKind[] = []
  if (kind) layers.push(kind)
  if (leaving && leaving !== kind) layers.push(leaving)
  return layers
}

const MARK_LAYER_CLASS = cn(
  'absolute inset-0 flex items-center justify-center',
  'transition-[opacity,scale] duration-150 ease-[var(--ease-out)] motion-reduce:transition-[opacity]',
  'opacity-0 data-[active=true]:opacity-100 starting:opacity-0',
  'motion-safe:scale-90 motion-safe:data-[active=true]:scale-100 motion-safe:starting:scale-90'
)

/**
 * The 10px mark slot: a spinner (work in progress), a red dot (failed) or a
 * blue dot (new changes). A change of mark crosses over in 150ms with no
 * layout change; the blue dot also pops once when it mounts.
 */
export function StatusMark({ kind }: { kind: StatusMarkKind | null }): React.JSX.Element {
  const layers = useMarkLayers(kind)
  return (
    <span
      aria-hidden="true"
      data-mark={kind ?? 'none'}
      className={cn('relative h-2.5 shrink-0', layers.length > 0 ? 'ml-[3px] w-2.5' : 'w-0')}
    >
      {layers.map((layer) => (
        <span
          key={layer}
          data-mark-layer={layer}
          data-active={layer === kind}
          className={MARK_LAYER_CLASS}
        >
          {layer === 'spinner' && <Spinner size={10} decorative />}
          {layer === 'failed' && <span className="size-1.5 rounded-full bg-destructive" />}
          {layer === 'new' && (
            <span className="size-1.5 animate-mark-pop rounded-full bg-primary-fill motion-reduce:animate-none" />
          )}
        </span>
      ))}
    </span>
  )
}

/** Segment icon slot: muted at rest, ink on hover and while its panel is open. */
export const STATUS_RAIL_ICON_CLASS =
  'shrink-0 text-muted-foreground transition-colors duration-150 ease-out group-hover/segment:text-foreground group-data-[state=open]/segment:text-foreground motion-reduce:transition-none'

const SEGMENT_CLASS = cn(
  'group/segment relative flex h-7 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-[14px] px-1 text-2xs',
  // The fill answers hover and press (two steps up, no scale) and stays two
  // steps up with an inset edge while the panel is open.
  'transition-colors duration-150 ease-out motion-reduce:transition-none',
  'hover:bg-rail-segment-hover active:bg-rail-segment-active',
  'data-[state=open]:bg-rail-segment-active data-[state=open]:shadow-[inset_0_0_0_0.5px_var(--rail-edge)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
  // 28px segment. On touch screens an 8px margin above and below gives each
  // segment its own 44px slot, and the hit area fills that slot only, so the
  // targets of adjacent segments do not overlap.
  "after:absolute after:-inset-y-px after:inset-x-0 after:content-[''] pointer-coarse:my-2 pointer-coarse:after:-inset-y-2",
  // Three-character count ("99+"): tighter lanes so the mark stays in the rail.
  'data-[capped=true]:px-0.5'
)

/** Counts above this show as "99+" (the accessible name keeps the real number). */
export const RAIL_COUNT_CAP = 99

interface StatusRailSegmentProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name: the kind and its counts. */
  label: string
  /** Segment icon (14px, `STATUS_RAIL_ICON_CLASS`). */
  icon: React.ReactNode
  count: number
  /** Count in `text-muted-foreground`, for a figure that may be stale. */
  countMuted?: boolean
  mark: StatusMarkKind | null
}

/**
 * The trigger of a segment: icon, count and mark, centred in the fixed-width
 * segment. With no mark, the mark slot takes no room, so the icon and count
 * stay centred; a mark that appears re-centres the group.
 */
export const StatusRailSegment = forwardRef<HTMLButtonElement, StatusRailSegmentProps>(
  function StatusRailSegment(
    { label, icon, count, countMuted = false, mark, className, ...props },
    ref
  ) {
    const capped = count > RAIL_COUNT_CAP
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        data-capped={capped}
        className={cn(SEGMENT_CLASS, className)}
        {...props}
      >
        {icon}
        <span
          className={cn(
            'ml-[3px] min-w-0 tabular-nums group-data-[capped=true]/segment:tracking-[-0.03em] transition-colors duration-150 ease-out motion-reduce:transition-none',
            countMuted ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {capped ? `${RAIL_COUNT_CAP}+` : count}
        </span>
        <StatusMark kind={mark} />
      </button>
    )
  }
)

interface StatusChipProps {
  /** Accessible name of the segment: the kind and its counts. */
  label: string
  /** Tooltip words, when they differ from `label`. */
  tooltip?: string
  /** Name of the open panel (dialog). */
  panelTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Phone shell: open a bottom sheet in place of the popover. */
  sheet?: boolean
  icon: React.ReactNode
  count: number
  countMuted?: boolean
  mark: StatusMarkKind | null
  triggerRef?: React.Ref<HTMLButtonElement>
  /** Skip the focus return to the segment (focus moved on to another sheet). */
  onCloseAutoFocus?: (event: Event) => void
  /** Panel content: header, then rows. */
  children: React.ReactNode
}

/**
 * One rail segment and its panel. The panel grows from the segment (origin-
 * aware scale and fade, see the menu motion in index.css) and closes on Esc, an
 * outside click or a second click on the segment; focus goes back to it.
 */
export function StatusChip({
  label,
  tooltip,
  panelTitle,
  open,
  onOpenChange,
  sheet = false,
  icon,
  count,
  countMuted,
  mark,
  triggerRef,
  onCloseAutoFocus,
  children
}: StatusChipProps): React.JSX.Element {
  const [tipOpen, setTipOpen] = useState(false)
  // Closing the panel returns focus to the segment; that focus is not a request for the tooltip.
  const tipBlockedUntil = useRef(0)
  const button = (
    <StatusRailSegment
      ref={triggerRef}
      label={label}
      icon={icon}
      count={count}
      countMuted={countMuted}
      mark={mark}
    />
  )

  if (sheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>{button}</SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          onCloseAutoFocus={onCloseAutoFocus}
          className="flex max-h-[85dvh] flex-col gap-0 overscroll-contain bg-popover p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="flex min-h-11 items-center px-2.5 pr-10 text-sm font-semibold text-foreground">
            {panelTitle}
          </SheetTitle>
          <ChipSurfaceContext.Provider value="sheet">{children}</ChipSurfaceContext.Provider>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip
        open={tipOpen && !open}
        onOpenChange={(next) => {
          if (next && Date.now() < tipBlockedUntil.current) return
          setTipOpen(next)
        }}
      >
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8} className="px-2 py-1 text-2xs">
          {tooltip ?? label}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        aria-label={panelTitle}
        onCloseAutoFocus={(event) => {
          tipBlockedUntil.current = Date.now() + 150
          onCloseAutoFocus?.(event)
        }}
        // The menu motion in index.css: the panel grows from the segment.
        className="w-[min(24rem,calc(100vw-2rem))] rounded-[10px] border-[0.5px] p-1 shadow-menu data-[state=open]:zoom-in-[var(--scale-medium)] data-[state=closed]:zoom-out-[var(--scale-tiny)]"
      >
        <ChipSurfaceContext.Provider value="popover">{children}</ChipSurfaceContext.Provider>
      </PopoverContent>
    </Popover>
  )
}

/** Panel header: a muted summary on the left, actions on the right. */
export function StatusChipPanelHeader({
  children,
  actions
}: {
  children: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  const surface = useContext(ChipSurfaceContext)
  return (
    <div
      className={cn(
        'flex min-h-8 shrink-0 items-center gap-2 px-2.5 text-2xs text-muted-foreground',
        surface === 'sheet' && 'pb-1'
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {actions}
    </div>
  )
}

/** Muted note under the header or the rows. */
export function StatusChipPanelNote({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return <p className="px-2.5 pb-1 pt-1 text-2xs text-muted-foreground">{children}</p>
}
