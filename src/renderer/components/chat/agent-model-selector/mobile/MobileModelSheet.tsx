import { type ReactNode, useEffect } from 'react'
import { toast } from 'sonner'
import { Star } from '@/components/icons'
import {
  MobileSheetContent,
  SheetGroup,
  SheetRow,
  SheetSearchField,
  useSheetStack
} from '@/components/ui/mobile-sheet'
import { SheetDescription } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { logFrontendError } from '@/lib/log-api'
import { cn } from '@/lib/utils'
import { useSettingsModalStore } from '@/stores/settings-modal-store'
import {
  type FavoriteKey,
  type FavoritesStore,
  favoriteId,
  useFavoriteModels,
  useFavoritesStore
} from '../favorite-models'
import type { SelectorPanelProps } from '../SelectorPanel'
import {
  BusyBlock,
  Hint,
  InstallState,
  ListMessage,
  StatusActions,
  TabGlyph
} from '../SelectorRows'
import {
  type AgentTab,
  type CatalogModel,
  entryDisableReason,
  favoriteRowName,
  isInstalledTab,
  type ModelCatalog,
  rowAccessibleName,
  splitContextOption
} from '../selector-model'
import { editSections, restSections } from '../session-option-sections'
import { useRejectedOptionValues } from '../use-option-values'
import { type FavoriteHit, useSelectorPanelState } from '../use-selector-panel-state'
import { installRouteKey, PROVIDERS_ROUTE_KEY, ProviderList } from './MobileProviderList'
import { ProviderSetupScreen, setupRouteKey } from './MobileProviderSetup'
import {
  ChoiceList,
  type ModeControl,
  OptionsCard,
  optionRouteKey,
  sheetOptions
} from './MobileSheetOptions'
import { type CompactControl, UsageCard } from './MobileUsageCard'

const SEARCH_THRESHOLD = 12

/** The views pushed above the sheet's model list. */
type SheetRoute =
  | { kind: 'providers' }
  | { kind: 'install'; configId: string }
  | { kind: 'setup'; configId: string }
  | { kind: 'option'; id: string }

function routeKey(route: SheetRoute): string {
  switch (route.kind) {
    case 'providers':
      return PROVIDERS_ROUTE_KEY
    case 'install':
      return installRouteKey(route.configId)
    case 'setup':
      return setupRouteKey(route.configId)
    case 'option':
      return optionRouteKey(route.id)
  }
}

export interface MobileModelSheetProps extends SelectorPanelProps {
  sessionId: string
  open: boolean
  overlayId: string
  mode: ModeControl | null
  compact: CompactControl | null
  claudeProjectId: string | null
  favoritesStore?: FavoritesStore
  onCloseAutoFocus?: (event: Event) => void
}

function StarToggle({
  on,
  disabled,
  onToggle
}: {
  on: boolean
  disabled: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Remove from favorites' : 'Add to favorites'}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex w-11 shrink-0 items-center justify-center transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring disabled:cursor-not-allowed',
        on ? 'text-foreground' : 'text-muted-foreground/60'
      )}
    >
      <Star size={16} aria-hidden="true" className={cn(on && '[&_path]:fill-current')} />
    </button>
  )
}

export function MobileModelSheet(props: MobileModelSheetProps): React.JSX.Element {
  const { source: sw, disabled, modelValue, escapeRef } = props
  const appStore = useFavoritesStore()
  const favoritesStore = props.favoritesStore ?? appStore
  const favorites = useFavoriteModels(favoritesStore)
  const state = useSelectorPanelState(props, {
    reserveMoreTab: false,
    stableTabCapacity: Number.POSITIVE_INFINITY,
    favorites
  })
  const { view, effectiveId, tabOf, nameOf } = state
  const nav = useSheetStack<SheetRoute>(props.overlayId, props.open, routeKey)
  const { isRejected, trySet } = useRejectedOptionValues(
    effectiveId,
    props.genericOptions,
    props.onSetConfig
  )
  const { context, rest } = splitContextOption(props.genericOptions)
  const options = sheetOptions(
    editSections(props, context, isRejected, trySet),
    restSections(rest, isRejected, trySet),
    props.mode
  )
  const top = nav.top
  const openOption =
    top?.kind === 'option' ? options.find((option) => option.id === top.id) : undefined

  const starred = new Set(favorites.map(favoriteId))
  const toggleFavorite = (key: FavoriteKey): void => {
    const id = favoriteId(key)
    const on = !starred.has(id)
    favoritesStore.set(key, on).catch((error: unknown) => {
      toast.error('Could not update favorites.')
      void logFrontendError({
        level: 'warn',
        source: 'MobileModelSheet.favorites',
        message: `Failed to ${on ? 'add' : 'remove'} favorite ${key.configId}/${key.modelId}: ${String(error)}`
      })
    })
  }

  const modelRows = (
    configId: string | null,
    catalog: ModelCatalog | null,
    models: readonly CatalogModel[],
    selectedValue: string | undefined,
    showAgent: boolean,
    /** A Favorites row: its own key and snapshot, picked with the model. */
    fav?: FavoriteHit
  ): ReactNode =>
    models.map((model) => {
      const tab = tabOf(configId)
      const key = fav?.favorite ?? (configId ? state.favoriteKeyFor(configId, model.value) : null)
      const agentName = showAgent && configId !== effectiveId ? tab?.name : undefined
      const title = fav ? favoriteRowName(model.name, fav.label) : model.name.trim()
      return (
        <SheetRow
          key={fav ? `favorite\0${favoriteId(fav.favorite)}` : `${configId}\0${model.value}`}
          icon={showAgent && tab ? <TabGlyph tab={tab} /> : undefined}
          title={title}
          subtitle={model.description || undefined}
          aria-label={agentName ? rowAccessibleName({ name: title, agentName }) : undefined}
          accessory="check"
          selected={model.value === selectedValue}
          disabled={disabled}
          onSelect={() => state.pick(configId, catalog, model.value, fav?.favorite.options)}
          aside={
            key ? (
              <StarToggle
                on={starred.has(favoriteId(key))}
                disabled={disabled}
                onToggle={() => toggleFavorite(key)}
              />
            ) : undefined
          }
        />
      )
    })

  const agentRows = (tabs: readonly AgentTab[], onPick: (tab: AgentTab) => void): ReactNode =>
    tabs.map((tab) => (
      <SheetRow
        key={`agent\0${tab.configId}`}
        icon={<TabGlyph tab={tab} />}
        title={tab.name}
        value={state.badgeOf(tab) ?? undefined}
        disabled={disabled}
        onSelect={() => (state.notSetUp(tab) ? openSetup(tab) : onPick(tab))}
      />
    ))

  let list: ReactNode
  let modelCount = 0
  switch (view.kind) {
    case 'search':
      list =
        view.count === 0 ? (
          <ListMessage title="No models or agents match." detail="Try another name." />
        ) : (
          <SheetGroup>
            {modelRows(effectiveId, state.effectiveCatalog, view.own, modelValue, true)}
            {view.others.map(({ configId, catalog, model }) =>
              modelRows(configId, catalog, [model], undefined, true)
            )}
            {agentRows(view.agents, (tab) => {
              state.setQuery('')
              state.openAgent(tab)
            })}
          </SheetGroup>
        )
      break
    case 'install':
      list = (
        <InstallState
          tab={view.tab}
          reason={entryDisableReason(view.entry)}
          installing={view.installing}
          installBlocked={view.installBlocked}
          touch
          onInstall={view.install}
        />
      )
      break
    case 'effective':
      modelCount = view.catalog?.options.length ?? 0
      list = view.catalog ? (
        <>
          {view.favorites.length > 0 ? (
            <SheetGroup label="Favorites">
              {view.favorites.map((favorite) =>
                modelRows(
                  favorite.configId,
                  favorite.catalog,
                  [favorite.model],
                  favorite.active ? modelValue : undefined,
                  true,
                  favorite
                )
              )}
            </SheetGroup>
          ) : null}
          <SheetGroup label={view.favorites.length > 0 ? nameOf(effectiveId) : undefined}>
            {modelRows(effectiveId, view.catalog, view.catalog.options, modelValue, false)}
          </SheetGroup>
          {view.stale?.error ? (
            <StatusActions
              title={`${view.stale.error.label}. These models are from the last session.`}
              detail={view.stale.error.detail}
              status={view.stale}
              touch
              compact
            />
          ) : null}
        </>
      ) : (
        <ListMessage
          title="This agent gives no model choice."
          detail={state.capabilities ?? undefined}
        />
      )
      break
    case 'current':
      modelCount = view.catalog?.options.length ?? 0
      list = (
        <>
          {view.catalog ? (
            <SheetGroup>
              {modelRows(state.viewId, view.catalog, view.catalog.options, undefined, false)}
            </SheetGroup>
          ) : (
            <ListMessage title={`${nameOf(state.viewId)} gives no model choice.`} />
          )}
          <Hint>{`Keeps ${nameOf(state.viewId)} and cancels the switch to ${nameOf(sw.armedConfigId)}.`}</Hint>
        </>
      )
      break
    case 'other':
      modelCount = view.catalog.options.length
      list = (
        <>
          <SheetGroup>
            {modelRows(state.viewId, view.catalog, view.catalog.options, undefined, false)}
          </SheetGroup>
          {view.confirming ? (
            <BusyBlock
              agentName={nameOf(sw.currentConfigId)}
              canCancel={sw.turnBusy}
              touch
              onWait={state.waitForTurn}
              onCancelAndSwitch={state.cancelAndSwitch}
            />
          ) : (
            <Hint>{`Switches to ${nameOf(state.viewId)} on the next send`}</Hint>
          )}
        </>
      )
      break
    case 'error': {
      // An agent that asks for credentials signs in on its setup screen.
      const { signInTab } = view
      const fallbackTab = state.viewId !== effectiveId ? tabOf(effectiveId) : null
      list = view.status ? (
        <StatusActions title={view.title} detail={view.detail} status={view.status} touch />
      ) : (
        <PhoneListFailed
          title={view.title}
          detail={view.detail}
          actions={[
            ...(fallbackTab
              ? [
                  {
                    key: 'fallback',
                    label: `Use ${fallbackTab.name}`,
                    onSelect: () => pickProvider(fallbackTab)
                  }
                ]
              : []),
            ...(signInTab
              ? [
                  {
                    key: 'sign-in',
                    label: `Sign in to ${signInTab.name}`,
                    raised: true,
                    onSelect: () => openSetup(signInTab)
                  }
                ]
              : []),
            ...(view.retry
              ? [{ key: 'retry', label: 'Try again', raised: !signInTab, onSelect: view.retry }]
              : [])
          ]}
          disabled={disabled}
        />
      )
      break
    }
    case 'loading':
      list = <PhoneListLoading title={view.title} />
      break
  }

  const onEscapeKeyDown = (event: KeyboardEvent): void => {
    if (top) {
      nav.onEscapeKeyDown(event)
      return
    }
    if (escapeRef.current?.()) event.preventDefault()
  }

  const allTabs = [...state.tabs.visible, ...state.tabs.overflow]
  const subOption = openOption?.kind === 'radio' ? openOption : null
  const installTab = top?.kind === 'install' ? tabOf(top.configId) : null
  const setupTab = top?.kind === 'setup' ? tabOf(top.configId) : null
  const { pop, replace, reset } = nav
  // The agent can drop the open option; leave its sub-view so back is not swallowed.
  useEffect(() => {
    if (top?.kind === 'option' && !subOption) pop()
  }, [top, subOption, pop])
  // Installed. Launcher: back to the list, which shows the selected agent's
  // models and sign-in. Chat: on to its setup, which starts it and signs in.
  const installedId = installTab && isInstalledTab(installTab) ? installTab.configId : null
  const launcher = sw.selectAgent != null
  useEffect(() => {
    if (!installedId) return
    if (launcher) reset()
    else replace({ kind: 'setup', configId: installedId })
  }, [installedId, launcher, reset, replace])

  // Ready: show its models (the launcher also selects it). Not set up: its
  // setup screen. Not installed: its install view.
  const openSetup = (tab: AgentTab): void => {
    state.setQuery('')
    nav.push({ kind: 'setup', configId: tab.configId })
  }
  const pickProvider = (tab: AgentTab): void => {
    if (state.notSetUp(tab)) {
      openSetup(tab)
      return
    }
    state.setQuery('')
    state.openAgent(tab)
    if (isInstalledTab(tab)) reset()
    else nav.push({ kind: 'install', configId: tab.configId })
  }
  // Set up: back to the list, which now shows that agent's models.
  const showSetupModels = (tab: AgentTab): void => {
    state.openAgent(tab)
    reset()
  }

  const viewTab = state.viewTab
  const providerRow = viewTab ? (
    <SheetGroup>
      <SheetRow
        icon={<TabGlyph tab={viewTab} />}
        title={
          <>
            <span className="block text-xs text-muted-foreground">Provider</span> {viewTab.name}
          </>
        }
        {...(allTabs.length > 1
          ? {
              // Paper "2.6i"/"2.6i·2": the row says why the list below is not
              // there yet, instead of the provider count.
              value:
                view.kind === 'loading'
                  ? 'Loading…'
                  : view.kind === 'error' && !view.status
                    ? 'Not loaded'
                    : `${allTabs.length} available`,
              accessory: 'chevron' as const,
              subview: PROVIDERS_ROUTE_KEY,
              disabled,
              onSelect: () => nav.push({ kind: 'providers' })
            }
          : {})}
      />
    </SheetGroup>
  ) : null

  let title = 'Select model'
  let body: ReactNode
  if (top?.kind === 'providers') {
    title = 'Providers'
    body = (
      <ProviderList
        tabs={allTabs}
        viewId={state.viewId}
        cwd={sw.workspace.cwd}
        ownCatalog={{
          configId: effectiveId,
          count: state.effectiveCatalog?.options.length ?? null
        }}
        disabled={disabled}
        badgeOf={state.badgeOf}
        notSetUp={state.notSetUp}
        onPick={pickProvider}
      />
    )
  } else if (top?.kind === 'install') {
    title = installTab?.name ?? 'Install'
    body = list
  } else if (top?.kind === 'setup') {
    title = setupTab?.name ?? 'Set up'
    body = setupTab ? (
      <ProviderSetupScreen
        key={setupTab.configId}
        tab={setupTab}
        workspace={sw.workspace}
        disabled={disabled}
        onReady={() => showSetupModels(setupTab)}
      />
    ) : null
  } else if (subOption) {
    title = subOption.label
    body = <ChoiceList option={subOption} disabled={disabled} onDone={nav.pop} />
  } else {
    body = (
      <>
        {providerRow}
        {/* Composer V2 (Paper "2.6e"): the options sit right under Provider,
            above the search and the model list, so Effort and Mode stay in
            reach however long the list is. */}
        {state.ownFooter && !state.searching ? (
          <OptionsCard
            options={options}
            disabled={disabled}
            onOpen={(id) => nav.push({ kind: 'option', id })}
          />
        ) : null}
        {state.searching || allTabs.length > 1 || modelCount > SEARCH_THRESHOLD ? (
          <SheetSearchField
            value={state.query}
            onChange={state.setQuery}
            placeholder="Search models…"
            label="Search models and agents"
          />
        ) : null}
        {list}
        {state.otherHintTab ? (
          <p className="px-3 text-xs text-muted-foreground">
            {`Choose a model to set the options for ${state.otherHintTab.name}.`}
          </p>
        ) : null}
        {state.searching ? null : (
          <UsageCard
            sessionId={props.sessionId}
            claudeProjectId={props.claudeProjectId}
            usage={state.contextUsage}
            compact={props.compact}
            onManageAccounts={() => {
              props.onClose()
              useSettingsModalStore.getState().openApp('provider')
            }}
          />
        )}
      </>
    )
  }

  return (
    <MobileSheetContent
      title={title}
      nav={nav}
      // Focus the sheet, not its first field. A focused search field raises the
      // keyboard, and the browser raises it again when the tab comes back.
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        ;(event.currentTarget as HTMLElement).focus()
      }}
      onEscapeKeyDown={onEscapeKeyDown}
      onCloseAutoFocus={props.onCloseAutoFocus}
      data-testid="agent-model-selector-panel"
      data-variant="mobile"
    >
      <SheetDescription className="sr-only">
        Choose a model, an agent, and its options.
      </SheetDescription>
      {body}
    </MobileSheetContent>
  )
}

/**
 * A provider's model list while it loads (Paper "2.6i"): a status line and
 * four skeleton rows that keep the list's height, so the sheet does not jump
 * when the models arrive.
 */
function PhoneListLoading({ title }: { title: string }): React.JSX.Element {
  return (
    <>
      <p
        role="status"
        className="flex h-7 items-end gap-2 px-1 pb-1 text-sm leading-[18px] text-muted-foreground"
      >
        <Spinner size={14} decorative className="mb-0.5" />
        {title}
      </p>
      <SheetGroup>
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            aria-hidden="true"
            className="relative flex h-[60px] items-center gap-3 pl-3.5"
            style={{ '--sheet-divider-inset': '44px' } as React.CSSProperties}
          >
            <Skeleton className="size-[18px] rounded" />
            <div className="flex flex-col gap-2">
              <Skeleton className={cn('h-3 rounded', row % 2 ? 'w-20' : 'w-28')} />
              <Skeleton className={cn('h-2.5 rounded', row % 2 ? 'w-40' : 'w-48')} />
            </div>
          </div>
        ))}
      </SheetGroup>
    </>
  )
}

interface FailedAction {
  key: string
  label: string
  /** The action that moves on: the raised secondary button. Others are text. */
  raised?: boolean
  onSelect: () => void
}

/**
 * A provider's model list that did not load (Paper "2.6i·2"): the same place
 * as the loading rows, a centred title and reason, and the way on. No icon
 * before the title.
 */
function PhoneListFailed({
  title,
  detail,
  actions,
  disabled
}: {
  title: string
  detail: string | undefined
  actions: readonly FailedAction[]
  disabled: boolean
}): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-1 rounded-xl bg-muted px-4 pb-4 pt-6 text-center shadow-control"
    >
      <p className="text-[15px] leading-5 text-foreground">{title}</p>
      {detail ? (
        <p className="whitespace-pre-line text-sm leading-[18px] text-muted-foreground">{detail}</p>
      ) : null}
      {actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={disabled}
              onClick={action.onSelect}
              className={cn(
                'h-11 rounded-[10px] px-4 text-[15px] font-medium transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:active:scale-100',
                action.raised
                  ? 'bg-popover text-foreground shadow-control'
                  : 'text-muted-foreground'
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
