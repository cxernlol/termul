import type { DirectoryEntry } from '@shared/types/filesystem.types'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { filesystemApi } from '@/lib/api'
import { renamePathWithOpenEditors } from '@/lib/editor-tab-rename'
import { useEditorStore } from '@/stores/editor-store'
import { useFileExplorerActions, useFileExplorerStore } from '@/stores/file-explorer-store'
import { editorTabId, useWorkspaceStore } from '@/stores/workspace-store'
import type { ExplorerInlineInputContextValue, InlineInputState } from './explorer-inline-input'
import { findTreeEntry, joinTreePath, parentTreePath, resolveDeleteTargets } from './tree-paths'

/** Outcome of expanding the create-target chain (GH-539). */
type ExpandChainResult =
  | { status: 'expanded'; dir: string }
  | { status: 'load-failed' }
  | { status: 'root-changed' }

interface ExplorerEntryFlowsOptions {
  rootPath: string | null
  selectedPaths: Set<string>
  directoryContents: Map<string, DirectoryEntry[]>
  /** The explorer panel: rows are found in it by `data-path`. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

export interface ExplorerEntryFlows {
  inlineInput: InlineInputState | null
  inlineInputContext: ExplorerInlineInputContextValue
  /** Entries waiting for delete confirmation; empty when no confirmation is open. */
  deleteTargets: DirectoryEntry[]
  /** True while that delete is in flight. The dialog stays open until it finishes. */
  isDeleting: boolean
  /** Header New File / New Folder: the target follows the selection. */
  startHeaderCreate: (type: 'file' | 'folder') => Promise<void>
  /** Context-menu New File / New Folder in `dirPath`. */
  startCreateIn: (dirPath: string, type: 'file' | 'folder') => Promise<void>
  startRename: (entry: DirectoryEntry) => void
  /** Context-menu Delete on `entry`: the whole selection when `entry` is part of it. */
  requestDelete: (entry: DirectoryEntry) => void
  /** Delete key: the whole selection. */
  requestDeleteSelection: () => void
  confirmDelete: () => Promise<void>
  cancelDelete: () => void
}

function toastExpandFailed(): void {
  toast.error('Could not open the target directory', {
    description: 'The folder could not be expanded. Try again once the tree is loaded.'
  })
}

/**
 * Drop a deleted entry from the editor and the explorer caches: close its
 * open tab (every tab under it for a folder), and forget the folder's cached
 * contents and watchers.
 */
function forgetDeletedEntry(entry: DirectoryEntry): void {
  const deletedPath = entry.path.replace(/\\/g, '/')
  const editorState = useEditorStore.getState()
  const workspaceState = useWorkspaceStore.getState()

  if (entry.type !== 'directory') {
    if (editorState.openFiles.has(entry.path)) {
      editorState.closeFile(entry.path)
      workspaceState.removeTab(editorTabId(entry.path))
    }
    return
  }

  for (const [openFilePath] of editorState.openFiles) {
    const normalizedOpenPath = openFilePath.replace(/\\/g, '/')
    if (normalizedOpenPath === deletedPath || normalizedOpenPath.startsWith(`${deletedPath}/`)) {
      editorState.closeFile(openFilePath)
      workspaceState.removeTab(editorTabId(openFilePath))
    }
  }

  const store = useFileExplorerStore.getState()
  const newExpanded = new Set(store.expandedDirs)
  const newContents = new Map(store.directoryContents)
  for (const key of newContents.keys()) {
    if (key.startsWith(`${deletedPath}/`) || key === deletedPath) {
      newExpanded.delete(key)
      newContents.delete(key)
      void filesystemApi.unwatchDirectory(key)
    }
  }
  useFileExplorerStore.setState({ expandedDirs: newExpanded, directoryContents: newContents })
}

/**
 * Create, rename and delete flows of the file explorer: the inline name
 * input state with its submit / cancel logic, and the delete confirmation.
 */
export function useExplorerEntryFlows({
  rootPath,
  selectedPaths,
  directoryContents,
  containerRef
}: ExplorerEntryFlowsOptions): ExplorerEntryFlows {
  const { toggleDirectory, selectPath, refreshDirectory } = useFileExplorerActions()
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [deleteTargets, setDeleteTargets] = useState<DirectoryEntry[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteInFlightRef = useRef(false)
  // Mirrors of component state so async header-create handlers can re-check
  // the latest values after awaiting chain expansion (GH-539 / GH-540).
  // Synced in useLayoutEffect (not during render) so the mirror is committed
  // before any post-paint handler runs.
  const inlineInputRef = useRef<InlineInputState | null>(null)
  useLayoutEffect(() => {
    inlineInputRef.current = inlineInput
  }, [inlineInput])
  const headerCreateInFlightRef = useRef(false)
  const isSubmittingRef = useRef(false)
  const submitFailedRef = useRef(false)

  const openInlineInput = useCallback((state: InlineInputState, initialValue: string) => {
    setInlineInput(state)
    setInputValue(initialValue)
  }, [])

  const closeInlineInput = useCallback(() => {
    setInlineInput(null)
    setInputValue('')
  }, [])

  /**
   * VSCode-style target resolution for header creation actions (GH-540):
   * selected directory > parent of selected file > project root.
   * Multi-selection or unresolvable selections fall back to the root.
   */
  const getCreateTargetDir = useCallback((): string => {
    if (!rootPath) return ''
    if (selectedPaths.size === 1) {
      const [selectedPath] = selectedPaths
      const selectedEntry = findTreeEntry(directoryContents, selectedPath)
      if (selectedEntry?.type === 'directory') return selectedEntry.path.replace(/\\/g, '/')
      if (selectedEntry?.type === 'file') return parentTreePath(selectedEntry.path) || rootPath
    }
    return rootPath
  }, [rootPath, selectedPaths, directoryContents])

  /** Expand every directory from the project root down to (and including) the target. */
  const expandDirectoryChain = useCallback(
    async (targetDir: string): Promise<ExpandChainResult> => {
      if (!rootPath) return { status: 'load-failed' }
      const normalizedRoot = rootPath.replace(/\\/g, '/')
      // Separator-safe prefix check (handles root '/' without '//').
      const rootPrefix = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`
      // Resolve the target to an in-root directory; stale/out-of-root
      // selections clamp to the active root so creation can never escape it.
      let resolved = targetDir.replace(/\\/g, '/')
      if (resolved !== normalizedRoot && !resolved.startsWith(rootPrefix)) {
        resolved = normalizedRoot
      }

      const chain: string[] = []
      let current = resolved
      while (current !== normalizedRoot && current.startsWith(rootPrefix)) {
        chain.push(current)
        const lastSlash = current.lastIndexOf('/')
        if (lastSlash <= 0) break
        current = current.slice(0, lastSlash)
      }
      chain.push(normalizedRoot)
      chain.reverse()

      for (const dir of chain) {
        if (!useFileExplorerStore.getState().expandedDirs.has(dir)) {
          await toggleDirectory(dir)
        }
        // Abort if the directory could not be expanded (load failure) or the
        // project changed mid-chain — never create into an invisible or
        // foreign tree.
        const state = useFileExplorerStore.getState()
        if (state.rootPath !== rootPath) return { status: 'root-changed' }
        if (!state.expandedDirs.has(dir)) return { status: 'load-failed' }
      }
      return { status: 'expanded', dir: resolved }
    },
    [rootPath, toggleDirectory]
  )

  /** Best-effort scroll of a tree row (by entry path) into view. */
  const revealTreePath = useCallback(
    (path: string) => {
      window.requestAnimationFrame(() => {
        const row = containerRef.current?.querySelector(`[data-path="${CSS.escape(path)}"]`)
        row?.scrollIntoView({ block: 'nearest' })
      })
    },
    [containerRef]
  )

  const startHeaderCreate = useCallback(
    async (type: 'file' | 'folder') => {
      // Never clobber an in-progress create/rename input, and serialize
      // header requests while the chain expansion is awaiting.
      if (inlineInputRef.current || headerCreateInFlightRef.current) return
      const targetDir = getCreateTargetDir()
      if (!targetDir) return
      headerCreateInFlightRef.current = true
      try {
        const result = await expandDirectoryChain(targetDir)
        // Re-check after the awaits: another flow may have opened an input or
        // switched projects while the chain was expanding.
        if (result.status !== 'expanded' || inlineInputRef.current) {
          if (result.status === 'load-failed') toastExpandFailed()
          return
        }
        revealTreePath(result.dir)
        openInlineInput({ parentPath: result.dir, type, mode: 'create' }, '')
      } finally {
        headerCreateInFlightRef.current = false
      }
    },
    [getCreateTargetDir, expandDirectoryChain, revealTreePath, openInlineInput]
  )

  // The create row shows in place at the top of the folder's children, so
  // the folder is expanded first.
  const startCreateIn = useCallback(
    async (dirPath: string, type: 'file' | 'folder') => {
      const result = await expandDirectoryChain(dirPath)
      if (result.status !== 'expanded') {
        if (result.status === 'load-failed') toastExpandFailed()
        return
      }
      openInlineInput({ parentPath: result.dir, type, mode: 'create' }, '')
    },
    [expandDirectoryChain, openInlineInput]
  )

  const startRename = useCallback(
    (entry: DirectoryEntry) => {
      openInlineInput(
        {
          parentPath: parentTreePath(entry.path),
          type: entry.type === 'directory' ? 'folder' : 'file',
          mode: 'rename',
          existingEntry: entry
        },
        entry.name
      )
    },
    [openInlineInput]
  )

  const submitInlineInput = useCallback(async () => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    submitFailedRef.current = false

    if (!inlineInput || !inputValue.trim()) {
      setInlineInput(null)
      isSubmittingRef.current = false
      return
    }

    const name = inputValue.trim()
    // Reject path separators and dot-segments so creation can never escape
    // the target directory (GH-539). Release the submission lock here — this
    // branch returns before the try/finally that resets it.
    if (name === '.' || name === '..' || /[/\\]/.test(name)) {
      toast.error('Invalid name: file and folder names cannot contain path separators')
      submitFailedRef.current = true
      isSubmittingRef.current = false
      return
    }
    const fullPath = joinTreePath(inlineInput.parentPath, name)
    const renamedEntry = inlineInput.mode === 'rename' ? inlineInput.existingEntry : undefined

    try {
      let result: { success: boolean; error?: string } | undefined
      if (inlineInput.mode === 'create') {
        result =
          inlineInput.type === 'file'
            ? await filesystemApi.createFile(fullPath)
            : await filesystemApi.createDirectory(fullPath)
      } else if (renamedEntry) {
        result = await renamePathWithOpenEditors(renamedEntry.path, fullPath)
      }

      if (!result?.success) {
        toast.error(result?.error || 'Operation failed')
        submitFailedRef.current = true
        return
      }

      await refreshDirectory(inlineInput.parentPath)
      if (inlineInput.mode === 'create') {
        // GH-539: newly created entries are selected and revealed in the tree.
        selectPath(fullPath)
        revealTreePath(fullPath)
      }
      closeInlineInput()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error')
      submitFailedRef.current = true
    } finally {
      isSubmittingRef.current = false
    }
  }, [inlineInput, inputValue, refreshDirectory, selectPath, revealTreePath, closeInlineInput])

  const cancelInlineInput = useCallback(() => {
    if (isSubmittingRef.current) return
    if (submitFailedRef.current) {
      submitFailedRef.current = false
      return
    }
    closeInlineInput()
  }, [closeInlineInput])

  const inlineInputContext = useMemo(
    () => ({
      inlineInput,
      value: inputValue,
      setValue: setInputValue,
      onSubmit: () => {
        void submitInlineInput().catch((error) => {
          console.error('Inline input submit failed:', error)
        })
      },
      onCancel: cancelInlineInput
    }),
    [inlineInput, inputValue, submitInlineInput, cancelInlineInput]
  )

  // Read from the store, not render props: the context-menu callbacks must keep
  // a stable identity or every tree row re-renders on each selection change.
  const requestDelete = useCallback((entry: DirectoryEntry) => {
    const { directoryContents, selectedPaths } = useFileExplorerStore.getState()
    setDeleteTargets(resolveDeleteTargets(directoryContents, selectedPaths, entry))
  }, [])

  const requestDeleteSelection = useCallback(() => {
    const { directoryContents, selectedPaths } = useFileExplorerStore.getState()
    const targets = resolveDeleteTargets(directoryContents, selectedPaths)
    if (targets.length > 0) setDeleteTargets(targets)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (deleteTargets.length === 0 || deleteInFlightRef.current) return
    deleteInFlightRef.current = true
    setIsDeleting(true)

    try {
      const failed: { entry: DirectoryEntry; error: string }[] = []
      const parentPaths = new Set<string>()
      for (const entry of deleteTargets) {
        let result: { success: boolean; error?: string }
        try {
          result = await filesystemApi.deletePath(entry.path, {
            recursive: entry.type === 'directory'
          })
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
        }
        if (!result.success) {
          failed.push({ entry, error: result.error ?? 'Unknown error' })
          continue
        }
        forgetDeletedEntry(entry)
        parentPaths.add(parentTreePath(entry.path))
      }

      if (parentPaths.size > 0) {
        useFileExplorerStore.getState().clearSelection()
        for (const parentPath of parentPaths) await refreshDirectory(parentPath)
      }
      if (failed.length === 0) {
        setDeleteTargets([])
        return
      }
      // Keep only what failed so the dialog can retry it.
      setDeleteTargets(failed.map(({ entry }) => entry))
      toast.error(
        failed.length === 1
          ? `Failed to delete ${failed[0].entry.path}: ${failed[0].error}`
          : `Failed to delete ${failed.length} of ${deleteTargets.length} items. First error: ${failed[0].entry.path}: ${failed[0].error}`
      )
    } finally {
      deleteInFlightRef.current = false
      setIsDeleting(false)
    }
  }, [deleteTargets, refreshDirectory])

  const cancelDelete = useCallback(() => setDeleteTargets([]), [])

  return {
    inlineInput,
    inlineInputContext,
    deleteTargets,
    isDeleting,
    startHeaderCreate,
    startCreateIn,
    startRename,
    requestDelete,
    requestDeleteSelection,
    confirmDelete,
    cancelDelete
  }
}
