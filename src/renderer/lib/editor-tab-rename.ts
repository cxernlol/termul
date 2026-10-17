import type { IpcResult } from '@shared/types/ipc.types'
import { filesystemApi } from '@/lib/api'
import { flushEditorContent } from '@/lib/editor-content-flush'
import { logFrontendError } from '@/lib/log-api'
import { basename } from '@/lib/path-basename'
import { renameBetweenSaves, useEditorStore } from '@/stores/editor-store'
import { useWorkspaceStore } from '@/stores/workspace-store'

function forwardSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * Rename or move a file or folder on disk, and have the editor follow it:
 * every open file at or under `fromPath` moves to the matching path under
 * `toPath`, keeping its buffer and unsaved edits, and its workspace tab moves
 * with it. Saves to those files never race the rename.
 */
export async function renamePathWithOpenEditors(
  fromPath: string,
  toPath: string
): Promise<IpcResult<void>> {
  const from = forwardSlashes(fromPath)
  const to = forwardSlashes(toPath)
  return renameBetweenSaves(from, to, async () => {
    const result = await filesystemApi.renameFile(fromPath, toPath)
    if (!result.success) return result
    const moves: Array<[string, string]> = []
    for (const openPath of useEditorStore.getState().openFiles.keys()) {
      const open = forwardSlashes(openPath)
      if (open === from || open.startsWith(`${from}/`)) {
        moves.push([openPath, `${to}${open.slice(from.length)}`])
      }
    }
    for (const [oldPath, newPath] of moves) {
      try {
        // Pull any keystrokes the editor has not handed to the store yet.
        await flushEditorContent(oldPath)
      } catch (error) {
        void logFrontendError({
          level: 'warn',
          source: 'editor-tab-rename',
          message: `editor flush before rename failed file=${basename(oldPath)}: ${
            error instanceof Error ? error.message : String(error)
          }`
        })
      }
      useEditorStore.getState().renameOpenFile(oldPath, newPath)
      useWorkspaceStore.getState().renameEditorTab(oldPath, newPath)
    }
    return result
  })
}
