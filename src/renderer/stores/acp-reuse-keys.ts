/**
 * Single owner of the agent reuse-key format.
 *
 * A canonical key is `configId\0cwd`, followed by two optional marker pairs:
 * `\0project\0projectId` for a Project-scoped key and `\0chat\0chatId` for
 * an agent opened for one existing chat that runs its own Claude Account (see
 * {@link agentReuseKey}). A chat key is live, not detached, but a new chat or
 * warm session never looks it up because those build their key without a chat.
 * The markers keep these keys distinct from a detached key, which appends one
 * more segment, the agent id
 * (`configId\0cwd[\0project\0projectId][\0chat\0chatId]\0agentId`), to keep
 * a superseded agent process resolvable for live chat history, model changes,
 * and cleanup, while guaranteeing the key is NEVER reused for a new chat
 * preparation.
 * Detached keys are produced by `ensureLiveAgent` (Factory session isolation)
 * and `detachAgentForNewCredentials`.
 *
 * Documented exception: `prepareChatError` / `prepareChatKey` keys append a
 * third `\0mcpKey` segment (empty when no MCP selection) on top of a canonical
 * reuse key. A third segment alone therefore does not prove a key is detached —
 * {@link isDetachedReuseKey} is only meaningful for `configToLiveAgent` keys
 * (prepare keys are always the 3-segment prepare format and are never fed to
 * these predicates). `configId` never contains `\0`, so
 * {@link configIdFromReuseKey} can always recover it.
 */

const NUL = '\0'

/** Marker segment of a Project-scoped key; the following segment is the Project id. */
const PROJECT_SEGMENT = 'project'

/** Marker segment of a chat's own key; the following segment is the chat (session) id. */
const CHAT_SEGMENT = 'chat'

/**
 * Canonical reuse key for a configured agent + working directory: the identity
 * of a live agent *process* (the agent process is MCP-agnostic; only the
 * session folds MCP selection in — see `prepareChatKey` in `acp-store.ts`).
 *
 * `projectId` selects the Claude Account of a managed Claude agent and the
 * Codex Account of `acp-registry:codex-acp`. Two Projects that share a cwd
 * must not share that process, so a non-empty Project id is part of the key.
 * `renewAgentCredentials` bumps the credential epoch for that config and
 * project after an account switch, so a process spawned on the old home is
 * not reused.
 *
 * `chatId` names the existing chat the agent was opened for when that chat
 * runs its own Claude Account ({@link reuseScopeFor}). That agent belongs to
 * the chat, so no other chat or warm session reuses it.
 */
export function agentReuseKey(
  configId: string,
  cwd: string,
  projectId?: string | null,
  chatId?: string | null
): string {
  let key = `${configId}${NUL}${cwd.trim()}`
  const project = projectId?.trim() ?? ''
  if (project.length > 0) key += `${NUL}${PROJECT_SEGMENT}${NUL}${project}`
  const chat = chatId?.trim() ?? ''
  if (chat.length > 0) key += `${NUL}${CHAT_SEGMENT}${NUL}${chat}`
  return key
}

/**
 * The chat id an agent opened for existing chat `sessionId` is keyed to. A
 * chat that runs its own Claude Account gets a process of its own (its id);
 * a chat that follows its Project runs the Project's Account, so it shares
 * the Project's agents like a new chat (none). `ownAccountId` is the chat's
 * own Account, `null` when it follows its Project, and `undefined` when the
 * Accounts could not be read: that chat also gets its own process, so it
 * never runs on another Account.
 */
export function reuseScopeFor(
  sessionId: string,
  ownAccountId: string | null | undefined
): string | undefined {
  return ownAccountId === null ? undefined : sessionId
}

/** Recover the `configId` from an {@link agentReuseKey} (split on first NUL). */
export function configIdFromReuseKey(key: string): string {
  const nul = key.indexOf(NUL)
  return nul === -1 ? key : key.slice(0, nul)
}

/**
 * Detached reuse key: keeps `agentId` resolvable for live chat history, model
 * changes, and cleanup, without allowing the next prepare to reuse the
 * canonical key (its third segment is an agent id, not a cwd).
 */
export function detachedReuseKey(reuseKey: string, agentId: string): string {
  return `${reuseKey}${NUL}${agentId}`
}

/**
 * True when `key` carries a detached agent-id segment. Only meaningful for
 * `configToLiveAgent` keys — prepare-chat keys ALWAYS have a third segment
 * (the `mcpKey`), which is not a detach marker (see the module docstring).
 * `project` and `chat` marker pairs are canonical, not detached.
 */
export function isDetachedReuseKey(key: string): boolean {
  return parseReuseKey(key).detachedAgentId !== undefined
}

/** A reuse key parsed into its segments. */
export interface ParsedReuseKey {
  configId: string
  cwd: string
  /** Project id of a Project-scoped key (`…\0project\0projectId`). */
  projectId?: string
  /** Chat id of a key for one existing chat (`…\0chat\0chatId`). */
  chatId?: string
  /**
   * The detached agent id, present only for detached keys: the one segment
   * after the canonical key. When parsing a prepare-chat key instead, this
   * field carries the `mcpKey` segment — callers know which domain their key
   * belongs to and must not treat a prepare key as detached.
   */
  detachedAgentId?: string
}

/**
 * Parse a reuse key, explicitly modeling the optional segments so consumers
 * never re-derive them with ad-hoc `split('\0')` calls (which is how the
 * corrupted-cwd prepare bug slipped in — see `completeBrowserAuth`).
 */
export function parseReuseKey(key: string): ParsedReuseKey {
  const parts = key.split(NUL)
  const parsed: ParsedReuseKey = { configId: parts[0] ?? '', cwd: parts[1] ?? '' }
  let next = 2
  if (parts[next] === PROJECT_SEGMENT) {
    parsed.projectId = parts[next + 1] ?? ''
    next += 2
  }
  if (parts[next] === CHAT_SEGMENT) {
    parsed.chatId = parts[next + 1] ?? ''
    next += 2
  }
  if (next < parts.length) parsed.detachedAgentId = parts[next]
  return parsed
}
