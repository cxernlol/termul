import { renderHook } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fileToken } from '@/lib/skill-tokens'
import { useChatComposer } from './use-chat-composer'
import type { ComposerMentions } from './use-composer-mentions'

/**
 * gh-896: a folder token (file token with a trailing-slash absPath) sends as
 * the relative path in plain text and never produces a `resource_link` block.
 */
function buildParts(value: string) {
  const mentions = {
    menuOpen: false,
    filter: '',
    sections: [],
    loading: false,
    menuRef: { current: null },
    update: vi.fn(),
    select: vi.fn(),
    reset: vi.fn()
  } as ComposerMentions
  const { result } = renderHook(() =>
    useChatComposer({
      value,
      setValue: vi.fn(),
      editorRef: { current: null } as MutableRefObject<null>,
      slashMenuRef: { current: null },
      commands: [],
      configOptions: [],
      modes: null,
      skills: [],
      disabled: false,
      onSetConfig: vi.fn(),
      onSetMode: vi.fn(),
      mentions,
      scheduleRestoreCaret: vi.fn()
    })
  )
  return result.current.buildPromptParts()
}

describe('useChatComposer.buildPromptParts — folder mentions', () => {
  it('sends a folder pick as the relative path text with no resource_link', () => {
    const folder = fileToken('src/renderer/components/', '/work/src/renderer/components/')
    const parts = buildParts(`look in ${folder} please`)
    expect(parts.wireText).toBe('look in src/renderer/components/ please')
    expect(parts.fileBlocks).toEqual([])
    // Display keeps the raw token so the transcript renders a folder chip.
    expect(parts.displayText).toContain(folder)
  })

  it('keeps file picks byte-identical: (display) plus one resource_link', () => {
    const file = fileToken('auth.ts', '/work/src/auth.ts')
    const folder = fileToken('src/', '/work/src/')
    const parts = buildParts(`${file} and ${folder}`)
    expect(parts.wireText).toBe('(auth.ts) and src/')
    expect(parts.fileBlocks).toHaveLength(1)
    expect(parts.fileBlocks[0]).toMatchObject({
      type: 'resource_link',
      uri: 'file:///work/src/auth.ts',
      name: 'auth.ts'
    })
  })
})
