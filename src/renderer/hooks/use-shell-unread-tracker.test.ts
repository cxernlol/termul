import { describe, expect, it } from 'vitest'
import type { LeafNode, PaneNode, SplitNode } from '@/types/workspace.types'
import { activeChatSessionIds } from './use-shell-unread-tracker'

function chatLeaf(id: string, sessionId: string | null, extra: LeafNode['tabs'] = []): LeafNode {
  const tabs: LeafNode['tabs'] = [...extra]
  if (sessionId) tabs.push({ type: 'agent-chat', id: `chat-${sessionId}`, sessionId })
  return {
    type: 'leaf',
    id,
    tabs,
    activeTabId: sessionId ? `chat-${sessionId}` : (tabs[0]?.id ?? null)
  }
}

function split(id: string, children: PaneNode[]): SplitNode {
  return {
    type: 'split',
    id,
    direction: 'horizontal',
    children,
    sizes: children.map(() => 100 / children.length)
  }
}

describe('activeChatSessionIds', () => {
  it('returns every leaf active chat on desktop', () => {
    const root = split('s', [
      chatLeaf('a', 'sa'),
      split('inner', [chatLeaf('b', 'sb'), chatLeaf('c', 'sc')])
    ])

    expect(activeChatSessionIds(root, 'a', false)).toEqual(['sa', 'sb', 'sc'])
  })

  it('ignores a leaf whose active tab is not an agent chat', () => {
    const git: LeafNode['tabs'] = [{ type: 'git', id: 'git-1', cwd: '/x' }]
    const root = split('s', [chatLeaf('a', 'sa'), chatLeaf('b', null, git)])

    expect(activeChatSessionIds(root, 'a', false)).toEqual(['sa'])
  })

  it('ignores chat tabs that are not the active tab of their leaf', () => {
    const background: LeafNode = {
      type: 'leaf',
      id: 'a',
      tabs: [
        { type: 'agent-chat', id: 'chat-bg', sessionId: 'bg' },
        { type: 'git', id: 'git-1', cwd: '/x' }
      ],
      activeTabId: 'git-1'
    }

    expect(activeChatSessionIds(background, 'a', false)).toEqual([])
  })

  it('returns only the mobile active leaf chat on the mobile web shell', () => {
    const root = split('s', [chatLeaf('a', 'sa'), chatLeaf('b', 'sb')])

    expect(activeChatSessionIds(root, 'b', true)).toEqual(['sb'])
  })

  it('falls back to the first leaf on mobile when activePaneId matches nothing', () => {
    const root = split('s', [chatLeaf('a', 'sa'), chatLeaf('b', 'sb')])

    expect(activeChatSessionIds(root, 'missing', true)).toEqual(['sa'])
    expect(activeChatSessionIds(root, null, true)).toEqual(['sa'])
  })

  it('returns an empty list for a single non-chat leaf', () => {
    const git: LeafNode['tabs'] = [{ type: 'git', id: 'git-1', cwd: '/x' }]

    expect(activeChatSessionIds(chatLeaf('a', null, git), 'a', true)).toEqual([])
  })
})
