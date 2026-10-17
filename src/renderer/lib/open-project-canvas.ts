import { toast } from 'sonner'
import { filesystemApi } from '@/lib/api'
import { pickCanvasDoc } from '@/lib/canvas-doc'
import { useCanvasStore } from '@/stores/canvas-store'

/**
 * Opens the project's first `.op` document (project root, via the pure
 * `pickCanvasDoc` helper) as the singleton canvas tab. Failure paths toast.
 * Shared by the command palette and the revamp New tab menu.
 */
export async function openProjectCanvas(projectId: string, projectPath: string): Promise<void> {
  const result = await filesystemApi.readDirectory(projectPath)
  if (!result.success) {
    toast.error(`Could not read the project folder: ${result.error}`)
    return
  }
  const opDoc = pickCanvasDoc(result.data)
  if (!opDoc) {
    toast.info('No .op document found in the project root.')
    return
  }
  await useCanvasStore.getState().openCanvas(projectId, opDoc.path)
}
