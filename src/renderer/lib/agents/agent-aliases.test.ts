import { describe, expect, it } from 'vitest'
import {
  canonicalAgentId,
  findStoredAgentConfig,
  isLegacyAgentId,
  legacyAgentIds,
  sameAgentId
} from '@/lib/agents/agent-aliases'

describe('agent aliases', () => {
  it('maps opencode-v2 to opencode and leaves other ids alone', () => {
    expect(canonicalAgentId('opencode-v2')).toBe('opencode')
    expect(canonicalAgentId('acp-registry:opencode-v2')).toBe('opencode')
    expect(canonicalAgentId('opencode')).toBe('opencode')
    expect(canonicalAgentId('gemini')).toBe('gemini')
    expect(isLegacyAgentId('opencode-v2')).toBe(true)
    expect(isLegacyAgentId('acp-registry:opencode-v2')).toBe(true)
    expect(isLegacyAgentId('opencode')).toBe(false)
    expect(legacyAgentIds('opencode')).toEqual(['opencode-v2'])
    expect(sameAgentId('acp-registry:opencode-v2', 'acp-registry:opencode')).toBe(true)
    expect(sameAgentId('opencode-v2', 'acp-registry:opencode')).toBe(true)
    expect(sameAgentId('opencode', 'acp-registry:opencode')).toBe(false)
    expect(sameAgentId('gemini', 'opencode')).toBe(false)
    expect(canonicalAgentId('toString')).toBe('toString')
  })

  it('keeps an exact saved config and falls back to the canonical config', () => {
    const legacy = { id: 'acp-registry:opencode-v2', command: '/legacy/opencode' }
    const canonical = { id: 'acp-registry:opencode', command: '/managed/opencode' }
    const gemini = { id: 'acp-registry:gemini', command: 'gemini' }
    expect(findStoredAgentConfig([legacy, canonical, gemini], legacy.id)).toBe(legacy)
    expect(findStoredAgentConfig([canonical, gemini], legacy.id)).toBe(canonical)
    expect(findStoredAgentConfig([gemini], 'acp-registry:gemini')).toBe(gemini)
    expect(findStoredAgentConfig([gemini], legacy.id)).toBeUndefined()
  })
})
