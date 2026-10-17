import type { IpcResult } from '@shared/types/ipc.types'

const requested = new Set<string>()

/**
 * Runs a user-initiated kill and remembers the terminal until its exit event
 * lands. A killed child reports exit code -1, which would otherwise read as a
 * crash. A refused kill forgets the id, so a later genuine exit still notifies.
 */
export async function trackTerminalKill(
  terminalId: string,
  kill: () => Promise<IpcResult<void>>
): Promise<IpcResult<void>> {
  requested.add(terminalId)
  try {
    const result = await kill()
    if (!result.success) requested.delete(terminalId)
    return result
  } catch (error) {
    requested.delete(terminalId)
    throw error
  }
}

/** True once per requested kill: consumes the mark so the id is not tracked forever. */
export function consumeTerminalKillRequest(terminalId: string): boolean {
  return requested.delete(terminalId)
}
