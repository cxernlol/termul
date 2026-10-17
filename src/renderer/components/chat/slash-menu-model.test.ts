import { describe, expect, it } from 'vitest'
import type { AvailableCommand, SessionConfigOption, SessionModeState } from '@/lib/acp-api'
import { commandToken, fileToken, SKILL_PAD_CHAR, skillToken } from '@/lib/skill-tokens'
import type { AgentSkillSummary } from '@/lib/skills-api'
import {
  applyCommandToInput,
  buildSlashSections,
  findSlashTrigger,
  isSlashTrigger,
  isSlashTriggerAny,
  type SlashConfigItem,
  type SlashModeItem,
  slashFilter
} from './slash-menu-model'

const commands: AvailableCommand[] = [
  { name: 'compact', description: 'Compact the conversation' },
  { name: 'research', description: 'Deep research' }
]

const configOptions: SessionConfigOption[] = [
  {
    id: 'mode',
    name: 'Session Mode',
    category: 'mode',
    type: 'select',
    currentValue: 'ask',
    description: null,
    options: [
      { value: 'ask', name: 'Ask', description: null },
      { value: 'code', name: 'Code', description: null }
    ]
  },
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'm1',
    description: null,
    options: [
      { value: 'm1', name: 'Sonnet', description: null },
      { value: 'm2', name: 'Opus', description: null }
    ]
  }
]

const modes: SessionModeState = {
  currentModeId: 'ask',
  availableModes: [
    { id: 'ask', name: 'Ask' },
    { id: 'code', name: 'Code' }
  ]
}

const skills: AgentSkillSummary[] = [
  {
    name: 'investigate',
    description: 'Run an investigation',
    scope: 'project',
    path: '/work/.agents/skills/investigate/SKILL.md'
  },
  {
    name: 'review',
    description: 'Review code',
    scope: 'global',
    path: '/home/u/.agents/skills/review/SKILL.md'
  }
]

describe('slash trigger detection', () => {
  it('opens on a lone slash and a leading slash token', () => {
    expect(isSlashTrigger('/')).toBe(true)
    expect(isSlashTrigger('/com')).toBe(true)
  })
  it('does not open mid-text or with whitespace', () => {
    expect(isSlashTrigger('ab/')).toBe(false)
    expect(isSlashTrigger('/com mand')).toBe(false)
    expect(isSlashTrigger('hello')).toBe(false)
    expect(isSlashTrigger('')).toBe(false)
  })
  it('extracts the filter after the slash', () => {
    expect(slashFilter('/com')).toBe('com')
    expect(slashFilter('/')).toBe('')
  })
  it('applyCommandToInput replaces the slash token', () => {
    expect(applyCommandToInput('/com', 'compact')).toBe('/compact ')
    expect(applyCommandToInput('/', 'research')).toBe('/research ')
  })
})

describe('mid-text slash trigger detection', () => {
  it('findSlashTrigger detects a leading slash token', () => {
    const result = findSlashTrigger('/com')
    expect(result).toEqual({ start: 0, end: 4, filter: 'com' })
  })
  it('findSlashTrigger detects a lone leading slash', () => {
    const result = findSlashTrigger('/')
    expect(result).toEqual({ start: 0, end: 1, filter: '' })
  })
  it('findSlashTrigger detects a mid-text slash after whitespace', () => {
    const result = findSlashTrigger('hello /comp')
    expect(result).toEqual({ start: 6, end: 11, filter: 'comp' })
  })
  it('findSlashTrigger detects a mid-text lone slash after whitespace', () => {
    const result = findSlashTrigger('hello /')
    expect(result).toEqual({ start: 6, end: 7, filter: '' })
  })
  it('findSlashTrigger returns null for slash without preceding whitespace', () => {
    expect(findSlashTrigger('hello/')).toBeNull()
    expect(findSlashTrigger('ab/comp')).toBeNull()
  })
  it('findSlashTrigger returns null for plain text', () => {
    expect(findSlashTrigger('hello')).toBeNull()
    expect(findSlashTrigger('')).toBeNull()
  })
  it('findSlashTrigger follows the caret inside a token and ignores text after it', () => {
    expect(findSlashTrigger('hello /comp', 8)).toEqual({ start: 6, end: 8, filter: 'c' })
    expect(findSlashTrigger('hello /comp', 11)).toEqual({ start: 6, end: 11, filter: 'comp' })
    expect(findSlashTrigger('hello /comp more', 11)).toEqual({
      start: 6,
      end: 11,
      filter: 'comp'
    })
    expect(findSlashTrigger('line one\n/skill please', 15)).toEqual({
      start: 9,
      end: 15,
      filter: 'skill'
    })
    expect(findSlashTrigger('hello /comp', 5)).toBeNull()
    expect(findSlashTrigger('hello /comp more', 16)).toBeNull()
    expect(findSlashTrigger('src/components', 4)).toBeNull()
  })

  it('findSlashTrigger opens when / is glued to a pill', () => {
    const skill = skillToken('design', SKILL_PAD_CHAR)
    const skillValue = `${skill}/design`
    expect(findSlashTrigger(skillValue, skillValue.length)).toEqual({
      start: skill.length,
      end: skillValue.length,
      filter: 'design'
    })
    const command = commandToken('compact')
    const commandValue = `${command}/clear`
    expect(findSlashTrigger(commandValue, commandValue.length)).toEqual({
      start: command.length,
      end: commandValue.length,
      filter: 'clear'
    })
    const file = fileToken('auth.ts', '/work/auth.ts')
    const fileValue = `${file}/lint`
    expect(findSlashTrigger(fileValue, fileValue.length)).toEqual({
      start: file.length,
      end: fileValue.length,
      filter: 'lint'
    })
  })

  it('isSlashTriggerAny detects both leading and mid-text triggers', () => {
    expect(isSlashTriggerAny('/')).toBe(true)
    expect(isSlashTriggerAny('/com')).toBe(true)
    expect(isSlashTriggerAny('hello /comp')).toBe(true)
    expect(isSlashTriggerAny('hello /')).toBe(true)
    expect(isSlashTriggerAny('hello/')).toBe(false)
    expect(isSlashTriggerAny('hello')).toBe(false)
    expect(isSlashTriggerAny('')).toBe(false)
  })

  it('slashFilter extracts filter from mid-text triggers', () => {
    expect(slashFilter('hello /comp')).toBe('comp')
    expect(slashFilter('hello /')).toBe('')
    expect(slashFilter('ab/')).toBe('')
  })
})

describe('buildSlashSections', () => {
  it('lists skills before commands', () => {
    const sections = buildSlashSections({
      commands,
      configOptions: [],
      modes: null,
      skills,
      filter: ''
    })
    expect(sections[0].id).toBe('skills')
    expect(sections[1].id).toBe('commands')
  })

  it('threads each skill SKILL.md path onto the skill items (for the wire prompt)', () => {
    const sections = buildSlashSections({
      commands: [],
      configOptions: [],
      modes: null,
      skills,
      filter: ''
    })
    const skillItems = sections[0].items
    expect(skillItems.every((i) => i.kind === 'skill')).toBe(true)
    expect(skillItems.map((i) => (i.kind === 'skill' ? i.path : ''))).toEqual([
      '/work/.agents/skills/investigate/SKILL.md',
      '/home/u/.agents/skills/review/SKILL.md'
    ])
  })

  it('lists commands first when no skills', () => {
    const sections = buildSlashSections({ commands, configOptions: [], modes: null, filter: '' })
    expect(sections[0].id).toBe('commands')
    expect(sections[0].items).toHaveLength(2)
  })

  it('hides an ACP command whose name matches an installed skill (skill wins)', () => {
    // A skill named `compact` collides with the `compact` command. The skill
    // stays and the command is dropped, so the name appears once (Skills).
    const overlapping: AgentSkillSummary[] = [
      {
        name: 'compact',
        description: 'A skill called compact',
        scope: 'project',
        path: '/work/.agents/skills/compact/SKILL.md'
      },
      {
        name: 'investigate',
        description: 'Run an investigation',
        scope: 'project',
        path: '/work/.agents/skills/investigate/SKILL.md'
      }
    ]
    const sections = buildSlashSections({
      commands,
      configOptions: [],
      modes: null,
      skills: overlapping,
      filter: ''
    })
    const skillNames = sections
      .find((s) => s.id === 'skills')!
      .items.map((i) => (i.kind === 'skill' ? i.name : ''))
    expect(skillNames).toEqual(['compact', 'investigate'])
    const commandNames = sections
      .find((s) => s.id === 'commands')!
      .items.map((i) => (i.kind === 'command' ? i.name : ''))
    expect(commandNames).toEqual(['research'])
  })

  it('hides a harness `skill:<name>` command when that skill is installed', () => {
    // Agents like Devin re-promote discovered skills as `skill:<name>`
    // commands. The disk skill is the row the user picks, so the mirrored
    // command is dropped.
    const promoted: AvailableCommand[] = [
      { name: 'skill:investigate', description: 'Run an investigation' },
      { name: 'compact', description: 'Compact the conversation' }
    ]
    const sections = buildSlashSections({
      commands: promoted,
      configOptions: [],
      modes: null,
      skills,
      filter: ''
    })
    const skillNames = sections
      .find((s) => s.id === 'skills')!
      .items.map((i) => (i.kind === 'skill' ? i.name : ''))
    expect(skillNames).toEqual(['investigate', 'review'])
    const commandNames = sections
      .find((s) => s.id === 'commands')!
      .items.map((i) => (i.kind === 'command' ? i.name : ''))
    expect(commandNames).toEqual(['compact'])
  })

  it('keeps `skill:` commands for skills termul did not discover', () => {
    const promoted: AvailableCommand[] = [
      { name: 'skill:agent-only', description: 'Agent builtin skill' },
      { name: 'skill:investigate', description: 'Run an investigation' }
    ]
    const sections = buildSlashSections({
      commands: promoted,
      configOptions: [],
      modes: null,
      skills,
      filter: ''
    })
    const skillNames = sections
      .find((s) => s.id === 'skills')!
      .items.map((i) => (i.kind === 'skill' ? i.name : ''))
    expect(skillNames).toEqual(['investigate', 'review'])
    const commandNames = sections
      .find((s) => s.id === 'commands')!
      .items.map((i) => (i.kind === 'command' ? i.name : ''))
    expect(commandNames).toEqual(['skill:agent-only'])
  })

  it('hides `skill:` mirrors case-insensitively and keeps the installed skills', () => {
    const promoted: AvailableCommand[] = [
      { name: 'Skill:Investigate', description: null },
      { name: 'SKILL:REVIEW', description: null }
    ]
    const sections = buildSlashSections({
      commands: promoted,
      configOptions: [],
      modes: null,
      skills,
      filter: ''
    })
    expect(sections.find((s) => s.id === 'commands')).toBeUndefined()
    expect(sections.find((s) => s.id === 'skills')!.items).toHaveLength(2)
  })

  it('hides a same-named command case-insensitively (skill wins)', () => {
    const sections = buildSlashSections({
      commands: [{ name: 'Investigate', description: 'Run an investigation' }],
      configOptions: [],
      modes: null,
      skills,
      filter: ''
    })
    const skillNames = sections
      .find((s) => s.id === 'skills')!
      .items.map((i) => (i.kind === 'skill' ? i.name : ''))
    expect(skillNames).toEqual(['investigate', 'review'])
    expect(sections.find((s) => s.id === 'commands')).toBeUndefined()
  })

  it('keeps a `skill:` command hidden when the text filter hides the skill row', () => {
    // The installed skill hides its mirror even if the filter does not show
    // the skill. Typing `/skill:` must not bring the duplicate command back.
    const promoted: AvailableCommand[] = [
      { name: 'skill:investigate', description: 'Run an investigation' },
      { name: 'skill:agent-only', description: 'Agent builtin skill' }
    ]
    const sections = buildSlashSections({
      commands: promoted,
      configOptions: [],
      modes: null,
      skills,
      filter: 'skill:'
    })
    expect(sections.find((s) => s.id === 'skills')).toBeUndefined()
    const commandNames = sections
      .find((s) => s.id === 'commands')!
      .items.map((i) => (i.kind === 'command' ? i.name : ''))
    expect(commandNames).toEqual(['skill:agent-only'])
  })

  it('keeps a skill visible when the same-named command fails the text filter', () => {
    const colliding: AgentSkillSummary[] = [
      {
        name: 'compact',
        description: 'A skill called compact',
        scope: 'project',
        path: '/work/.agents/skills/compact/SKILL.md'
      }
    ]
    const sections = buildSlashSections({
      commands: [{ name: 'compact', description: 'Compact the conversation' }],
      configOptions: [],
      modes: null,
      skills: colliding,
      filter: 'skill called'
    })
    const skillNames = sections
      .find((s) => s.id === 'skills')!
      .items.map((i) => (i.kind === 'skill' ? i.name : ''))
    expect(skillNames).toEqual(['compact'])
    expect(sections.find((s) => s.id === 'commands')).toBeUndefined()
  })

  it('hides both a same-named command and its `skill:` mirror', () => {
    const colliding: AgentSkillSummary[] = [
      {
        name: 'compact',
        description: 'A skill called compact',
        scope: 'project',
        path: '/work/.agents/skills/compact/SKILL.md'
      }
    ]
    const promoted: AvailableCommand[] = [
      { name: 'compact', description: 'Compact the conversation' },
      { name: 'skill:compact', description: 'Promoted mirror' }
    ]
    const sections = buildSlashSections({
      commands: promoted,
      configOptions: [],
      modes: null,
      skills: colliding,
      filter: ''
    })
    const skillNames = sections
      .find((s) => s.id === 'skills')!
      .items.map((i) => (i.kind === 'skill' ? i.name : ''))
    expect(skillNames).toEqual(['compact'])
    expect(sections.find((s) => s.id === 'commands')).toBeUndefined()
  })

  it('keeps `skill:` commands when no skills are injected', () => {
    const sections = buildSlashSections({
      commands: [{ name: 'skill:investigate', description: 'Promoted mirror' }],
      configOptions: [],
      modes: null,
      filter: ''
    })
    const commandNames = sections
      .find((s) => s.id === 'commands')!
      .items.map((i) => (i.kind === 'command' ? i.name : ''))
    expect(commandNames).toEqual(['skill:investigate'])
  })

  it('renders one section per config option with category headings', () => {
    const sections = buildSlashSections({ commands: [], configOptions, modes, filter: '' })
    const ids = sections.map((s) => s.id)
    expect(ids).toContain('config:mode')
    expect(ids).toContain('config:model')
    const modeSection = sections.find((s) => s.id === 'config:mode')!
    expect(modeSection.heading).toBe('Mode')
    expect(sections.find((s) => s.id === 'config:model')!.heading).toBe('Model')
  })

  it('PRECEDENCE: omits legacy modes when configOptions exist', () => {
    const sections = buildSlashSections({ commands: [], configOptions, modes, filter: '' })
    expect(sections.find((s) => s.id === 'modes')).toBeUndefined()
  })

  it('falls back to legacy modes only when no configOptions', () => {
    const sections = buildSlashSections({ commands: [], configOptions: [], modes, filter: '' })
    const modeSection = sections.find((s) => s.id === 'modes')
    expect(modeSection).toBeDefined()
    expect(modeSection!.items).toHaveLength(2)
    expect((modeSection!.items[0] as SlashModeItem).kind).toBe('mode')
  })

  it('marks the current config value and mode as selected', () => {
    const cfg = buildSlashSections({ commands: [], configOptions, modes: null, filter: '' })
    const modeItems = cfg.find((s) => s.id === 'config:mode')!.items as SlashConfigItem[]
    expect(modeItems.find((i) => i.valueId === 'ask')!.selected).toBe(true)
    expect(modeItems.find((i) => i.valueId === 'code')!.selected).toBe(false)
  })

  it('filters across commands and option values', () => {
    const sections = buildSlashSections({ commands, configOptions, modes: null, filter: 'opus' })
    // only the model option's "Opus" value matches
    expect(sections.find((s) => s.id === 'commands')).toBeUndefined()
    const model = sections.find((s) => s.id === 'config:model')
    expect(model!.items).toHaveLength(1)
    expect((model!.items[0] as SlashConfigItem).label).toBe('Opus')
  })

  it('returns no sections when everything is empty', () => {
    expect(
      buildSlashSections({ commands: [], configOptions: [], modes: null, filter: '' })
    ).toEqual([])
  })
})
