import type { DirectoryEntry } from '@shared/types/filesystem.types'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filesystemApi } from '@/lib/api'
import { useFileExplorerStore } from '@/stores/file-explorer-store'
import { FileExplorer } from './FileExplorer'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

const renders = vi.hoisted(() => ({ rows: [] as string[], menus: 0 }))

vi.mock('./MaterialFileIcon', () => ({
  MaterialFileIcon: ({ name }: { name: string }) => {
    renders.rows.push(name)
    return null
  }
}))

vi.mock('@/components/ui/context-menu', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/ui/context-menu')>()
  const RealContent = original.ContextMenuContent
  return {
    ...original,
    ContextMenuContent: (props: React.ComponentProps<typeof RealContent>) => {
      renders.menus++
      return <RealContent {...props} />
    }
  }
})

vi.mock('@/stores/git-status-store', () => {
  const state = { statuses: {}, refreshStatus: vi.fn().mockResolvedValue(undefined) }
  return {
    useGitStatusStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      getState: () => state
    })
  }
})

function dir(path: string): DirectoryEntry {
  return {
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    type: 'directory',
    extension: null,
    size: 0,
    modifiedAt: 0
  }
}

function file(path: string): DirectoryEntry {
  return { ...dir(path), type: 'file', extension: '.ts', size: 1 }
}

const deletePath = vi.spyOn(filesystemApi, 'deletePath')

beforeEach(() => {
  deletePath.mockReset().mockResolvedValue({ success: true, data: undefined })
  vi.spyOn(filesystemApi, 'readDirectory').mockResolvedValue({ success: true, data: [] })
  toastError.mockClear()
  useFileExplorerStore.setState({
    rootPath: '/proj',
    directoryContents: new Map([
      ['/proj', [dir('/proj/a'), dir('/proj/b')]],
      ['/proj/a', [file('/proj/a/one.ts'), file('/proj/a/two.ts'), file('/proj/a/three.ts')]],
      ['/proj/b', [file('/proj/b/four.ts')]]
    ]),
    expandedDirs: new Set(['/proj', '/proj/a', '/proj/b']),
    loadingDirs: new Set(),
    selectedPaths: new Set(),
    lastClickedPath: null,
    clipboard: null,
    rootLoadError: null,
    suppressTreeAnimations: true
  })
  render(<FileExplorer />)
})

function row(path: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-path="${path}"]`)
  if (!element) throw new Error(`no tree row for ${path}`)
  return element
}

describe('FileExplorer tree rendering', () => {
  it('re-renders only the rows whose selection state changed', () => {
    renders.rows = []
    renders.menus = 0
    act(() => useFileExplorerStore.getState().selectPath('/proj/a/two.ts'))
    expect(renders.rows.sort()).toEqual(['a', 'two.ts'])
    expect(renders.menus).toBe(2)

    renders.rows = []
    renders.menus = 0
    act(() => useFileExplorerStore.getState().copySelected())
    expect(useFileExplorerStore.getState().clipboard).toEqual({
      type: 'copy',
      paths: ['/proj/a/two.ts']
    })
    expect(renders.rows).toEqual([])
    expect(renders.menus).toBe(0)
  })
})

describe('FileExplorer tree context menu', () => {
  it('counts the multi-selection made after the tree rendered', () => {
    fireEvent.click(row('/proj/a/one.ts'), { ctrlKey: true })
    fireEvent.click(row('/proj/a/three.ts'), { ctrlKey: true })
    fireEvent.contextMenu(row('/proj/a/three.ts'))

    expect(screen.getByRole('menuitem', { name: 'Copy (2)' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete (2)…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rename (1 item)' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('offers Paste on a folder once a row was copied', () => {
    fireEvent.contextMenu(row('/proj/a/one.ts'))
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.contextMenu(row('/proj/b'))
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument()
  })
})

describe('FileExplorer delete', () => {
  function selectRows(...paths: string[]): void {
    for (const path of paths) fireEvent.click(row(path), { ctrlKey: true })
  }

  async function confirmDelete(): Promise<void> {
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull())
  }

  it('deletes every selected entry from Delete (N) in the context menu', async () => {
    selectRows('/proj/a/one.ts', '/proj/a/two.ts', '/proj/b/four.ts')
    fireEvent.contextMenu(row('/proj/b/four.ts'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete (3)…' }))

    expect(await screen.findByText('Delete 3 items')).toBeInTheDocument()
    expect(
      screen.getByText('Delete "one.ts", "two.ts", "four.ts"? This cannot be undone.')
    ).toBeInTheDocument()
    await confirmDelete()

    expect(deletePath.mock.calls).toEqual([
      ['/proj/a/one.ts', { recursive: false }],
      ['/proj/a/two.ts', { recursive: false }],
      ['/proj/b/four.ts', { recursive: false }]
    ])
    expect(useFileExplorerStore.getState().selectedPaths.size).toBe(0)
  })

  it('deletes only the right-clicked entry when it is outside the selection', async () => {
    selectRows('/proj/a/one.ts', '/proj/a/two.ts')
    fireEvent.contextMenu(row('/proj/b/four.ts'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    await confirmDelete()

    expect(deletePath.mock.calls).toEqual([['/proj/b/four.ts', { recursive: false }]])
  })

  it('deletes the whole selection from the Delete key', async () => {
    selectRows('/proj/a/one.ts', '/proj/b/four.ts')
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(await screen.findByText('Delete 2 items')).toBeInTheDocument()
    await confirmDelete()

    expect(deletePath.mock.calls).toEqual([
      ['/proj/a/one.ts', { recursive: false }],
      ['/proj/b/four.ts', { recursive: false }]
    ])
  })

  it('keeps the entries that failed in the dialog and reports them', async () => {
    deletePath.mockImplementation(async (path) =>
      path.endsWith('two.ts')
        ? { success: false, error: 'busy' }
        : { success: true, data: undefined }
    )
    selectRows('/proj/a/one.ts', '/proj/a/two.ts', '/proj/b/four.ts')
    fireEvent.keyDown(document.body, { key: 'Delete' })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to delete /proj/a/two.ts: busy')
    )
    expect(deletePath).toHaveBeenCalledTimes(3)
    expect(screen.getByText('Delete "two.ts"? This cannot be undone.')).toBeInTheDocument()
  })
})
