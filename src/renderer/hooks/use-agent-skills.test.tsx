import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSkillSummary } from '@/lib/skills-api'
import { useAgentSkills } from './use-agent-skills'

const listSkills = vi.fn()

vi.mock('@/lib/skills-api', () => ({
  skillsApi: {
    listSkills: (...args: unknown[]) => listSkills(...args)
  }
}))

vi.mock('@/lib/log-api', () => ({
  logFrontendError: vi.fn()
}))

function skill(name: string, scope: 'global' | 'project'): AgentSkillSummary {
  return {
    name,
    description: name,
    scope,
    path: `/${scope}/${name}/SKILL.md`
  }
}

describe('useAgentSkills', () => {
  beforeEach(() => {
    listSkills.mockReset()
  })

  it('clears project skills in the same update as a project path change', async () => {
    let resolveFirst: (skills: AgentSkillSummary[]) => void = () => {}
    listSkills.mockImplementation((root?: string) => {
      if (root === '/proj-a') {
        return new Promise<AgentSkillSummary[]>((resolve) => {
          resolveFirst = resolve
        })
      }
      return Promise.resolve([skill('from-b', 'project')])
    })

    const { result, rerender } = renderHook(({ root }: { root: string }) => useAgentSkills(root), {
      initialProps: { root: '/proj-a' }
    })

    resolveFirst([skill('from-a', 'project')])
    await waitFor(() => {
      expect(result.current.skills.map((item) => item.name)).toEqual(['from-a'])
    })
    expect(result.current.loading).toBe(false)

    rerender({ root: '/proj-b' })

    expect(result.current.skills).toEqual([])
    expect(result.current.loading).toBe(true)
    await waitFor(() => {
      expect(result.current.skills.map((item) => item.name)).toEqual(['from-b'])
    })
    expect(result.current.loading).toBe(false)
  })
})
