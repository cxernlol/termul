import {
  COMMAND_RESULT_CODES,
  type IpcResult,
  type PreservedTerminalEntry,
  type RotatedClaim
} from '@shared/types/ipc.types'

/**
 * A rotate whose first run applied but whose reply (the new claim) is gone
 * answers OUTCOME_UNKNOWN, and the host never kept the new credential.
 * `list_preserved` scoped to this terminal re-issues its claim alone, so the
 * siblings' holders keep working credentials. Without the project the
 * terminal was spawned or listed for, the failure stands.
 */
export async function recoverLostRotation(
  rotated: IpcResult<RotatedClaim>,
  terminalId: string,
  projectId: string | undefined,
  listPreserved: (
    projectId: string,
    terminalId: string
  ) => Promise<IpcResult<PreservedTerminalEntry[]>>
): Promise<IpcResult<RotatedClaim>> {
  if (rotated.success || rotated.code !== COMMAND_RESULT_CODES.OUTCOME_UNKNOWN || !projectId) {
    return rotated
  }
  const listed = await listPreserved(projectId, terminalId)
  const entry = listed.success ? listed.data.find((item) => item.id === terminalId) : undefined
  return entry?.claim ? { success: true, data: { claim: entry.claim } } : rotated
}
