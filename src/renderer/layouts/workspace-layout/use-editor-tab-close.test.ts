import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  block: vi.fn(),
  saveFile: vi.fn(),
  closeFileIfIdle: vi.fn(),
  removeTab: vi.fn(),
  toastError: vi.fn(),
  openFiles: new Map<string, { isDirty: boolean; draftConflict?: unknown }>()
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('./draft-conflict-save-guard', () => ({ blockSaveOnDraftConflict: mocks.block }))
vi.mock('@/stores/editor-store', () => ({
  useEditorStore: {
    getState: () => ({
      openFiles: mocks.openFiles,
      saveFile: mocks.saveFile,
      closeFileIfIdle: mocks.closeFileIfIdle
    })
  }
}))
vi.mock('@/stores/workspace-store', () => ({
  editorTabId: (filePath: string) => `edit-${filePath}`,
  useWorkspaceStore: { getState: () => ({ removeTab: mocks.removeTab }) }
}))

import { useEditorTabClose } from './use-editor-tab-close'

const FILE = '/a.ts'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.openFiles = new Map()
  mocks.saveFile.mockResolvedValue(true)
  mocks.closeFileIfIdle.mockReturnValue(true)
  mocks.block.mockReturnValue(false)
})

describe('useEditorTabClose draft-conflicted files', () => {
  it('opens the unsaved-changes prompt for a conflicted (clean-buffer) file', () => {
    mocks.openFiles.set(FILE, { isDirty: false, draftConflict: { draftContent: 'd' } })
    const { result } = renderHook(() => useEditorTabClose())

    let opened = false
    act(() => {
      opened = result.current.handleCloseEditorTab(FILE)
    })

    expect(opened).toBe(true)
    expect(result.current.dirtyCloseFilePath).toBe(FILE)
    expect(mocks.closeFileIfIdle).not.toHaveBeenCalled()
  })

  it('Save on a conflicted file reveals it, saves and closes nothing, and dismisses the prompt', async () => {
    mocks.openFiles.set(FILE, { isDirty: false, draftConflict: { draftContent: 'd' } })
    mocks.block.mockReturnValue(true)
    const { result } = renderHook(() => useEditorTabClose())
    act(() => {
      result.current.handleCloseEditorTab(FILE)
    })

    await act(async () => {
      await result.current.handleSaveThenClose()
    })

    expect(mocks.block).toHaveBeenCalledWith([FILE])
    expect(mocks.saveFile).not.toHaveBeenCalled()
    expect(mocks.closeFileIfIdle).not.toHaveBeenCalled()
    expect(mocks.removeTab).not.toHaveBeenCalled()
    expect(result.current.dirtyCloseFilePath).toBeNull()
  })

  it('Discard still closes a conflicted file', () => {
    mocks.openFiles.set(FILE, { isDirty: false, draftConflict: { draftContent: 'd' } })
    const { result } = renderHook(() => useEditorTabClose())
    act(() => {
      result.current.handleCloseEditorTab(FILE)
    })

    act(() => {
      result.current.handleDiscardAndClose()
    })

    expect(mocks.closeFileIfIdle).toHaveBeenCalledWith(FILE)
    expect(mocks.removeTab).toHaveBeenCalledWith(`edit-${FILE}`)
    expect(result.current.dirtyCloseFilePath).toBeNull()
  })

  it('Save on an ordinary dirty file still saves then closes', async () => {
    mocks.openFiles.set(FILE, { isDirty: true })
    const { result } = renderHook(() => useEditorTabClose())
    act(() => {
      result.current.handleCloseEditorTab(FILE)
    })

    await act(async () => {
      await result.current.handleSaveThenClose()
    })

    expect(mocks.saveFile).toHaveBeenCalledWith(FILE)
    expect(mocks.closeFileIfIdle).toHaveBeenCalledWith(FILE)
    expect(mocks.removeTab).toHaveBeenCalledWith(`edit-${FILE}`)
  })
})
