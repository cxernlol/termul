import { type ReactNode, useRef, useState } from 'react'
import { Star } from '@/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  type ChoiceSection,
  DENSE_ROW,
  denseRowSize,
  EDIT_ROW_BOX,
  EditableRow,
  type EditRowHandle,
  ExitingEdit,
  ROW_FOCUS,
  thinkingLabel,
  useEditMotion
} from './SelectorOptionRows'
import { StarFlip, type StarPhase } from './StarFlip'
import {
  agentInRowName,
  rowAccessibleName,
  rowHasDescription,
  rowTooltip,
  rowTooltipDescription
} from './selector-model'
import { PICKER_ROW_NAME_PULL, PICKER_ROW_SELECTED_BOX } from './selector-tokens'

export function DenseModelRow({
  name: rawName,
  tooltip,
  selected,
  glyph,
  agentId,
  agentName,
  edit,
  favorite,
  inFavorites = false,
  rowKey,
  highlighted = false,
  disabled,
  touch,
  reduced,
  onPick
}: {
  name: string
  tooltip?: string
  selected: boolean
  /** The model's own agent, as a glyph; `agentId` names that agent's config. */
  glyph: ReactNode
  agentId: string | null
  /** Another agent's model: named for screen readers; the glyph shows it. */
  agentName?: string
  /** Session options of the active model; adds the Edit button. */
  edit?: ChoiceSection[]
  /** Adds the star. `entry` marks a row in the Favorites section (for focus). */
  favorite?: { on: boolean; entry?: string; onToggle: () => void }
  /** A row in Favorites: its Edit is named apart from the list row's. */
  inFavorites?: boolean
  /** Stable across re-renders, so focus can find the row again after a pick remounts it. */
  rowKey: string
  /** The first search result while typing: Enter in search picks it. */
  highlighted?: boolean
  disabled: boolean
  touch: boolean
  /** Prefers reduced motion: Edit neither enters nor leaves, and the star does not move. */
  reduced: boolean
  onPick: () => void
}): React.JSX.Element {
  const name = rawName.trim()
  const label = rowAccessibleName({ name, agentName })
  // The tooltip's screen-reader copy: only what `label` does not already say.
  const description = rowTooltipDescription({
    agentName,
    agentInName: agentInRowName(agentName),
    details: tooltip
  })
  const editable = Boolean(edit && edit.length > 0)
  // Edit showing the level marks the selected row (its list row and its
  // Favorites copy alike); it replaces the check slot there. A selected row
  // with no level on Edit keeps the empty slot.
  const level = editable && edit !== undefined ? thinkingLabel(edit) : undefined
  const levelOnEdit = level !== undefined
  // A pick moves Edit: in on the picked row, out (inert) on the old one.
  const { entering, exiting } = useEditMotion(editable ? { level } : null, reduced)
  // With no check slot, the star's slot ends the row and the star sits flush
  // before Edit, at the row's own icon gap (3px glyph inset, Edit's 6px pad).
  const flush = favorite !== undefined && levelOnEdit
  // The star follows Edit on a pick (`StarFlip`).
  const starRef = useRef<HTMLSpanElement>(null)
  const starPhase: StarPhase = editable
    ? levelOnEdit
      ? 'level'
      : 'edit'
    : exiting
      ? 'exiting'
      : 'none'
  // The selected row is filled like the rail's active tab, on its outermost box
  // so the fill takes in the star, the check slot and Edit: the box around Edit (or
  // a leaving one), else the star's box, else the row itself.
  const outer = editable ? 'edit' : exiting ? 'exiting' : favorite ? 'favorite' : 'row'
  const fillOn = (box: typeof outer): boolean => selected && outer === box
  const fill = (box: typeof outer): { 'data-row-selected'?: '' } =>
    fillOn(box) ? { 'data-row-selected': '' } : {}
  // The search highlight looks like hover, on the same outer box.
  const highlightOn = (box: typeof outer): boolean => highlighted && !selected && outer === box
  // Controlled, so a focus handed back by the closing flyout can skip it.
  const [tipOpen, setTipOpen] = useState(false)
  const renderRow = (handle?: EditRowHandle): React.JSX.Element => {
    const quiet = (): void => {
      if (handle) handle.suppressNextTooltip.current = false
    }
    const button = (
      <button
        ref={handle?.ref}
        type="button"
        data-selector-row=""
        data-row-key={rowKey}
        data-search-highlight={highlighted ? '' : undefined}
        aria-label={label}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onPick}
        onKeyDown={handle?.onKeyDown}
        // Any real pointer or focus move ends the flyout's quiet return.
        onPointerMove={quiet}
        onPointerEnter={quiet}
        onBlur={quiet}
        // A tooltip that adds nothing to the row's name (name only, or name and
        // its agent) drops the trigger's `aria-describedby` (the row's props win
        // over the Slot's).
        {...(rowHasDescription(description) ? {} : { 'aria-describedby': undefined })}
        {...fill('row')}
        // Beside an Edit (or one leaving) the hover belongs to the box around both.
        className={cn(
          DENSE_ROW,
          denseRowSize(touch),
          (editable || favorite || exiting) && 'min-w-0 flex-1 hover:bg-transparent',
          flush && 'pr-0',
          fillOn('row') && PICKER_ROW_SELECTED_BOX,
          highlightOn('row') && 'bg-foreground/[0.06]'
        )}
      >
        <span
          data-row-agent={agentId ?? undefined}
          className="inline-flex w-4 shrink-0 justify-center"
        >
          {glyph}
        </span>
        {/* The row is named by `aria-label`; the visible text stays out of it. */}
        <span
          data-row-name=""
          aria-hidden="true"
          className={cn(PICKER_ROW_NAME_PULL, 'fade-end min-w-0 flex-1')}
        >
          {name}
        </span>
        {/* The star's slot, always reserved so nothing moves when it shows, and
            the name truncates a row gap before the star, never under it. */}
        {favorite ? (
          <span aria-hidden="true" className={cn('shrink-0', touch ? 'w-11' : 'w-5')} />
        ) : null}
        {/* The check's 14px slot stays so the star keeps its place, but it
            shows no tick: the selected fill marks the picked model. */}
        {levelOnEdit ? null : (
          <span data-row-check="" aria-hidden="true" className="size-3.5 shrink-0" />
        )}
      </button>
    )
    // Leads with the full name, which a long one truncates in the row.
    const tip = rowTooltip({ name, agentName, details: tooltip })
    const withTip = touch ? (
      button
    ) : (
      <Tooltip
        open={tipOpen}
        onOpenChange={(next) => {
          if (next && handle?.suppressNextTooltip.current) return
          setTipOpen(next)
        }}
      >
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-64 whitespace-pre-line"
          // Visual only for the name: the description skips it, so a screen
          // reader does not hear the row's name twice.
          aria-label={description}
        >
          {tip}
        </TooltipContent>
      </Tooltip>
    )
    if (!favorite) return withTip
    // The star is the row button's sibling, laid over its reserved slot
    // (right of the name, left of the check slot or flush with Edit), never nested in it.
    return (
      <div
        data-favorite-entry={favorite.entry}
        {...fill('favorite')}
        className={cn(
          'group/fav relative flex min-w-0 flex-1 rounded-md',
          // An editable row's hover already belongs to the row around Edit.
          !editable && 'transition-colors duration-150 ease-out hover:bg-foreground/[0.06]',
          fillOn('favorite') && PICKER_ROW_SELECTED_BOX,
          highlightOn('favorite') && 'bg-foreground/[0.06]'
        )}
      >
        {withTip}
        <StarButton
          boxRef={starRef}
          on={favorite.on}
          flush={flush}
          touch={touch}
          disabled={disabled}
          onClick={favorite.onToggle}
        />
      </div>
    )
  }
  return (
    <StarFlip star={starRef} phase={starPhase} reduced={reduced}>
      {!edit || !editable ? (
        // The old Edit fades out beside the plain row. The box stays mounted
        // (`contents` at rest), so the row keeps its node, and focus, when it ends.
        <div
          {...fill('exiting')}
          className={
            exiting
              ? cn(
                  EDIT_ROW_BOX,
                  fillOn('exiting') && PICKER_ROW_SELECTED_BOX,
                  highlightOn('exiting') && 'bg-foreground/[0.06]'
                )
              : 'contents'
          }
        >
          {renderRow()}
          {exiting ? <ExitingEdit face={exiting} touch={touch} /> : null}
        </div>
      ) : (
        <EditableRow
          modelName={name}
          selected={fillOn('edit')}
          inFavorites={inFavorites}
          entering={entering}
          sections={edit}
          disabled={disabled}
          touch={touch}
          renderRow={renderRow}
        />
      )}
    </StarFlip>
  )
}

/**
 * Star a model. Shows on row hover or focus, and always once starred (filled).
 * Keyboard: like Edit, a Tab stop after its row; the arrow keys move between
 * rows only. On touch, with no hover, it always shows.
 */
function StarButton({
  boxRef,
  on,
  flush,
  touch,
  disabled,
  onClick
}: {
  /** The positioned box `StarFlip` moves; the button's own fades stay its own. */
  boxRef: React.RefObject<HTMLSpanElement>
  on: boolean
  /** No check slot on the row: flush with its right edge, so with Edit. */
  flush: boolean
  touch: boolean
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <span
      ref={boxRef}
      data-star-box=""
      className={cn(
        // Else right of it: the row's 8px padding, the 14px check slot, the 8px gap.
        'absolute inset-y-0 flex',
        flush ? 'right-0' : 'right-7.5'
      )}
    >
      <button
        type="button"
        data-testid="selector-favorite"
        aria-pressed={on}
        aria-label={on ? 'Remove from favorites' : 'Add to favorites'}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex items-center justify-center rounded-md',
          'transition-[opacity,color] duration-150 ease-out motion-reduce:transition-none disabled:cursor-not-allowed',
          touch ? 'w-11' : 'w-5',
          on
            ? 'text-foreground'
            : cn(
                'text-muted-foreground hover:text-foreground',
                !touch &&
                  'opacity-0 focus-visible:opacity-100 group-focus-within/fav:opacity-100 group-hover/fav:opacity-100'
              ),
          ROW_FOCUS
        )}
      >
        <Star size={14} aria-hidden="true" className={cn(on && '[&_path]:fill-current')} />
      </button>
    </span>
  )
}
