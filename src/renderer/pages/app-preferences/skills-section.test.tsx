import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSkillSummary } from '@/lib/skills-api'
import { SkillsSection } from './skills-section'

const openFile = vi.fn()
const addEditorTab = vi.fn()
const closeSettings = vi.fn()
const skillsRef = { current: [] as AgentSkillSummary[] }
const projectRef = {
  current: { id: 'p1', name: 'Cloud Hello', path: '/tmp/termul-hello' } as
    | { id: string; name: string; path: string }
    | undefined
}

vi.mock('@/hooks/use-agent-skills', () => ({
  useAgentSkills: () => ({ skills: skillsRef.current, loading: false, reload: () => {} })
}))

vi.mock('@/stores/project-store', () => ({
  useActiveProject: () => projectRef.current
}))

vi.mock('@/stores/editor-store', () => ({
  useEditorStore: {
    getState: () => ({
      openFile,
      openFiles: new Map([['/home/u/.agents/skills/review/SKILL.md', {}]])
    })
  }
}))

vi.mock('@/stores/workspace-store', () => ({
  useWorkspaceStore: { getState: () => ({ addEditorTab }) }
}))

vi.mock('@/stores/settings-modal-store', () => ({
  useSettingsModalStore: { getState: () => ({ close: closeSettings }) }
}))

vi.mock('@/lib/log-api', () => ({
  logFrontendError: vi.fn()
}))

const globalSkill: AgentSkillSummary = {
  name: 'review',
  description: 'Review code',
  scope: 'global',
  path: '/home/u/.agents/skills/review/SKILL.md'
}

const projectSkill: AgentSkillSummary = {
  name: 'writing-guidelines',
  description: 'Review docs',
  scope: 'project',
  path: '/tmp/termul-hello/.agents/skills/writing-guidelines/SKILL.md'
}

describe('SkillsSection', () => {
  beforeEach(() => {
    skillsRef.current = [globalSkill, projectSkill]
    projectRef.current = { id: 'p1', name: 'Cloud Hello', path: '/tmp/termul-hello' }
    openFile.mockReset().mockResolvedValue(undefined)
    addEditorTab.mockReset()
    closeSettings.mockReset()
  })

  it('lists global and project skills for the open project', () => {
    render(<SkillsSection />)
    expect(screen.getByRole('heading', { name: 'Global' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Project · Cloud Hello' })).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
    expect(screen.getByText('writing-guidelines')).toBeInTheDocument()
  })

  it('opens the skill file and closes settings', async () => {
    render(<SkillsSection />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]!)
    await vi.waitFor(() => {
      expect(openFile).toHaveBeenCalledWith(globalSkill.path)
    })
    expect(addEditorTab).toHaveBeenCalledWith(globalSkill.path)
    expect(closeSettings).toHaveBeenCalled()
  })

  it('asks for a project when none is open', () => {
    projectRef.current = undefined
    skillsRef.current = [globalSkill]
    render(<SkillsSection />)
    expect(screen.getByText('Open a project to see its skills.')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
  })
})
