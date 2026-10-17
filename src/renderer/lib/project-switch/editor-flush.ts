import { flushPendingAutoSaves } from '@/lib/editor-auto-save'

/**
 * Seam between the project-switch coordinator and the editor's pending
 * autosaves: `leave()` awaits this before persisting the leaving project, so
 * no debounced save is still in flight when its files are cleared. Best
 * effort: a failing file stays unsaved and its draft is persisted.
 */
export async function flushEditorWork(): Promise<void> {
  await flushPendingAutoSaves()
}
