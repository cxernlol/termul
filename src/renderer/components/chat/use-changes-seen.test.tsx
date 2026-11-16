import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChangesSeenStore } from '@/stores/changes-seen-store'
import { useGitSheetStore } from '@/stores/git-sheet-store'
import { useProjectStore } from '@/stores/project-store'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import type { Project } from '@/types/project'
import { changesFingerprint, useChangesSeen } from './use-changes-seen'
import type { ChangedFile } from './use-chat-changed-files'

const file = (path: string, added = 1, removed = 0): ChangedFile => ({
  path,
  status: 'modified',
  added,
  removed
})

const A = [file('/w/a.ts')]
const WORKTREE = '/w/.termul/worktrees/feature'

const project = {
  id: 'p1',
  name: 'One',
  path: '/w',
  color: 'blue',
  isGitRepo: true,
  worktrees: [
    {
      id: 'w1',
      name: 'feature',
      branch: 'feat/x',
      path: WORKTREE,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ]
} as Project

function render(files: readonly ChangedFile[] = A, projectId: string | null = 'p1', cwd = '/w') {
  return renderHook(
    (props: { files: readonly ChangedFile[] }) =>
      useChangesSeen({ sessionId: 's1', cwd, projectId, files: props.files }),
    { initialProps: { files } }
  )
}

beforeEach(() => {
  localStorage.clear()
  useChangesSeenStore.setState({ seen: {}, order: [] })
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ sidePanelVisible: false, lastColumnTabByProject: {} })
  useGitSheetStore.setState({ open: false, cwd: '', projectId: '' })
  useProjectStore.setState({ projects: [project], activeProjectId: 'p1' })
})

describe('changesFingerprint', () => {
  it('sorts path:added:removed:status lines', () => {
    expect(changesFingerprint([file('/w/b.ts', 2, 1), file('/w/a.ts')])).toBe(
      '/w/a.ts:1:0:modified\n/w/b.ts:2:1:modified'
    )
  })

  it('does not depend on the file order', () => {
    expect(changesFingerprint([file('/w/b.ts'), file('/w/a.ts')])).toBe(
      changesFingerprint([file('/w/a.ts'), file('/w/b.ts')])
    )
  })
})

describe('useChangesSeen', () => {
  it('is new on the first render when files exist', () => {
    expect(render().result.current.hasNew).toBe(true)
  })

  it('is not new without files', () => {
    expect(render([]).result.current.hasNew).toBe(false)
  })

  it('markSeen clears it, and a different fingerprint brings it back', () => {
    const { result, rerender } = render()
    act(() => result.current.markSeen())
    expect(result.current.hasNew).toBe(false)
    rerender({ files: [file('/w/a.ts', 5, 0)] })
    expect(result.current.hasNew).toBe(true)
  })

  it('keeps the seen state across a remount', () => {
    const first = render()
    act(() => first.result.current.markSeen())
    first.unmount()
    expect(render().result.current.hasNew).toBe(false)
  })

  it('marks seen by itself while the Git tab shows on desktop', () => {
    const { result } = render()
    expect(result.current.hasNew).toBe(true)
    act(() => {
      useShellLayoutStore.setState({
        sidePanelVisible: true,
        lastColumnTabByProject: { p1: 'changes' }
      })
    })
    expect(result.current.hasNew).toBe(false)
  })

  it('does not mark seen when the side panel is hidden or on another tab', () => {
    useShellLayoutStore.setState({
      sidePanelVisible: false,
      lastColumnTabByProject: { p1: 'changes' }
    })
    expect(render().result.current.hasNew).toBe(true)
    useShellLayoutStore.setState({
      sidePanelVisible: true,
      lastColumnTabByProject: { p1: 'files' }
    })
    expect(render().result.current.hasNew).toBe(true)
  })

  it('marks seen when new changes arrive while the Git tab shows', () => {
    useShellLayoutStore.setState({
      sidePanelVisible: true,
      lastColumnTabByProject: { p1: 'changes' }
    })
    const { result, rerender } = render()
    expect(result.current.hasNew).toBe(false)
    rerender({ files: [file('/w/a.ts'), file('/w/b.ts')] })
    expect(result.current.hasNew).toBe(false)
  })

  it('does not mark seen while the Git tab shows another worktree of the project', () => {
    useShellLayoutStore.setState({
      sidePanelVisible: true,
      lastColumnTabByProject: { p1: 'changes' }
    })
    useShellLayoutStore.setState({ worktreePickByProject: { p1: WORKTREE } })
    expect(render().result.current.hasNew).toBe(true)
    expect(render([file(`${WORKTREE}/a.ts`)], 'p1', WORKTREE).result.current.hasNew).toBe(false)
  })

  it('does not mark seen for a worktree chat while the Git tab shows the project folder', () => {
    useShellLayoutStore.setState({
      sidePanelVisible: true,
      lastColumnTabByProject: { p1: 'changes' }
    })
    expect(render([file(`${WORKTREE}/a.ts`)], 'p1', WORKTREE).result.current.hasNew).toBe(true)
  })

  it('marks seen for a chat in a subfolder of the folder the Git tab shows', () => {
    useShellLayoutStore.setState({
      sidePanelVisible: true,
      lastColumnTabByProject: { p1: 'changes' }
    })
    expect(render(A, 'p1', '/w/packages/app').result.current.hasNew).toBe(false)
  })

  it('does not mark seen while another project is active', () => {
    useShellLayoutStore.setState({
      sidePanelVisible: true,
      lastColumnTabByProject: { p1: 'changes' }
    })
    useProjectStore.setState({ activeProjectId: 'p2' })
    expect(render().result.current.hasNew).toBe(true)
  })

  it('marks seen when the phone Git sheet opens on this folder', () => {
    const { result } = render()
    act(() => useGitSheetStore.setState({ open: true, cwd: '/other', projectId: 'p1' }))
    expect(result.current.hasNew).toBe(true)
    act(() => useGitSheetStore.setState({ open: true, cwd: '/w', projectId: 'p1' }))
    expect(result.current.hasNew).toBe(false)
  })

  it('ignores the desktop Git tab without a project id', () => {
    useShellLayoutStore.setState({
      sidePanelVisible: true,
      lastColumnTabByProject: { '': 'changes' }
    })
    expect(render(A, null).result.current.hasNew).toBe(true)
  })
})
