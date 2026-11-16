import { Fragment, useRef } from 'react'
import { ChevronDown, Folder, FolderGit2, RefreshCw, Settings2 } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { MENU_SHORTCUT_CLASS } from '@/components/ui/menu-styles'
import { SwitchMark } from '@/components/ui/switch'
import { useChatIsolationContext } from '@/hooks/use-chat-isolation-context'
import { cn } from '@/lib/utils'
import { workingCopyOf } from '@/lib/working-copy'
import type { AcpSession } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { useSettingsModalStore } from '@/stores/settings-modal-store'
import { COMPOSER_RAISED_CLASS } from '../chat-layout'
import type { McpServerListProps } from '../McpServerList'
import { ConnectorLogo, connectorBrand, SAMPLE_CONNECTOR_BRANDS } from './connector-logos'
import { type ConnectorsHost, connectorsMenuModel } from './connectors-menu-model'

const NOTE = 'px-2 py-1.5 text-xs text-muted-foreground'

/**
 * Desktop Composer V2: the raised card inside the tray. The phone keeps the
 * single card, so its content renders without the extra layer.
 */
export function ComposerRaised({
  raised,
  children
}: {
  raised: boolean
  children: React.ReactNode
}): React.JSX.Element {
  if (!raised) return <>{children}</>
  return (
    <div data-composer-raised="true" className={cn('relative', COMPOSER_RAISED_CLASS)}>
      {children}
    </div>
  )
}

/** Logos shown on the Connectors button before the rest are summed up. */
const MAX_FOOT_LOGOS = 3

/**
 * The Composer V2 foot row under the raised card (Paper "Composer V2 ·
 * States", desktop): 40px tall, 8px side padding. The worktree sits on the
 * left (it gives way first), the Connectors button on the right.
 */
export function ComposerFootRow({
  start,
  end
}: {
  start?: React.ReactNode
  end?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      data-composer-foot-row="true"
      className="flex h-10 shrink-0 items-center justify-between gap-4 px-2"
    >
      <div className="flex min-w-0 flex-1 items-center">{start}</div>
      {end}
    </div>
  )
}

function lastPathSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/**
 * The working copy of a running chat, read-only (Paper "2.5 Working chat"):
 * folder icon, then "worktree · branch", or "Current checkout · branch" when
 * the chat runs in the project folder. The label fills the foot row's free
 * width, so only a name longer than the row reaches the 24px end fade.
 */
export function ComposerWorktreeLabel({
  session
}: {
  session: Pick<AcpSession, 'projectId' | 'cwd' | 'worktreePath' | 'worktreeBranch'>
}): React.JSX.Element | null {
  const { projectId, cwd, worktreePath, worktreeBranch } = session
  const { isWorktree, isolationModeTitle, isolationBranch, isDetachedHead } =
    useChatIsolationContext({ projectId, worktreePath, worktreeBranch })
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId))
  if (!project) return null

  // A worktree chat prefers the listed worktree's branch (the reconciler keeps
  // it fresh after a checkout) over the branch recorded at launch.
  const wc = isWorktree ? workingCopyOf(cwd, project) : null
  const listedBranch =
    wc?.state === 'resolved' && wc.kind === 'worktree'
      ? project.worktrees?.find((w) => w.id === wc.worktreeId)?.branch
      : undefined
  const branch =
    (isWorktree ? listedBranch : undefined) ||
    isolationBranch ||
    (isDetachedHead ? 'Detached HEAD' : null)
  const name = isWorktree ? lastPathSegment(worktreePath ?? cwd) : 'Current checkout'
  const Icon = isWorktree ? FolderGit2 : Folder
  const text = branch ? `${name} · ${branch}` : name

  return (
    <span
      data-composer-worktree="true"
      title={isolationModeTitle}
      className="flex h-7 min-w-0 flex-1 items-center gap-2 px-1.5 text-xs text-muted-foreground"
    >
      <Icon size={14} aria-hidden="true" className="shrink-0" />
      <span className="sr-only">Workspace: </span>
      <span className="fade-end min-w-0 flex-1">{text}</span>
    </span>
  )
}

function openConnectorSettings(): void {
  useSettingsModalStore.getState().openApp('mcp-servers')
}

/** First letter of a connector name, the tile for a server with no known logo. */
function connectorInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

function ConnectorTile({ name, size }: { name: string; size: 14 | 16 }): React.JSX.Element {
  const brand = connectorBrand(name)
  if (brand) return <ConnectorLogo brand={brand} size={size} />
  return (
    <span
      aria-hidden="true"
      className={cn(
        // 12px is the type floor (docs/design/typography.md), even in a tile.
        'flex shrink-0 select-none items-center justify-center rounded bg-muted text-xs font-semibold leading-none text-muted-foreground',
        size === 14 ? 'size-3.5' : 'size-4'
      )}
    >
      {connectorInitial(name)}
    </span>
  )
}

/**
 * The foot row's Connectors button and its menu (Paper "5.1 Connectors / Menu
 * open"): the project's MCP servers with a switch each, Sign in when the
 * probe says so, Manage, and the host's footnote. It replaces the Connectors
 * sub-menu of the desktop `+` menu.
 */
export function ComposerConnectorsButton({
  connectors,
  connectorsHost,
  onClosed
}: {
  connectors: McpServerListProps
  connectorsHost: ConnectorsHost
  /** Focus goes back here when the menu closes on its own (Escape). */
  onClosed?: () => void
}): React.JSX.Element {
  const model = connectorsMenuModel(connectors.servers, connectors.probeStatus, connectorsHost)
  const onRows = model.rows.filter((row) => row.on)
  const logos = onRows.slice(0, MAX_FOOT_LOGOS)
  // A click outside or a settings page takes focus itself: leave it alone.
  const keepFocusRef = useRef(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Connectors, ${model.onCount} on`}
          // Same box and hover as the worktree pick on its left
          // (ROW_TRIGGER_CLASS): 24px, radius 6, `muted` fill on hover and
          // while open; the hit area grows 8px up and down (40px).
          className="group/connectors relative flex h-6 shrink-0 items-center gap-2.5 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 ease-out after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          Connectors
          {logos.length > 0 ? (
            <span className="flex items-center gap-1.5">
              {logos.map((row) => (
                <ConnectorTile key={row.id} name={row.name} size={14} />
              ))}
              {onRows.length > logos.length ? (
                <span className="tabular-nums">+{onRows.length - logos.length}</span>
              ) : null}
            </span>
          ) : (
            // No server is on: sample app logos, decoration only, so the
            // button reads as "connect apps" (Paper "Connect apps" reference).
            <span data-connector-samples="true" className="flex items-center gap-1.5">
              {SAMPLE_CONNECTOR_BRANDS.map((brand) => (
                <ConnectorLogo key={brand} brand={brand} size={14} />
              ))}
            </span>
          )}
          <ChevronDown
            size={12}
            aria-hidden="true"
            className="-ml-1 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-data-[state=open]/connectors:rotate-180 motion-reduce:transition-none"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        className="max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height))] w-72 overflow-y-auto"
        onInteractOutside={() => {
          keepFocusRef.current = true
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const keep = keepFocusRef.current
          keepFocusRef.current = false
          if (!keep) onClosed?.()
        }}
      >
        <DropdownMenuLabel className="flex items-center justify-between font-normal">
          MCP servers
          <span className="tabular-nums">{model.onCount} on</span>
        </DropdownMenuLabel>
        {model.rows.length === 0 ? <p className={NOTE}>No connectors yet</p> : null}
        {model.rows.map((row) => (
          <Fragment key={row.id}>
            <DropdownMenuItem
              role="menuitemcheckbox"
              aria-checked={row.on}
              onSelect={(event) => {
                event.preventDefault()
                connectors.onToggle?.(row.id, !row.on)
              }}
            >
              <ConnectorTile name={row.name} size={16} />
              <span
                className={cn('fade-end ml-2 min-w-0 flex-1', !row.on && 'text-muted-foreground')}
              >
                {row.name}
              </span>
              <span className="ml-auto shrink-0 pl-4">
                <SwitchMark on={row.on} />
              </span>
            </DropdownMenuItem>
            {row.needsSignIn ? (
              <DropdownMenuItem
                aria-label={`Sign in to ${row.name}`}
                className="pl-8 text-muted-foreground"
                onSelect={() => {
                  keepFocusRef.current = true
                  openConnectorSettings()
                }}
              >
                <span className="min-w-0 flex-1 truncate text-xs">Needs sign-in</span>
                <span className={MENU_SHORTCUT_CLASS}>Sign in</span>
              </DropdownMenuItem>
            ) : null}
          </Fragment>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            keepFocusRef.current = true
            openConnectorSettings()
          }}
        >
          <Settings2 size={14} aria-hidden="true" className="mr-2 shrink-0 text-muted-foreground" />
          Manage MCP servers
        </DropdownMenuItem>
        {model.footnote === 'next-chat' ? (
          <p className={NOTE}>Changes apply to the next chat you start.</p>
        ) : null}
        {model.footnote === 'reload-chat' ? (
          <>
            <p className={NOTE}>This chat still uses the previous servers.</p>
            <DropdownMenuItem
              disabled={connectors.reloadDisabled || connectors.reloading}
              title={
                connectors.reloadDisabled
                  ? (connectors.reloadDisabledReason ?? undefined)
                  : undefined
              }
              onSelect={() => {
                // A reload may ask to confirm first; that dialog takes focus.
                keepFocusRef.current = true
                connectors.onReloadChat?.()
              }}
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className="mr-2 shrink-0 text-muted-foreground"
              />
              {connectors.reloading ? 'Reloading…' : 'Reload this chat'}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
