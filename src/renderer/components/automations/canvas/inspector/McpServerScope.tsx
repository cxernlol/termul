import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useMcpServers } from './sources'

type Row = { serverId: string; label: string }

/**
 * The MCP servers an agent step that lists `other` starts with. `null` is
 * every enabled server; a list is only those, in Settings order.
 */
export function McpServerScope({
  id,
  scope,
  commit
}: {
  id: string
  scope: readonly string[] | null
  commit: (scope: string[] | null) => boolean
}): React.JSX.Element {
  const { loaded, servers } = useMcpServers()
  const rows: Row[] = servers.map((server) => ({ serverId: server.id, label: server.name }))
  for (const serverId of scope ?? []) {
    if (!rows.some((row) => row.serverId === serverId)) {
      rows.push({ serverId, label: `${serverId} (not configured)` })
    }
  }
  const toggle = (serverId: string, on: boolean) =>
    commit(
      rows
        .map((row) => row.serverId)
        .filter((rowId) => (rowId === serverId ? on : scope?.includes(rowId)))
    )
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-1 text-xs font-medium">MCP servers</legend>
      <ScopeSwitch
        id={`${id}-all`}
        label="All enabled servers"
        on={scope === null}
        disabled={!loaded}
        onChange={(on) => commit(on ? null : servers.map((server) => server.id))}
      />
      {scope !== null &&
        rows.map((row, index) => (
          <ScopeSwitch
            key={row.serverId}
            id={`${id}-${index}`}
            label={row.label}
            on={scope.includes(row.serverId)}
            onChange={(on) => toggle(row.serverId, on)}
          />
        ))}
      {loaded && servers.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          No MCP servers yet. Add one in the MCP settings.
        </p>
      )}
    </fieldset>
  )
}

function ScopeSwitch({
  id,
  label,
  on,
  disabled,
  onChange
}: {
  id: string
  label: string
  on: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex h-7 items-center justify-between gap-3 pointer-coarse:h-11">
      <Label
        htmlFor={id}
        className={cn('min-w-0 truncate text-sm font-normal', !on && 'text-muted-foreground')}
      >
        {label}
      </Label>
      <Switch id={id} checked={on} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}
