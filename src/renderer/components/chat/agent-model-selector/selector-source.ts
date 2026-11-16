import { useMemo } from 'react'
import { toast } from 'sonner'
import { chatNotStarted } from '@/components/chat/new-chat/chat-not-started'
import { isEmptyStartChat, replaceEmptyChat } from '@/components/chat/new-chat/open-new-chat'
import type { StoredAgentConfig } from '@/lib/acp-agents-persistence'
import type { PrepareChatError } from '@/lib/agents/acp-spawn-errors'
import type { SupportedAcpAgentEntry } from '@/lib/agents/supported-acp-agents'
import { useAcpStore } from '@/stores/acp-store'
import type { OptionValues } from '@/stores/acp-store/composer-options'
import { type AgentTab, catalogFromSessionState, type ModelCatalog } from './selector-model'
import { type SwitchModelPick, useAgentSwitch } from './use-agent-switch'

/**
 * The state of the composer agent's own model list, when it is not simply
 * ready (the launcher before its warm session is up).
 */
export interface SelectorModelStatus {
  loading: boolean
  error: PrepareChatError | null
  /** The list on screen is from the cache, not the agent (after an error). */
  stale: boolean
  signInLabel: string | null
  onSignIn: (() => void) | null
  onRetry: (() => void) | null
}

/**
 * Where the selector gets its agents and where its picks go. A chat has a
 * live session (`useSessionSelectorSource`); the launcher has a draft with no
 * session yet (`kind: 'draft'`).
 */
export interface SelectorSource {
  kind: 'session' | 'draft'
  /** Unique per mounted selector; keys the sliding thumbs. */
  key: string
  agentConfigs: readonly StoredAgentConfig[]
  entries: readonly SupportedAcpAgentEntry[]
  /** The chat's own agent, or the launcher's selected agent. */
  currentConfigId: string | null
  /** Armed switch target (chat only). */
  armedConfigId: string | null
  /**
   * The chat has not started (chat only): a pick on another agent's tab moves
   * it to that agent at once instead of arming a switch.
   */
  emptyChat: boolean
  blocked: boolean
  turnBusy: boolean
  installingConfigId: string | null
  install: (entry: SupportedAcpAgentEntry) => void
  /** Where other agents' model lists are read or prepared. */
  workspace: { cwd: string; projectId: string }
  /** The chat agent's own list while a switch is armed (chat only). */
  liveCatalog: ModelCatalog | null
  /** A model of the chat's own agent while a switch is armed (chat only). */
  pickCurrentModel: (catalog: ModelCatalog | null, value: string, values?: OptionValues) => void
  /** A model on another agent's tab: arm the switch, or select the agent. */
  pickOtherModel: (configId: string, pick: SwitchModelPick) => void
  cancelThenSwitch: (configId: string, pick: SwitchModelPick) => Promise<void>
  /**
   * Draft only: a tab click selects that agent for the new chat (the old agent
   * picker). Chat tabs only show another agent's models.
   */
  selectAgent: ((tab: AgentTab) => void) | null
  modelStatus: SelectorModelStatus | null
  /** Registry agent ids with a newer version (launcher; marked on agents). */
  updateAgentIds: ReadonlySet<string> | null
}

/** The selector source for a chat with a live session. */
export function useSessionSelectorSource(sessionId: string): SelectorSource {
  const sw = useAgentSwitch(sessionId)
  const cwd = useAcpStore((s) => s.sessions?.[sessionId]?.cwd ?? '')
  const projectId = useAcpStore((s) => s.sessions?.[sessionId]?.projectId ?? '')
  const liveModels = useAcpStore((s) => s.sessions?.[sessionId]?.models ?? null)
  const liveOptions = useAcpStore((s) => s.sessions?.[sessionId]?.configOptions ?? null)
  const emptyChat = useAcpStore((s) => chatNotStarted(s, sessionId))

  return useMemo<SelectorSource>(
    () => ({
      kind: 'session',
      key: sessionId,
      agentConfigs: sw.agentConfigs,
      entries: sw.entries,
      currentConfigId: sw.currentConfigId,
      armedConfigId: sw.armedConfigId,
      emptyChat,
      blocked: sw.blocked,
      turnBusy: sw.turnBusy,
      installingConfigId: sw.installingConfigId,
      install: sw.install,
      workspace: { cwd, projectId },
      liveCatalog: catalogFromSessionState(liveModels, liveOptions),
      pickCurrentModel: (_catalog, value, values) => {
        // Back to the chat's own agent: drop the armed switch, set the model
        // and its values.
        const store = useAcpStore.getState()
        store.cancelAgentSwitch(sessionId)
        void store
          .pickModel(sessionId, value, values)
          .catch(() => toast.error('Could not switch model. Try again.'))
      },
      pickOtherModel: (configId, pick) => {
        // An empty chat has nothing to hand off, so it moves at once.
        if (isEmptyStartChat(sessionId)) {
          void replaceEmptyChat(sessionId, configId, pick)
          return
        }
        void sw.armWithModel(configId, pick)
      },
      cancelThenSwitch: sw.cancelThenSwitch,
      selectAgent: null,
      modelStatus: null,
      updateAgentIds: null
    }),
    [sessionId, sw, cwd, projectId, liveModels, liveOptions, emptyChat]
  )
}
