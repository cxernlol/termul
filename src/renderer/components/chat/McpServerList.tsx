import type { McpToolInfo, ProbeStatus } from '@/lib/acp-api'

/*
 * The connectors (MCP servers) data the composer surfaces share: the desktop
 * foot row button (`ComposerConnectorsButton`) and the phone Add sheet
 * (`ConnectorsSheetView`). The list UI that used to live here moved into
 * those two views (Composer V2).
 */

export interface McpServerSummary {
  id: string
  name: string
  enabled?: boolean
}

export interface McpServerListProps {
  count: number
  servers: McpServerSummary[]
  onToggle?: (id: string, enabled: boolean) => void
  probeStatus?: Record<string, ProbeStatus>
  probeError?: Record<string, string | undefined>
  tools?: Record<string, McpToolInfo[]>
  onLoadTools?: (id: string) => void
  /**
   * Reload this chat so the current MCP list and a new agent process apply.
   * Absent in surfaces that only display the list.
   */
  onReloadChat?: () => void
  reloadDisabled?: boolean
  /** Title while `reloadDisabled` is set. */
  reloadDisabledReason?: string | null
  reloading?: boolean
}
