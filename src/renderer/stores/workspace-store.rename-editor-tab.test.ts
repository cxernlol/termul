import { beforeEach, describe, expect, it } from 'vitest'
import type { LeafNode, SplitNode } from '@/types/workspace.types'
import { useWorkspaceStore } from './workspace-store'
import { getAllLeafPanes } from './workspace-store/tree'

function editorTab(filePath: string): { type: 'editor'; id: string; filePath: string } {
  return { type: 'editor', id: `edit-${filePath}`, filePath }
}

function leaf(id: string, paths: string[], active: string | null): LeafNode {
  return {
    type: 'leaf',
    id,
    tabs: paths.map(editorTab),
    activeTabId: active ? `edit-${active}` : null
  }
}

function leaves(): LeafNode[] {
  return getAllLeafPanes(useWorkspaceStore.getState().root)
}

describe('workspace-store renameEditorTab', () => {
  beforeEach(() => {
    const split: SplitNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        leaf('pane-a', ['/p/a.ts', '/p/b.ts'], '/p/a.ts'),
        leaf('pane-b', ['/p/c.ts'], '/p/c.ts')
      ]
    }
    useWorkspaceStore.setState({ root: split, activePaneId: 'pane-a', fullscreenPaneId: null })
  })

  it('re-keys the tab in place, keeping its pane, position and active state', () => {
    useWorkspaceStore.getState().renameEditorTab('/p/a.ts', '/p/renamed.ts')

    const [paneA, paneB] = leaves()
    expect(paneA.tabs).toEqual([editorTab('/p/renamed.ts'), editorTab('/p/b.ts')])
    expect(paneA.activeTabId).toBe('edit-/p/renamed.ts')
    expect(paneB.tabs).toEqual([editorTab('/p/c.ts')])
  })

  it('leaves the active tab alone when a background tab is renamed', () => {
    useWorkspaceStore.getState().renameEditorTab('/p/b.ts', '/p/z.ts')

    const [paneA] = leaves()
    expect(paneA.tabs).toEqual([editorTab('/p/a.ts'), editorTab('/p/z.ts')])
    expect(paneA.activeTabId).toBe('edit-/p/a.ts')
  })

  it('replaces a tab already open at the destination, in any pane', () => {
    useWorkspaceStore.getState().renameEditorTab('/p/a.ts', '/p/c.ts')

    const [paneA, paneB] = leaves()
    expect(paneA.tabs).toEqual([editorTab('/p/c.ts'), editorTab('/p/b.ts')])
    expect(paneB?.tabs ?? []).toEqual([])
  })

  it('ignores a path with no open tab', () => {
    const before = useWorkspaceStore.getState().root

    useWorkspaceStore.getState().renameEditorTab('/p/missing.ts', '/p/other.ts')

    expect(useWorkspaceStore.getState().root).toBe(before)
  })
})
