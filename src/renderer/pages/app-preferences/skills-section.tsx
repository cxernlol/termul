import { useCallback } from 'react'
import { Sparkles } from '@/components/icons'
import { SettingsSection } from '@/components/settings/SettingsLayout'
import { Button } from '@/components/ui/button'
import { useAgentSkills } from '@/hooks/use-agent-skills'
import { logFrontendError } from '@/lib/log-api'
import type { AgentSkillSummary } from '@/lib/skills-api'
import { useEditorStore } from '@/stores/editor-store'
import { useActiveProject } from '@/stores/project-store'
import { useSettingsModalStore } from '@/stores/settings-modal-store'
import { useWorkspaceStore } from '@/stores/workspace-store'

function skillsIn(skills: AgentSkillSummary[], scope: 'global' | 'project'): AgentSkillSummary[] {
  return skills.filter((skill) => skill.scope === scope)
}

function SkillRows({ skills }: { skills: AgentSkillSummary[] }): React.JSX.Element {
  const openSkill = useCallback(async (skill: AgentSkillSummary) => {
    try {
      await useEditorStore.getState().openFile(skill.path)
      if (!useEditorStore.getState().openFiles.has(skill.path)) {
        throw new Error('editor tab limit reached')
      }
      useWorkspaceStore.getState().addEditorTab(skill.path)
      useSettingsModalStore.getState().close()
    } catch (err) {
      void logFrontendError({
        level: 'warn',
        source: 'SkillsSection',
        message: `Failed to open skill '${skill.name}': ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }, [])

  if (skills.length === 0) {
    return <p className="text-sm text-muted-foreground">No skills in this folder.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {skills.map((skill) => (
        <li
          key={`${skill.scope}:${skill.name}`}
          className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2"
        >
          <div className="min-w-0">
            <div className="truncate text-sm text-foreground">{skill.name}</div>
            {skill.description ? (
              <p className="truncate text-xs text-muted-foreground">{skill.description}</p>
            ) : null}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void openSkill(skill)}>
            Open
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function SkillsSection(): React.JSX.Element {
  const project = useActiveProject()
  const { skills: listed, loading } = useAgentSkills(project?.path)
  const skills = Array.isArray(listed) ? listed : []
  const globalSkills = skillsIn(skills, 'global')
  const projectSkills = skillsIn(skills, 'project')

  return (
    <SettingsSection id="skills">
      <div className="flex flex-col gap-6 border-b border-border pb-6 md:flex-row md:items-start">
        <div className="w-full pt-1 md:w-1/3">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <h2 className="text-lg font-medium text-foreground">Skills</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Skills installed in your home folder and in the open project. The slash menu uses this
            list.
          </p>
        </div>
        <div className="flex w-full flex-col gap-5 md:w-2/3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading skills…</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">Global</h3>
                <SkillRows skills={globalSkills} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  Project{project ? ` · ${project.name}` : ''}
                </h3>
                {project ? (
                  <SkillRows skills={projectSkills} />
                ) : (
                  <p className="text-sm text-muted-foreground">Open a project to see its skills.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </SettingsSection>
  )
}
