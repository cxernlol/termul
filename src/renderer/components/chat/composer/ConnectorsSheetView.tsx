import { Settings2 } from '@/components/icons'
import { SheetGroup, SheetIconWell, SheetRow, SheetSwitchRow } from '@/components/ui/mobile-sheet'
import type { ProbeStatus } from '@/lib/acp-api'
import { cn } from '@/lib/utils'
import { useSettingsModalStore } from '@/stores/settings-modal-store'
import type { McpServerListProps } from '../McpServerList'
import {
  type ConnectorsFootnote,
  type ConnectorsHost,
  connectorIsOn,
  connectorsMenuModel
} from './connectors-menu-model'

/** Why a connector needs the user before it can work. */
type Attention = 'disconnected' | 'signIn'

function attentionOf(status: ProbeStatus | undefined): Attention | null {
  if (status === 'disconnected') return 'disconnected'
  if (status === 'authRequired') return 'signIn'
  return null
}

function openConnectorSettings(): void {
  useSettingsModalStore.getState().openApp('mcp-servers')
}

/** The servers that need the user: the Add sheet's "N need attention". */
export function connectorsNeedingAttention(
  servers: McpServerListProps['servers'],
  probeStatus: McpServerListProps['probeStatus']
): number {
  return servers.filter((server) => attentionOf(probeStatus?.[server.id]) !== null).length
}

/** A 6px status dot in the row's 18px icon slot. */
function StatusDot({ tone }: { tone: 'on' | 'off' | 'error' | 'warning' }): React.JSX.Element {
  return (
    <SheetIconWell>
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'on' && 'bg-success',
          tone === 'off' && 'bg-muted-foreground',
          tone === 'error' && 'bg-destructive',
          tone === 'warning' && 'bg-warning'
        )}
      />
    </SheetIconWell>
  )
}

function toolCount(tools: readonly unknown[] | undefined): string | undefined {
  if (!tools) return undefined
  return tools.length === 1 ? '1 tool' : `${tools.length} tools`
}

/** The one line above the groups: the on count and what a change does. */
function summaryLine(
  onCount: number,
  total: number,
  attention: number,
  footnote: ConnectorsFootnote
): string {
  const parts = [`${onCount} of ${total} on.`]
  if (attention > 0) parts.push('Fix a connector to turn it on.')
  if (footnote === 'next-chat') parts.push('Changes apply to the next chat.')
  return parts.join(' ')
}

/**
 * The phone Add sheet's Connectors view (Paper "2.6n"): a summary line, then
 * "Needs attention" (a disconnected server offers Reconnect, a server that
 * needs a sign-in offers Sign in; no switch until it works), "On" and "Off"
 * with a switch each and the tool count once Troupe has probed the server.
 * A stale chat offers Reload; Manage opens the MCP settings.
 */
export function ConnectorsSheetView({
  servers,
  onToggle,
  probeStatus,
  tools,
  onLoadTools,
  onReloadChat,
  reloadDisabled = false,
  reloadDisabledReason,
  reloading = false,
  host
}: Omit<McpServerListProps, 'count'> & {
  host: ConnectorsHost
}): React.JSX.Element {
  const { onCount, footnote } = connectorsMenuModel(servers, probeStatus, host)
  const needing = servers.filter((server) => attentionOf(probeStatus?.[server.id]) !== null)
  const healthy = servers.filter((server) => attentionOf(probeStatus?.[server.id]) === null)
  const on = healthy.filter(connectorIsOn)
  const off = healthy.filter((server) => !connectorIsOn(server))

  const switchRow = (server: (typeof servers)[number]): React.JSX.Element => {
    const enabled = connectorIsOn(server)
    return (
      <SheetSwitchRow
        key={server.id}
        icon={<StatusDot tone={enabled ? 'on' : 'off'} />}
        title={server.name}
        subtitle={toolCount(tools?.[server.id])}
        checked={enabled}
        onCheckedChange={(checked) => {
          if (checked !== enabled) onToggle?.(server.id, checked)
        }}
        testId={`connector-switch-${server.id}`}
      />
    )
  }

  return (
    <>
      {servers.length > 0 ? (
        <p className="px-1 text-sm leading-[18px] text-muted-foreground">
          {summaryLine(onCount, servers.length, needing.length, footnote)}
        </p>
      ) : (
        <p className="px-1 text-sm leading-[18px] text-muted-foreground">
          No connectors yet. Add one in the MCP settings.
        </p>
      )}
      {needing.length > 0 ? (
        <SheetGroup label="Needs attention">
          {needing.map((server) => {
            const attention = attentionOf(probeStatus?.[server.id])
            const disconnected = attention === 'disconnected'
            return (
              <SheetRow
                key={server.id}
                icon={<StatusDot tone={disconnected ? 'error' : 'warning'} />}
                title={server.name}
                subtitle={
                  <span className={disconnected ? 'text-destructive' : 'text-warning'}>
                    {disconnected ? 'Disconnected' : 'Needs sign-in'}
                  </span>
                }
                aside={
                  <span className="flex shrink-0 items-center pr-2.5">
                    <button
                      type="button"
                      aria-label={
                        disconnected ? `Reconnect ${server.name}` : `Sign in to ${server.name}`
                      }
                      onClick={() =>
                        disconnected ? onLoadTools?.(server.id) : openConnectorSettings()
                      }
                      className="relative h-8 rounded-lg bg-popover px-3 text-sm font-medium text-foreground shadow-control transition-transform duration-150 ease-out after:absolute after:-inset-1.5 after:content-[''] active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring motion-reduce:active:scale-100"
                    >
                      {disconnected ? 'Reconnect' : 'Sign in'}
                    </button>
                  </span>
                }
              />
            )
          })}
        </SheetGroup>
      ) : null}
      {on.length > 0 ? <SheetGroup label="On">{on.map(switchRow)}</SheetGroup> : null}
      {off.length > 0 ? <SheetGroup label="Off">{off.map(switchRow)}</SheetGroup> : null}
      {footnote === 'reload-chat' && onReloadChat ? (
        <SheetGroup>
          <SheetRow
            title={reloading ? 'Reloading…' : 'Reload this chat'}
            subtitle={
              reloadDisabled && reloadDisabledReason
                ? reloadDisabledReason
                : servers.length > 0
                  ? 'This chat still uses the previous servers.'
                  : 'Reload this chat to use new agent settings.'
            }
            disabled={reloadDisabled || reloading}
            onSelect={onReloadChat}
          />
        </SheetGroup>
      ) : null}
      <SheetGroup>
        <SheetRow
          icon={
            <SheetIconWell>
              <Settings2 size={18} />
            </SheetIconWell>
          }
          title="Manage MCP servers"
          accessory="chevron"
          onSelect={openConnectorSettings}
        />
      </SheetGroup>
    </>
  )
}
