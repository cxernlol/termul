import { Fragment, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAgentModels } from '@/components/automations/canvas/inspector/sources'
import { SettingsCard, SettingsGroup } from '@/components/settings/SettingsGroup'
import { SettingsNotice } from '@/components/settings/SettingsNotice'
import { SettingsRow, settingsDescriptionId } from '@/components/settings/SettingsRow'
import { SettingsSelect } from '@/components/settings/SettingsSelect'
import { SettingsStepper } from '@/components/settings/SettingsStepper'
import { SettingsSwitchRow } from '@/components/settings/SettingsSwitchRow'
import { Switch } from '@/components/ui/switch'
import type { SubagentSettingsAgentView, SubagentSettingsView } from '@/lib/acp-api'
import { findBundledIconByKey } from '@/lib/agents/agent-icon-catalog'
import { sanitizeInlineAgentSvg } from '@/lib/agents/sanitize-agent-icon'
import { acpApi } from '@/lib/api'
import { logFrontendError } from '@/lib/log-api'
import { useAgentIcon, useAgentTemplateId } from '@/stores/acp-store'

const MIN_RUNNING = 1
const MAX_RUNNING = 8
const MIN_DEPTH = 1
const MAX_DEPTH = 4
/** Radix Select needs a non-empty value; this one means "no model saved". */
const DEFAULT_MODEL = '\u0000default'

/**
 * The launchable agent's glyph: its persisted config's custom icon, else the
 * bundled icon of the config's templateId, else its initial. Same resolution
 * path the chat surfaces use (config -> templateId -> catalog).
 */
function AgentRowIcon({ agentId, name }: { agentId: string; name: string }): React.JSX.Element {
  const templateId = useAgentTemplateId(null, agentId)
  const customIcon = useAgentIcon(null, agentId)
  const svg = customIcon ?? (templateId ? findBundledIconByKey(`acp:${templateId}`)?.svg : null)
  const sanitized = svg ? sanitizeInlineAgentSvg(svg) : null
  if (sanitized) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex size-3.5 shrink-0 text-foreground/80 [&_svg]:h-full [&_svg]:w-full"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: icon SVG is sanitized via sanitizeInlineAgentSvg (DOMPurify)
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-3.5 shrink-0 items-center justify-center text-3xs font-semibold uppercase text-muted-foreground"
    >
      {name.charAt(0)}
    </span>
  )
}

/**
 * The model a sub-agent of `agent` starts with: the models its chats last
 * reported, plus a saved id the agent no longer lists, so it stays visible.
 */
function DefaultModelRow({
  agent,
  onChange
}: {
  agent: SubagentSettingsAgentView
  onChange: (model: string | null) => void
}): React.JSX.Element {
  const models = useAgentModels(agent.agentId)
  const options = [
    { value: DEFAULT_MODEL, label: 'Default' },
    ...models.map((model) => ({ value: model.modelId, label: model.name }))
  ]
  if (agent.model !== null && !models.some((model) => model.modelId === agent.model)) {
    options.push({ value: agent.model, label: agent.model })
  }
  const id = `subagent-model-${agent.agentId}`
  return (
    <SettingsRow
      id={`${id}-row`}
      htmlFor={id}
      label="Default model"
      description={
        models.length === 0
          ? 'Run this agent once in a chat to list its models.'
          : 'Used when the calling agent does not pick one.'
      }
      indent
    >
      <SettingsSelect
        id={id}
        aria-describedby={settingsDescriptionId(id)}
        options={options}
        value={agent.model ?? DEFAULT_MODEL}
        onValueChange={(next) => onChange(next === DEFAULT_MODEL ? null : next)}
      />
    </SettingsRow>
  )
}

function AllowedAgentRow({
  agent,
  onToggle
}: {
  agent: SubagentSettingsAgentView
  onToggle: (allowed: boolean) => void
}): React.JSX.Element {
  return (
    <SettingsRow
      id={`subagent-agent-${agent.agentId}`}
      htmlFor={`subagent-agent-switch-${agent.agentId}`}
      label={
        <span className="flex min-w-0 items-center gap-2">
          <AgentRowIcon agentId={agent.agentId} name={agent.name} />
          <span className="truncate">{agent.name}</span>
        </span>
      }
      description="Installed on this machine."
      layout="inline"
    >
      <Switch
        id={`subagent-agent-switch-${agent.agentId}`}
        aria-describedby={settingsDescriptionId(`subagent-agent-switch-${agent.agentId}`)}
        checked={agent.allowed}
        onCheckedChange={onToggle}
      />
    </SettingsRow>
  )
}

/**
 * The "Sub-agents" and "Agents they can use" groups of the Agent chats
 * preferences: the orchestrator's enable switch, its caps, and the per-agent
 * allow list with each allowed agent's default model, all through the host's
 * one settings view. A write applies the view the host answers with, so the
 * host stays the single source of truth.
 */
export function SubagentSettingsGroup(): React.JSX.Element {
  const [view, setView] = useState<SubagentSettingsView | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void acpApi
      .getSubagentSettings()
      .then((next) => {
        if (cancelled) return
        setView(next)
        setFailed(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setView(null)
        setFailed(true)
        void logFrontendError({
          level: 'warn',
          source: 'SubagentSettingsGroup',
          message: `Failed to read the sub-agent settings: ${error instanceof Error ? error.message : String(error)}`
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const write = useCallback((input: Parameters<typeof acpApi.setSubagentSettings>[0]) => {
    void acpApi
      .setSubagentSettings(input)
      .then(setView)
      .catch((error: unknown) => {
        toast.error('Could not save the sub-agent setting. Try again.')
        void logFrontendError({
          level: 'warn',
          source: 'SubagentSettingsGroup',
          message: `Failed to set subagent settings: ${error instanceof Error ? error.message : String(error)}`
        })
      })
  }, [])

  if (failed) {
    return (
      <SettingsGroup title="Sub-agents">
        <SettingsNotice>
          Could not read the sub-agent settings. Agent chats keep working.
        </SettingsNotice>
      </SettingsGroup>
    )
  }
  if (!view) {
    return (
      <SettingsGroup title="Sub-agents">
        <SettingsNotice>Loading sub-agent settings…</SettingsNotice>
      </SettingsGroup>
    )
  }

  return (
    <>
      <SettingsGroup title="Sub-agents">
        <SettingsCard>
          <SettingsSwitchRow
            id="subagent-enabled"
            label="Let agents start other agents"
            description="An agent chat can hand parts of a task to your other installed agents. Their approvals come to this chat."
            checked={view.enabled}
            onToggle={(enabled) => write({ enabled })}
          />
          <SettingsRow
            id="subagent-max-running"
            describes="subagent-max-running"
            label="Max running sub-agents"
            description="Per chat. Extra starts are refused until one finishes."
          >
            <SettingsStepper
              value={view.maxRunning}
              min={MIN_RUNNING}
              max={MAX_RUNNING}
              decrementLabel="Fewer running sub-agents"
              incrementLabel="More running sub-agents"
              onValueChange={(maxRunning) => write({ maxRunning })}
            />
          </SettingsRow>
          <SettingsRow
            id="subagent-max-depth"
            describes="subagent-max-depth"
            label="Max depth"
            description="How many levels of sub-agents can start their own sub-agents. 1 means sub-agents cannot start more."
          >
            <SettingsStepper
              value={view.maxDepth}
              min={MIN_DEPTH}
              max={MAX_DEPTH}
              decrementLabel="Less depth"
              incrementLabel="More depth"
              onValueChange={(maxDepth) => write({ maxDepth })}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsGroup>
      <SettingsGroup
        title="Agents they can use"
        footnote="Only agents installed on this machine are listed."
      >
        <SettingsCard>
          {view.agents.length === 0 ? (
            <SettingsRow
              label="No agents yet"
              description="Install an agent and it appears here."
            />
          ) : (
            view.agents.map((agent) => (
              <Fragment key={agent.agentId}>
                <AllowedAgentRow
                  agent={agent}
                  onToggle={(allowed) => write({ agents: [{ agentId: agent.agentId, allowed }] })}
                />
                {agent.allowed && (
                  <DefaultModelRow
                    agent={agent}
                    onChange={(model) => write({ models: [{ agentId: agent.agentId, model }] })}
                  />
                )}
              </Fragment>
            ))
          )}
        </SettingsCard>
      </SettingsGroup>
    </>
  )
}
