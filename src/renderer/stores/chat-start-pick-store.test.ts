import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStartPickStore } from './chat-start-pick-store'

const pick = {
  isolationMode: 'current' as const,
  existingWorktreeId: null,
  baseBranch: null
}

beforeEach(() => useChatStartPickStore.setState({ picks: {} }))

describe('useChatStartPickStore', () => {
  it('prunes the picks of sessions that are gone and keeps the rest', () => {
    const { setPick, prune } = useChatStartPickStore.getState()
    setPick('a', pick)
    setPick('b', pick)
    prune(new Set(['b']))
    expect(Object.keys(useChatStartPickStore.getState().picks)).toEqual(['b'])
  })

  it('keeps the same state when nothing is gone', () => {
    useChatStartPickStore.getState().setPick('a', pick)
    const before = useChatStartPickStore.getState().picks
    useChatStartPickStore.getState().prune(new Set(['a', 'other']))
    expect(useChatStartPickStore.getState().picks).toBe(before)
  })
})
