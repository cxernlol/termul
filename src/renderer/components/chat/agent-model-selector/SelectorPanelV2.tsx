import { motion, useReducedMotion } from 'framer-motion'
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { toast } from 'sonner'
import { MoreHorizontal, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { BAND_FOCUS_CLASS, INNER_FIELD_FOCUS_CLASS } from '@/components/ui/panel-styles'
import { logFrontendError } from '@/lib/log-api'
import { cn } from '@/lib/utils'
import { flattenConfigOptionValues } from '../chat-input-bar-config'
import { DenseModelRow } from './DenseModelRow'
import {
  type FavoriteKey,
  type FavoritesStore,
  favoriteId,
  optionsSignature,
  useFavoriteModels,
  useFavoritesStore
} from './favorite-models'
import {
  type ChoiceSection,
  moveFocus,
  OptionRow,
  OptionSwitchRow,
  ROW_FOCUS
} from './SelectorOptionRows'
import type { SelectorPanelProps } from './SelectorPanel'
import {
  AgentRow,
  BusyBlock,
  ContextSummary,
  Hint,
  InstallState,
  ListMessage,
  StatusActions,
  TabGlyph
} from './SelectorRows'
import { OtherAgentSignIn } from './SignInActions'
import {
  AGENT_TRACK_CLASS,
  type AgentTab,
  agentTrackCapacity,
  type CatalogModel,
  entryDisableReason,
  favoriteRowName,
  type ModelCatalog,
  splitContextOption
} from './selector-model'
import { PICKER_LABEL, PICKER_ROW_SELECTED } from './selector-tokens'
import { editSections, restSections } from './session-option-sections'
import { useRejectedOptionValues } from './use-option-values'
import { type FavoriteHit, useSelectorPanelState } from './use-selector-panel-state'

const LIST_ROW = '[data-selector-row]'
/** Key prefix of the Favorites section's rows (the same model shows again below). */
const FAVORITES_PREFIX = 'favorite\0'

/** A favorite as a DOM attribute value (ids hold `:`, `/` and maybe more). */
function favoriteEntryId(key: FavoriteKey): string {
  const signature = optionsSignature(key.options)
  return `${encodeURIComponent(key.configId)}/${encodeURIComponent(key.modelId)}${signature ? `/${encodeURIComponent(signature)}` : ''}`
}

/** A row's `data-row-key`: a Favorites copy (one per snapshot) apart from the list row. */
function rowKeyOf(configId: string | null, modelId: string, favorite?: FavoriteKey): string {
  return favorite
    ? `favorite/${favoriteEntryId(favorite)}`
    : `${encodeURIComponent(configId ?? '')}/${encodeURIComponent(modelId)}`
}

/** An agent row's highlight key (search results list agents after models). */
function agentRowKey(tab: AgentTab | undefined): string | null {
  return tab ? `agent\0${encodeURIComponent(tab.configId)}` : null
}

/** The Favorites section's rows, top to bottom. */
function favoriteEntries(list: HTMLElement | null): HTMLElement[] {
  return Array.from(list?.querySelectorAll<HTMLElement>('[data-favorite-entry]') ?? [])
}
/** `--ease-smooth-out`; framer needs the curve itself, not the variable. */
const EASE_OUT = [0.22, 1, 0.36, 1] as const
const quick = (reduced: boolean) => ({ duration: reduced ? 0 : 0.15, ease: EASE_OUT })

export interface SelectorPanelV2Props extends SelectorPanelProps {
  /**
   * Where starred models live. Defaults to the app store (localStorage today,
   * the backend later); the panel only reads `list` and calls `set`.
   */
  favoritesStore?: FavoritesStore
  /** Where the agent tabs sit: a strip under search, or a rail left of the list. */
  agentRail?: 'top' | 'left'
}

function SectionLabel({ id, children }: { id?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div id={id} className={PICKER_LABEL}>
      {children}
    </div>
  )
}

interface TabItem {
  key: string
  label: string
  glyph: ReactNode
  selected: boolean
  title: string
  onSelect: () => void
}

const TAB_KEYS = {
  horizontal: { next: 'ArrowRight', prev: 'ArrowLeft' },
  vertical: { next: 'ArrowDown', prev: 'ArrowUp' }
} as const

/**
 * Agent tabs as glyphs. Horizontal: a strip over a hairline, the active tab
 * underlined. Vertical: a rail left of the list, the active tab filled. The
 * mark slides between tabs. Tabs pattern: one tab stop
 * (the selected tab); the arrow keys of the orientation, Home and End move
 * focus, Enter or Space selects. With `followFocus` the arrows select too.
 */
function AgentTabStrip({
  id,
  items,
  orientation,
  followFocus,
  disabled,
  touch,
  reduced
}: {
  id: string
  items: TabItem[]
  orientation: 'horizontal' | 'vertical'
  followFocus: boolean
  disabled: boolean
  touch: boolean
  reduced: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const vertical = orientation === 'vertical'
  // One tab stop: the selected tab, or the first when none is selected.
  const stop = Math.max(
    items.findIndex((item) => item.selected),
    0
  )
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])
    const index = tabs.indexOf(document.activeElement as HTMLElement)
    if (index < 0) return
    const last = tabs.length - 1
    const keys = TAB_KEYS[orientation]
    const next =
      event.key === keys.next
        ? index === last
          ? 0
          : index + 1
        : event.key === keys.prev
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next == null) return
    event.preventDefault()
    tabs[next]?.focus()
    if (followFocus) items[next]?.onSelect()
  }
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Agents"
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      className={cn(
        'flex',
        vertical
          ? // `box-content`: the hairline sits outside the 40px (56px touch) column,
            // so a 28px (44px) tab has 6px on each side and its centre is the rail's.
            cn(
              'box-content shrink-0 flex-col items-center border-r border-border',
              AGENT_TRACK_CLASS.railPadding,
              touch ? 'w-14' : 'w-10'
            )
          : cn('border-b-[0.5px] border-border', touch ? 'px-3' : 'px-1')
      )}
    >
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.selected}
          aria-label={item.label}
          title={item.title}
          tabIndex={index === stop ? 0 : -1}
          disabled={disabled}
          data-testid={`agent-tab-${item.key}`}
          onClick={item.onSelect}
          className={cn(
            'relative flex items-center justify-center transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60',
            vertical
              ? // A square as tall as a list row (28px), so each icon sits on the
                // list's row grid; 6px radius like the rows.
                cn('rounded-md', touch ? AGENT_TRACK_CLASS.railTabTouch : AGENT_TRACK_CLASS.railTab)
              : cn('flex-1 rounded-t-md', touch ? 'h-11' : 'h-8'),
            // Icons keep their colour (brand or foreground); state reads from
            // the icon's opacity, as the active fill alone is too faint.
            'group/tab text-foreground',
            !item.selected && (vertical ? 'hover:bg-foreground/5' : 'hover:bg-foreground/[0.06]'),
            ROW_FOCUS
          )}
        >
          {item.selected ? (
            <motion.span
              layoutId={`${id}-indicator`}
              aria-hidden="true"
              transition={quick(reduced)}
              className={cn(
                'pointer-events-none absolute',
                // Rail: the popover's active-segment fill (docs/design/colors.md)
                // filling the tab. Top strip: a bar under the tab.
                vertical
                  ? cn('inset-0 rounded-md', PICKER_ROW_SELECTED)
                  : 'inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground'
              )}
            />
          ) : null}
          <span
            data-tab-glyph=""
            className={cn(
              'relative inline-flex transition-opacity duration-150 ease-out motion-reduce:transition-none',
              item.selected ? 'opacity-100' : 'opacity-55 group-hover/tab:opacity-80'
            )}
          >
            {item.glyph}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * The panel's width while `active` (the touch top strip, whose sheet width
 * varies); null before the first measure or without ResizeObserver.
 */
function useTouchStripWidth(
  ref: React.RefObject<HTMLDivElement | null>,
  active: boolean
): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const node = ref.current
    if (!active || !node || typeof ResizeObserver === 'undefined') return
    const measure = (): void => {
      const next = Math.round(node.getBoundingClientRect().width)
      setWidth(next > 0 ? next : null)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, active])
  return active ? width : null
}

/**
 * Scroll the chosen model into view, then round the scroll up to a whole row so
 * the top row is never cut in half. Rows and section labels share one height,
 * and the list is ten rows tall plus its padding, so a multiple of the row
 * height shows ten whole rows. Rounding up only moves the chosen row (at the
 * bottom edge) further in.
 */
function revealChosenRow(list: HTMLElement): void {
  const chosen = list.querySelectorAll<HTMLElement>(`${LIST_ROW}[aria-pressed="true"]`)
  const row = chosen[chosen.length - 1]
  if (!row) return
  row.scrollIntoView?.({ block: 'nearest' }) // jsdom has none
  const height = row.offsetHeight
  if (height > 0 && list.scrollTop > 0) {
    list.scrollTop = Math.ceil(list.scrollTop / height) * height
  }
}

/**
 * The footer's session option rows: the agent's options other than the
 * active model's own, which always open from its Edit.
 */
function SessionOptions({
  sections,
  disabled,
  touch
}: {
  sections: ChoiceSection[]
  disabled: boolean
  touch: boolean
}): React.JSX.Element | null {
  const ref = useRef<HTMLFieldSetElement>(null)
  if (sections.length === 0) return null
  return (
    <fieldset
      ref={ref}
      aria-label="Session options"
      data-testid="selector-options"
      onKeyDown={(event) => {
        moveFocus(event, ref.current, '[data-option-row]')
      }}
      className={cn(
        'flex min-w-0 flex-col border-t-[0.5px] border-border',
        touch ? 'px-3 py-1.5' : 'p-1'
      )}
    >
      {sections.map((section) =>
        section.kind === 'toggle' ? (
          <OptionSwitchRow
            key={section.id}
            id={section.id}
            label={section.label}
            icon={section.icon}
            checked={section.checked}
            disabled={disabled}
            touch={touch}
            onToggle={section.onToggle}
          />
        ) : (
          <OptionRow
            key={section.id}
            id={section.id}
            label={section.label}
            value={section.value}
            choices={section.choices}
            disabled={disabled}
            touch={touch}
            onSelect={section.onPick}
          />
        )
      )}
    </fieldset>
  )
}

/**
 * Model picker v2: the same state as `SelectorPanel` (one hook) in a denser
 * layout. Glyph tabs with an underline, a Favorites section, 28px rows, and
 * an Edit flyout on the active model for Thinking, Context and Fast mode.
 * Visual direction after volt (MIT, github.com/LeulAria/volt), on Troupe
 * tokens.
 */
export function SelectorPanelV2(props: SelectorPanelV2Props): React.JSX.Element {
  const { source: sw, touch, disabled, modelValue, agentRail = 'top' } = props
  const reduced = useReducedMotion() ?? false
  const rootRef = useRef<HTMLDivElement>(null)
  const width = useTouchStripWidth(rootRef, touch && agentRail === 'top')
  const appStore = useFavoritesStore()
  const favoritesStore = props.favoritesStore ?? appStore
  const favorites = useFavoriteModels(favoritesStore)
  const state = useSelectorPanelState(props, {
    reserveMoreTab: false,
    stableTabCapacity: agentTrackCapacity({ rail: agentRail, touch, width }),
    favorites
  })
  const { query, searching, showingMore, effectiveId, viewId, viewTab, tabs, view } = state
  const { effectiveCatalog, capabilities, nameOf, tabOf } = state
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const favoritesLabelId = useId()

  const { isRejected, trySet } = useRejectedOptionValues(
    effectiveId,
    props.genericOptions,
    props.onSetConfig
  )
  const { context, rest } = splitContextOption(props.genericOptions)
  const edit = editSections(props, context, isRejected, trySet)
  // The Edit flyout hangs off the active model's row. With no such row on
  // screen (no model list, or a value outside it) the model is pinned under
  // the Context row with its own Edit, so Thinking, Context and Fast mode
  // always open from the picked model.
  const activeShown =
    modelValue !== undefined &&
    (view.kind === 'effective'
      ? Boolean(view.catalog?.options.some((m) => m.value === modelValue))
      : view.kind === 'search' && view.own.some((m) => m.value === modelValue))
  // The pinned row's name: the model's own name, else the agent's.
  const pinnedName =
    (modelValue !== undefined && props.modelOption
      ? flattenConfigOptionValues(props.modelOption).find((m) => m.value === modelValue)?.name
      : undefined) ?? nameOf(effectiveId)
  const pinnedTab = tabOf(effectiveId)

  const [searchFocused, setSearchFocused] = useState(false)
  // Command palette: while typing, the first result is highlighted and Enter
  // in search picks it. Hover never moves it; ArrowDown moves real focus.
  const highlightKey =
    view.kind === 'search' && searchFocused && !disabled
      ? view.own[0]
        ? rowKeyOf(effectiveId, view.own[0].value)
        : view.others[0]
          ? rowKeyOf(view.others[0].configId, view.others[0].model.value)
          : agentRowKey(view.agents.find((tab) => !state.notSetUp(tab)))
      : null

  // Screen readers hear which result Enter picks while search has focus.
  const [highlightName, setHighlightName] = useState('')
  useEffect(() => {
    if (highlightKey === null) {
      setHighlightName('')
      return
    }
    const row = listRef.current?.querySelector<HTMLElement>('[data-search-highlight]')
    setHighlightName(row?.getAttribute('aria-label') ?? row?.textContent?.trim() ?? '')
  }, [highlightKey])

  /** The row a keyboard pick came from: a pick can remount it, so focus goes back to it. */
  const pickedRow = useRef<string | null>(null)
  // Before paint, so focus never stays on body. Kept until focus moves on:
  // the selected model can arrive after the pick.
  useLayoutEffect(() => {
    const key = pickedRow.current
    if (key === null) return
    const active = document.activeElement
    if (active && active !== document.body) return
    const row = Array.from(listRef.current?.querySelectorAll<HTMLElement>(LIST_ROW) ?? []).find(
      (el) => el.dataset.rowKey === key
    )
    row?.focus()
  })

  const starred = new Set(favorites.map(favoriteId))
  /** After unstarring from Favorites: the favorite row to focus next (null: none left). */
  const refocus = useRef<{ next: string | null } | null>(null)
  const toggleFavorite = (key: FavoriteKey, fromFavorites: boolean): void => {
    const id = favoriteId(key)
    const on = !starred.has(id)
    if (!on && fromFavorites) {
      const entries = favoriteEntries(listRef.current).map((el) => el.dataset.favoriteEntry)
      const at = entries.indexOf(favoriteEntryId(key))
      refocus.current = { next: entries[at + 1] ?? entries[at - 1] ?? null }
    }
    favoritesStore.set(key, on).catch((error: unknown) => {
      toast.error('Could not update favorites.')
      void logFrontendError({
        level: 'warn',
        source: 'SelectorPanelV2.favorites',
        message: `Failed to ${on ? 'add' : 'remove'} favorite ${key.configId}/${key.modelId}: ${String(error)}`
      })
    })
  }
  // The unstarred row has left the Favorites section: focus its neighbour,
  // else the first row, else search. Before paint, so focus never drops to body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the favorites list commits; the ref carries the target
  useLayoutEffect(() => {
    const pending = refocus.current
    if (!pending) return
    refocus.current = null
    const list = listRef.current
    const next = favoriteEntries(list).find((el) => el.dataset.favoriteEntry === pending.next)
    const target =
      next?.querySelector<HTMLElement>(LIST_ROW) ??
      list?.querySelector<HTMLElement>(LIST_ROW) ??
      searchRef.current
    target?.focus()
  }, [favorites])

  const rows = (
    configId: string | null,
    catalog: ModelCatalog | null,
    options: CatalogModel[],
    selectedValue: string | undefined,
    /** Rows from several agents: another agent's row says whose it is. */
    mixed: boolean,
    /** A Favorites row: its own key and snapshot, picked with the model. */
    fav?: FavoriteHit
  ): ReactNode => {
    // The row's own agent, never the open tab: Favorites and search mix agents.
    const tab = tabOf(configId)
    const inFavorites = fav !== undefined
    return options.map((model) => {
      const key = fav?.favorite ?? (configId ? state.favoriteKeyFor(configId, model.value) : null)
      const rowKey = rowKeyOf(configId, model.value, fav?.favorite)
      return (
        <DenseModelRow
          key={
            fav ? `${FAVORITES_PREFIX}${favoriteId(fav.favorite)}` : `${configId}\0${model.value}`
          }
          name={fav ? favoriteRowName(model.name, fav.label) : model.name}
          tooltip={
            [model.description, configId === sw.currentConfigId ? capabilities : null]
              .filter(Boolean)
              .join('\n\n') || undefined
          }
          selected={model.value === selectedValue}
          glyph={tab ? <TabGlyph tab={tab} /> : null}
          agentId={configId}
          agentName={mixed && configId !== effectiveId ? tab?.name : undefined}
          // Only the active model has session options. Each of its rows (the list
          // row, its Favorites copy) gets the same Edit over that one session state.
          edit={configId === effectiveId && model.value === selectedValue ? edit : undefined}
          inFavorites={inFavorites}
          rowKey={rowKey}
          highlighted={rowKey === highlightKey}
          favorite={
            key
              ? {
                  on: starred.has(favoriteId(key)),
                  entry: inFavorites ? favoriteEntryId(key) : undefined,
                  onToggle: () => toggleFavorite(key, inFavorites)
                }
              : undefined
          }
          disabled={disabled}
          touch={touch}
          reduced={reduced}
          onPick={() => {
            const active = document.activeElement as HTMLElement | null
            if (active?.dataset.rowKey === rowKey) pickedRow.current = rowKey
            state.pick(configId, catalog, model.value, fav?.favorite.options)
          }}
        />
      )
    })
  }

  const agentRow = (tab: AgentTab, key: string, onPick: () => void): React.JSX.Element => (
    <AgentRow
      key={key}
      tab={tab}
      badge={state.badgeOf(tab)}
      highlighted={agentRowKey(tab) === highlightKey}
      disabled={disabled || state.notSetUp(tab)}
      touch={touch}
      onPick={onPick}
    />
  )

  let body: ReactNode
  switch (view.kind) {
    case 'search':
      body =
        view.count === 0 ? (
          <ListMessage title="No models or agents match." detail="Try another name." />
        ) : (
          <>
            {rows(effectiveId, effectiveCatalog, view.own, modelValue, true)}
            {view.others.map(({ configId, catalog, model }) =>
              rows(configId, catalog, [model], undefined, true)
            )}
            {view.agents.map((tab) =>
              agentRow(tab, `agent\0${tab.configId}`, () => {
                state.setQuery('')
                state.openAgent(tab)
              })
            )}
          </>
        )
      break
    case 'more':
      body = view.tabs.map((tab) => agentRow(tab, tab.configId, () => state.openAgent(tab)))
      break
    case 'install':
      body = (
        <InstallState
          tab={view.tab}
          reason={entryDisableReason(view.entry)}
          installing={view.installing}
          installBlocked={view.installBlocked}
          touch={touch}
          onInstall={view.install}
        />
      )
      break
    case 'effective':
      body = view.catalog ? (
        <>
          {view.favorites.length > 0 ? (
            <>
              {/* A named group: a screen reader tells the copy's Edit from the list row's. */}
              {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would give model rows form semantics and min-content sizing */}
              <div role="group" aria-labelledby={favoritesLabelId}>
                <SectionLabel id={favoritesLabelId}>Favorites</SectionLabel>
                {view.favorites.map((favorite) =>
                  rows(
                    favorite.configId,
                    favorite.catalog,
                    [favorite.model],
                    favorite.active ? modelValue : undefined,
                    true,
                    favorite
                  )
                )}
              </div>
              <SectionLabel>{viewTab?.name ?? 'Models'}</SectionLabel>
            </>
          ) : null}
          {rows(effectiveId, view.catalog, view.catalog.options, modelValue, false)}
          {view.stale?.error ? (
            <StatusActions
              title={`${view.stale.error.label}. These models are from the last session.`}
              detail={view.stale.error.detail}
              status={view.stale}
              touch={touch}
              compact
            />
          ) : null}
        </>
      ) : (
        <ListMessage
          title="This agent gives no model choice."
          detail={effectiveId === sw.currentConfigId ? (capabilities ?? undefined) : undefined}
        />
      )
      break
    case 'current':
      body = (
        <>
          {view.catalog ? (
            rows(viewId, view.catalog, view.catalog.options, undefined, false)
          ) : (
            <ListMessage
              title={`${nameOf(viewId)} gives no model choice.`}
              detail={capabilities ?? undefined}
            />
          )}
          <Hint>{`Keeps ${nameOf(viewId)} and cancels the switch to ${nameOf(sw.armedConfigId)}.`}</Hint>
        </>
      )
      break
    case 'other':
      body = (
        <>
          {rows(viewId, view.catalog, view.catalog.options, undefined, false)}
          {view.confirming ? (
            <BusyBlock
              agentName={nameOf(sw.currentConfigId)}
              canCancel={sw.turnBusy}
              touch={touch}
              onWait={state.waitForTurn}
              onCancelAndSwitch={state.cancelAndSwitch}
            />
          ) : (
            <Hint>{`Switches to ${nameOf(viewId)} on the next send.`}</Hint>
          )}
        </>
      )
      break
    case 'error':
      body = view.status ? (
        <StatusActions title={view.title} detail={view.detail} status={view.status} touch={touch} />
      ) : (
        <div className="flex flex-col gap-1">
          <ListMessage title={view.title} detail={view.detail} />
          {view.signInTab && view.retry ? (
            <OtherAgentSignIn
              key={view.signInTab.configId}
              tab={view.signInTab}
              workspace={sw.workspace}
              retry={view.retry}
              disabled={disabled}
              touch={touch}
            />
          ) : view.retry ? (
            <div className="flex px-1">
              <Button
                type="button"
                variant="secondary"
                size={touch ? 'touch' : 'xs'}
                onClick={view.retry}
                className="min-w-0 flex-1"
              >
                Try again
              </Button>
            </div>
          ) : null}
        </div>
      )
      break
    case 'loading':
      body = <ListMessage loading title={view.title} />
      break
  }

  const tabItems: TabItem[] = tabs.visible.map((tab) => ({
    key: tab.configId,
    label: tab.name,
    glyph: <TabGlyph tab={tab} colorClassName="text-current" />,
    selected: !showingMore && tab.configId === viewId,
    title: state.hasUpdate(tab) ? `${tab.name} · update available` : tab.name,
    onSelect: () => state.openAgent(tab)
  }))
  if (tabs.overflow.length > 0) {
    tabItems.push({
      key: 'more',
      label: 'More agents',
      glyph: <MoreHorizontal size={16} aria-hidden="true" />,
      // Order is stable, so an agent behind "More" stays there; "More" shows
      // as active while that agent's models are open.
      selected: showingMore || state.viewInOverflow,
      title: 'More agents',
      onSelect: state.showMore
    })
  }
  const showTabs = !searching && tabItems.length > 1
  const tabStrip = (orientation: 'horizontal' | 'vertical'): React.JSX.Element => (
    <AgentTabStrip
      id={`agent-tabs-${sw.key}`}
      items={tabItems}
      orientation={orientation}
      // A tab in the launcher picks the agent; in chat it only opens its models.
      followFocus={sw.selectAgent == null}
      disabled={disabled}
      touch={touch}
      reduced={reduced}
    />
  )

  // The list remounts per view (`key`), so this runs once per view: open on
  // the chosen model even when it sits below the fold.
  const attachList = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node
    if (node) revealChosenRow(node)
  }, [])

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      const target = listRef.current?.querySelector<HTMLElement>('[data-search-highlight]')
      if (!target) return
      event.preventDefault()
      target.click()
      return
    }
    if (event.key !== 'ArrowDown') return
    const first = Array.from(listRef.current?.querySelectorAll<HTMLElement>(LIST_ROW) ?? []).find(
      (row) => !row.hasAttribute('disabled')
    )
    if (!first) return
    event.preventDefault()
    first.focus()
  }
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const first = listRef.current?.querySelector<HTMLElement>(LIST_ROW)
    if (event.key === 'ArrowUp' && document.activeElement === first) {
      event.preventDefault()
      searchRef.current?.focus()
      return
    }
    moveFocus(event, listRef.current, LIST_ROW)
  }

  const pad = touch ? 'px-3' : 'px-1'
  const otherHint = state.otherHintTab
    ? `Choose a model to set Thinking and Fast mode for ${state.otherHintTab.name}.`
    : null

  return (
    <div
      ref={rootRef}
      data-testid="agent-model-selector-panel"
      data-variant="v2"
      data-agent-rail={agentRail}
      // Left rail: the 300px list plus the 40px rail and its 1px hairline.
      className={cn(
        'flex min-h-0 flex-col',
        !touch && (agentRail === 'left' ? 'w-[341px]' : 'w-75')
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 border-b-[0.5px] border-border transition-colors duration-150 ease-out',
          BAND_FOCUS_CLASS,
          // With the rail, the 14px icon sits on the rail's centre line (20px in);
          // on touch px-5 already centres the 16px icon on the 56px rail.
          touch ? 'h-12 px-5' : cn('h-9 pr-3', agentRail === 'left' ? 'pl-3.25' : 'pl-3')
        )}
      >
        <Search
          size={touch ? 16 : 14}
          aria-hidden="true"
          className="shrink-0 text-muted-foreground"
        />
        <input
          ref={searchRef}
          // biome-ignore lint/a11y/noAutofocus: the selector opens to search, like a command list
          autoFocus={!touch}
          value={query}
          onChange={(event) => state.setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          onFocus={() => {
            pickedRow.current = null
            setSearchFocused(true)
          }}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search models…"
          aria-label="Search models and agents"
          className={cn(
            `min-w-0 flex-1 bg-transparent text-foreground placeholder:text-muted-foreground ${INNER_FIELD_FOCUS_CLASS}`,
            touch ? 'text-base' : 'text-xs'
          )}
        />
        {view.kind === 'search' ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{view.count}</span>
        ) : null}
        <span
          role="status"
          aria-live="polite"
          data-testid="selector-search-announce"
          className="sr-only"
        >
          {highlightName ? `Enter picks ${highlightName}` : ''}
        </span>
      </div>
      {showTabs && agentRail === 'top' ? tabStrip('horizontal') : null}
      <div className="flex min-h-0">
        {showTabs && agentRail === 'left' ? tabStrip('vertical') : null}
        <motion.div
          ref={attachList}
          key={state.listKey}
          role={showTabs ? 'tabpanel' : undefined}
          aria-label={showTabs ? (showingMore ? 'More agents' : viewTab?.name) : undefined}
          data-testid="selector-list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={quick(reduced)}
          onKeyDown={onListKeyDown}
          // Focus moved on to another row: no pick to return to.
          onFocus={(event) => {
            if ((event.target as HTMLElement).dataset.rowKey !== pickedRow.current) {
              pickedRow.current = null
            }
          }}
          className={cn(
            AGENT_TRACK_CLASS.listMaxHeight,
            // Rows truncate inside it; overflow-x-hidden only backs that up.
            'min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain',
            pad,
            'py-1'
          )}
        >
          {body}
        </motion.div>
      </div>
      {!searching && state.contextUsage ? (
        <>
          <div className="h-[0.5px] bg-border" />
          <ContextSummary usage={state.contextUsage} touch={touch} />
        </>
      ) : null}
      {state.ownFooter && !activeShown && edit.length > 0 ? (
        <div data-testid="selector-pinned-model" className={cn('flex min-w-0 flex-col pb-1', pad)}>
          <SectionLabel>Current model</SectionLabel>
          {/* Already the picked model: no star, and a pick does nothing. */}
          <DenseModelRow
            name={pinnedName}
            tooltip={effectiveId === sw.currentConfigId ? capabilities || undefined : undefined}
            selected
            glyph={pinnedTab ? <TabGlyph tab={pinnedTab} /> : null}
            agentId={effectiveId}
            edit={edit}
            inFavorites={false}
            rowKey={rowKeyOf(effectiveId, modelValue ?? '')}
            highlighted={rowKeyOf(effectiveId, modelValue ?? '') === highlightKey}
            disabled={disabled}
            touch={touch}
            reduced={reduced}
            onPick={() => undefined}
          />
        </div>
      ) : null}
      {state.ownFooter ? (
        <SessionOptions
          sections={restSections(rest, isRejected, trySet)}
          disabled={disabled}
          touch={touch}
        />
      ) : null}
      {otherHint ? (
        <p
          className={cn(
            'flex items-center border-t-[0.5px] border-border text-xs text-muted-foreground',
            touch ? 'min-h-12 px-5' : 'min-h-9 px-3'
          )}
        >
          {otherHint}
        </p>
      ) : null}
    </div>
  )
}
