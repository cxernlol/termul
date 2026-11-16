/**
 * New chat in the rail.
 *
 * An active project opens a project chat (the existing launcher). No active
 * project opens a quick chat, which has no folder of its own on the client.
 */
export function newChatKind(activeProjectId: string): 'project' | 'quick' {
  return activeProjectId ? 'project' : 'quick'
}
