/**
 * The last picked agent (`PersistenceKeys.lastSelectedAgent`): what a new
 * chat and the launcher start from. The stored value plus an in-memory copy,
 * so a launcher that mounts before the read resolves does not flash the
 * default agent.
 */

import type { LastSelectedAgent } from '@shared/types/persistence.types'
import { PersistenceKeys } from '@shared/types/persistence.types'
import { persistenceApi } from '@/lib/api'
import { logFrontendError } from '@/lib/log-api'

let cachedAgentId: string | null = null

function warn(message: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err)
  void logFrontendError({
    level: 'warn',
    source: 'agents.lastSelectedAgent',
    message: `${message}: ${reason}`
  })
}

/** The last pick held in memory, before or without a storage read. */
export function cachedLastSelectedAgentId(): string | null {
  return cachedAgentId
}

/** Hold an id in memory only (a saved pick that is not in the list yet). */
export function holdLastSelectedAgentId(agentId: string): void {
  cachedAgentId = agentId
}

/** The stored last pick; `null` when there is none or it cannot be read. */
export async function readLastSelectedAgentId(): Promise<string | null> {
  try {
    const result = await persistenceApi.read<unknown>(PersistenceKeys.lastSelectedAgent)
    const saved = (result.success ? result.data : null) as Partial<LastSelectedAgent> | null
    return saved?.mode === 'acp' && typeof saved.agentId === 'string' ? saved.agentId : null
  } catch (err) {
    warn('Could not read the last picked agent', err)
    return null
  }
}

/** Remember a pick: in memory at once, in storage in the background. */
export function rememberLastSelectedAgent(agentId: string): void {
  cachedAgentId = agentId
  void persistenceApi
    .write<LastSelectedAgent>(PersistenceKeys.lastSelectedAgent, { agentId, mode: 'acp' })
    .catch((err: unknown) => warn('Could not save the last picked agent', err))
}

/** Test-only: forget the in-memory pick. */
export function __resetLastSelectedAgentCache(): void {
  cachedAgentId = null
}
