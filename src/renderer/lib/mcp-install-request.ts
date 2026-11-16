import type { McpConsentView, McpInstallForm } from '@shared/types/mcp-install.types'

/** `acp:mcp_install_request`. Secret field values are not in this event. */
export interface McpInstallRequestEvent {
  agentId: string
  sessionId: string
  requestId: string
  name: string
  title: string
  transport: 'stdio' | 'http' | 'sse' | null
  form: McpInstallForm
  consent: McpConsentView | null
  planId: string | null
  launchDigest: string | null
  error?: string | null
}

export interface McpInstallNextStep {
  kind: string
  runtime?: string
  message: string
}

/** `acp:mcp_install_resolved`. No secret values. */
export interface McpInstallResolvedEvent {
  agentId: string
  sessionId: string
  requestId: string
  outcome: string
  name?: string
  serverId?: string
  nextSteps: McpInstallNextStep[]
  oauth: boolean
}

/** `acp:mcp_registry_changed`. The renderer reloads the host list. */
export interface McpRegistryChangedEvent {
  agentId: string
  sessionId: string
  serverId: string
  name: string
}

export type McpInstallDecisionName = 'decline' | 'preview' | 'approve'

export interface McpInstallAnswer {
  requestId: string
  sessionId: string
  decision: McpInstallDecisionName
  inputs?: Record<string, string>
  secretValues?: Record<string, string>
  planId?: string | null
  launchDigest?: string | null
}

export interface PendingMcpInstall {
  requestId: string
  agentId: string
  sessionId: string
  name: string
  title: string
  transport: 'stdio' | 'http' | 'sse' | null
  form: McpInstallForm
  consent: McpConsentView | null
  planId: string | null
  launchDigest: string | null
  error: string | null
  saving: boolean
  result: {
    outcome: string
    name?: string
    serverId?: string
    nextSteps: McpInstallNextStep[]
    oauth: boolean
  } | null
}

export function pendingFromRequest(event: McpInstallRequestEvent): PendingMcpInstall {
  return {
    requestId: event.requestId,
    agentId: event.agentId,
    sessionId: event.sessionId,
    name: event.name,
    title: event.title,
    transport: event.transport,
    form: event.form,
    consent: event.consent,
    planId: event.planId,
    launchDigest: event.launchDigest,
    error: event.error ?? null,
    saving: false,
    result: null
  }
}
