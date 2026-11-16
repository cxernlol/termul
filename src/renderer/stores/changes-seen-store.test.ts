import { beforeEach, describe, expect, it } from 'vitest'
import {
  CHANGES_SEEN_STORAGE_KEY,
  MAX_SEEN_SESSIONS,
  useChangesSeenStore
} from './changes-seen-store'

beforeEach(() => {
  localStorage.clear()
  useChangesSeenStore.setState({ seen: {}, order: [] })
})

describe('changes-seen store', () => {
  it('stores the fingerprint per chat', () => {
    const { markSeen } = useChangesSeenStore.getState()
    markSeen('s1', 'a')
    markSeen('s2', 'b')
    expect(useChangesSeenStore.getState().seen).toEqual({ s1: 'a', s2: 'b' })
    expect(useChangesSeenStore.getState().order).toEqual(['s1', 's2'])
  })

  it('keeps the latest 200 chats and drops the oldest', () => {
    const { markSeen } = useChangesSeenStore.getState()
    for (let i = 0; i < MAX_SEEN_SESSIONS + 5; i++) markSeen(`s${i}`, `f${i}`)
    const { seen, order } = useChangesSeenStore.getState()
    expect(Object.keys(seen)).toHaveLength(MAX_SEEN_SESSIONS)
    expect(seen.s0).toBeUndefined()
    expect(seen.s4).toBeUndefined()
    expect(seen.s5).toBe('f5')
    expect(order[0]).toBe('s5')
    expect(order.at(-1)).toBe(`s${MAX_SEEN_SESSIONS + 4}`)
  })

  it('a chat marked again moves to the newest slot', () => {
    const { markSeen } = useChangesSeenStore.getState()
    for (let i = 0; i < MAX_SEEN_SESSIONS; i++) markSeen(`s${i}`, 'x')
    markSeen('s0', 'y')
    markSeen('new', 'z')
    const { seen } = useChangesSeenStore.getState()
    expect(seen.s0).toBe('y')
    expect(seen.s1).toBeUndefined()
  })

  it('persists to local storage', () => {
    useChangesSeenStore.getState().markSeen('s1', 'a:1:0:modified')
    const stored = JSON.parse(localStorage.getItem(CHANGES_SEEN_STORAGE_KEY) ?? '{}')
    expect(stored.state.seen).toEqual({ s1: 'a:1:0:modified' })
  })
})
