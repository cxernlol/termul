export function registryConfigId(registryId: string): string {
  return `acp-registry:${registryId}`
}

/** Config id of the host-managed Claude ACP agent. */
export const CLAUDE_AGENT_CONFIG_ID = 'acp-registry:claude-acp'
