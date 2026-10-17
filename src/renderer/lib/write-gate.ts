/** The single reason shown wherever a write control is disabled because the
 * connected server refuses writes from remote clients (CAP-15 / AD-9).
 * Renderer gating is UX only; the host keeps refusing the writes itself. */
export const READ_ONLY_SERVER_REASON = 'This server is read-only for remote clients.'
