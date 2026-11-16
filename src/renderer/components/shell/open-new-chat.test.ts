import { describe, expect, it } from 'vitest'
import { newChatKind } from './open-new-chat'

describe('newChatKind', () => {
  it('opens a project chat when a project is active', () => {
    expect(newChatKind('p1')).toBe('project')
  })

  it('opens a quick chat when no project is active', () => {
    expect(newChatKind('')).toBe('quick')
  })
})
