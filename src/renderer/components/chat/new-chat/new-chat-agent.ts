import type { StoredAgentConfig } from '@/lib/acp-agents-persistence'
import {
  readLastSelectedAgentId,
  rememberLastSelectedAgent
} from '@/lib/agents/last-selected-agent'
import {
  pickDefaultConfiguredAgent,
  pickDefaultSupportedAgent,
  resolveSupportedAcpAgents,
  type SupportedAcpAgentEntry
} from '@/lib/agents/supported-acp-agents'
import { logFrontendError } from '@/lib/log-api'
import { isTauriContext } from '@/lib/tauri-runtime'
import { useAcpStore } from '@/stores/acp-store'

/** The agent a new chat starts with, or why none can start without the launcher. */
type NewChatAgent =
  | {
      kind: 'ready'
      /** The config the session starts on. */
      configId: string
      name: string
      /** A catalog config to save before the start (desktop only). */
      configToSave: StoredAgentConfig | null
    }
  | { kind: 'none'; reason: string }

function warn(message: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err)
  void logFrontendError({
    level: 'warn',
    source: 'chat.newChatAgent',
    message: `${message}: ${reason}`
  })
}

async function resolveEntries(
  configs: readonly StoredAgentConfig[]
): Promise<readonly SupportedAcpAgentEntry[]> {
  try {
    return await resolveSupportedAcpAgents(configs)
  } catch (err) {
    warn('Could not resolve the supported agents', err)
    return []
  }
}

function ready(entry: SupportedAcpAgentEntry, persisted: ReadonlySet<string>): NewChatAgent {
  const config = entry.config
  const configId = config?.id ?? entry.configId
  return {
    kind: 'ready',
    configId,
    name: config?.name ?? entry.agent.name,
    configToSave: config && !persisted.has(configId) ? config : null
  }
}

/**
 * The agent a new chat starts with: the last picked one
 * (`PersistenceKeys.lastSelectedAgent`, written by the launcher and the chat
 * selector), else the default agent, with the launcher's rules.
 *
 * - Desktop: the last pick when it is ready, else the preferred ready default
 *   (a catalog config is saved first, as the launcher did on prewarm). A
 *   last pick that is not ready (install needed) goes to the launcher, which
 *   shows its install state.
 * - Web (issues #840 / #907): only a CONFIGURED agent may start. The last
 *   pick must have a persisted config, else the preferred configured default.
 *   A catalog agent nobody configured never spawns: the launcher opens so
 *   the user picks one.
 */
export async function resolveNewChatAgent(): Promise<NewChatAgent> {
  const configs = useAcpStore.getState().agentConfigs
  const persisted = new Set(configs.map((config) => config.id))
  const [entries, lastId] = await Promise.all([resolveEntries(configs), readLastSelectedAgentId()])
  const last = lastId
    ? entries.find((entry) => entry.configId === lastId || entry.config?.id === lastId)
    : undefined

  if (isTauriContext()) {
    if (last) {
      return last.status === 'ready'
        ? ready(last, persisted)
        : { kind: 'none', reason: `the last picked agent ${lastId} is ${last.status}` }
    }
    // A custom agent whose catalog entry has not resolved yet.
    const savedConfig = lastId ? configs.find((config) => config.id === lastId) : undefined
    if (savedConfig) {
      return { kind: 'ready', configId: savedConfig.id, name: savedConfig.name, configToSave: null }
    }
    const fallback = pickDefaultSupportedAgent(entries)
    return fallback?.status === 'ready'
      ? ready(fallback, persisted)
      : { kind: 'none', reason: 'no ready agent' }
  }

  const configured = (entry: SupportedAcpAgentEntry | null | undefined): boolean =>
    entry?.status === 'ready' && persisted.has(entry.config?.id ?? entry.configId)
  if (configured(last) && last) return ready(last, persisted)
  const fallback = pickDefaultConfiguredAgent(entries, persisted)
  return configured(fallback) && fallback
    ? ready(fallback, persisted)
    : { kind: 'none', reason: 'no configured agent on this server' }
}

/** Remember the agent a new chat started with, like a launcher pick. */
export function rememberNewChatAgent(configId: string): void {
  rememberLastSelectedAgent(configId)
  useAcpStore.getState().setSelectedAgentConfigId(configId)
}
