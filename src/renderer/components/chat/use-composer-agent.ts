import { useAcpStore, useAgentIcon, useAgentTemplateId } from '@/stores/acp-store'
import { useCurrentAgentConfigId } from './agent-model-selector/use-agent-switch'

/**
 * The agent the composer shows: its glyph and the name the mode menu uses.
 *
 * While an agent switch is armed, the chips advertise the TARGET config's
 * options, so the glyph and the name follow the target too. `switching` is
 * read from the store (the field the model selector reads), so the icon flips
 * the moment the arm lands. A launch placeholder has no agent yet, so the
 * glyph resolves by config id: the armed target, else the chat's own config.
 */
export function useComposerAgent(session: { id: string; agentId: string }): {
  currentAgentConfigId: string | null
  agentName: string | undefined
  agentTemplateId: ReturnType<typeof useAgentTemplateId>
  agentIcon: ReturnType<typeof useAgentIcon>
} {
  const armedConfigId = useAcpStore((s) => s.sessions?.[session.id]?.switching?.toConfigId)
  const currentAgentConfigId = useCurrentAgentConfigId(session.id)
  const agentName = useAcpStore(
    (s) => s.agentConfigs?.find((c) => c.id === (armedConfigId ?? currentAgentConfigId))?.name
  )
  const glyphConfigId = armedConfigId ?? currentAgentConfigId ?? undefined
  return {
    currentAgentConfigId,
    agentName,
    agentTemplateId: useAgentTemplateId(session.agentId, glyphConfigId),
    agentIcon: useAgentIcon(session.agentId, glyphConfigId)
  }
}
