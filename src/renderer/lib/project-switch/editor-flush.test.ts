import { describe, expect, it, vi } from 'vitest'

const { flush } = vi.hoisted(() => ({ flush: vi.fn(async () => ({ saved: [], failed: [] })) }))
vi.mock('@/lib/editor-auto-save', () => ({ flushPendingAutoSaves: flush }))

import { flushEditorWork } from './editor-flush'

describe('flushEditorWork', () => {
  it('waits for the pending autosaves before it resolves', async () => {
    let release: () => void = () => {}
    flush.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ saved: ['a'], failed: [] })
        })
    )
    let done = false
    const pending = flushEditorWork().then(() => {
      done = true
    })
    await Promise.resolve()
    expect(done).toBe(false)
    release()
    await pending
    expect(done).toBe(true)
  })
})
