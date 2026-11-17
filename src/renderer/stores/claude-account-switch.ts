/**
 * Account switch for Claude Agent chats (ADR-0004): after a Project's Claude
 * Account changes, each open Claude chat of that Project that follows it
 * restarts on a fresh agent process (which the host starts with the new
 * Account) and resumes the same session. A chat with its own Account restarts
 * only when that Account changes. Idle chats restart at once; busy chats after
 * their turn ends. A chat stopped by a usage limit can cancel its held turn and send the last
 * prompt again on the new Account. When the new Account cannot resume the
 * session, the chat continues in a new session with a summary handoff.
 */

import type { RemovedClaudeAccount } from '@shared/types/claude-accounts.types'
import { toast } from 'sonner'
import { runningBackgroundCommands } from '@/components/chat/background-commands'
import { ownChatAccountId } from '@/components/chat/claude-account/use-project-claude-account'
import { runningBackgroundSubagents } from '@/components/chat/subagent-strip'
import { acpApi, type ContentBlock } from '@/lib/acp-api'
import { resumeMissesSession } from '@/lib/acp-resume-policy'
import { CLAUDE_AGENT_CONFIG_ID } from '@/lib/agents/registry-config-id'
import { claudeAccountsApi } from '@/lib/claude-accounts-api'
import { logFrontendError } from '@/lib/log-api'
import { agentReuseKey, reuseScopeFor } from '@/stores/acp-reuse-keys'
import {
  type AcpState,
  BACKGROUND_COMMANDS_BLOCK_REASON,
  BACKGROUND_SUBAGENTS_BLOCK_REASON,
  historyOpenInFlight,
  isBackgroundWorkBlock,
  renewAgentCredentials,
  runsCurrentLaunch,
  switchBlockedReason,
  useAcpStore
} from '@/stores/acp-store'
import { readOwnChatAccount } from '@/stores/acp-store/chat-reuse-scope'
import { liveSiblingCount, reloadInFlight } from '@/stores/acp-store/reload-guard'
import { useAgentChatLifetimeStore } from '@/stores/agent-chat-lifetime-store'
import { getAgentChatSessionIdsInAllTrees, useWorkspaceStore } from '@/stores/workspace-store'

/** The agent config of a chat: the live reuse-key map first, then the session index. */
export function sessionAgentConfigId(state: AcpState, sessionId: string): string | null {
  const session = state.sessions?.[sessionId]
  if (session?.agentId) {
    for (const [key, id] of Object.entries(state.configToLiveAgent ?? {})) {
      if (id === session.agentId) return key.split('\0')[0] ?? null
    }
  }
  return state.sessionIndex?.find((entry) => entry.id === sessionId)?.agentConfigId ?? null
}

export function isClaudeSession(state: AcpState, sessionId: string): boolean {
  return sessionAgentConfigId(state, sessionId) === CLAUDE_AGENT_CONFIG_ID
}

function runsProjectAccount(state: AcpState, sessionId: string): boolean {
  const session = state.sessions[sessionId]
  return runsCurrentLaunch(
    state,
    session.agentId,
    CLAUDE_AGENT_CONFIG_ID,
    session.cwd,
    session.projectId
  )
}

const isOpen = (state: AcpState, sessionId: string): boolean => {
  const status = state.sessions[sessionId]?.status
  return status === 'active' || status === 'error'
}

function openChatIds(): Set<string> {
  const ids = getAgentChatSessionIdsInAllTrees(useWorkspaceStore.getState())
  for (const kept of Object.values(useAgentChatLifetimeStore.getState().retainedByProject)) {
    for (const id of kept) ids.add(id)
  }
  return ids
}

async function stopOldAgent(agentId: string, reason: string): Promise<void> {
  void logFrontendError({
    level: 'info',
    source: 'claudeAccountSwitch.stop',
    message: `Stopping agent ${agentId} (${reason}) without reopening its chats`
  })
  await useAcpStore
    .getState()
    .killAgent(agentId)
    .catch((error) => {
      void logFrontendError({
        level: 'warn',
        source: 'claudeAccountSwitch.stop',
        message: `Stopping agent ${agentId} failed: ${error instanceof Error ? error.message : String(error)}`
      })
    })
}

/**
 * Resolves once the chat has no turn, replay, queue, pending request or
 * running background subagent or command; `false` if it closed.
 * `ignoreBackground` does not wait for background subagents or commands: a
 * chat that continues after a limit must not wait on a command that may never
 * end, and `applyProjectClaudeAccount` awaits that continue.
 */
function waitUntilIdle(sessionId: string, ignoreBackground: boolean): Promise<boolean> {
  const check = (state: AcpState): boolean | null => {
    if (!isOpen(state, sessionId)) return false
    const reason = switchBlockedReason(state, sessionId)
    if (reason === null) return true
    return ignoreBackground && isBackgroundWorkBlock(reason) ? true : null
  }
  const now = check(useAcpStore.getState())
  if (now !== null) return Promise.resolve(now)
  return new Promise((resolve) => {
    const unsubscribe = useAcpStore.subscribe((state) => {
      const result = check(state)
      if (result === null) return
      unsubscribe()
      resolve(result)
    })
  })
}

/** Register the agent keyed to chat `from` under chat `to` instead. */
function moveChatAgentKey(from: string, to: string, cwd: string, projectId: string): void {
  const fromKey = agentReuseKey(CLAUDE_AGENT_CONFIG_ID, cwd, projectId, from)
  const toKey = agentReuseKey(CLAUDE_AGENT_CONFIG_ID, cwd, projectId, to)
  useAcpStore.setState((s) => {
    const agentId = s.configToLiveAgent[fromKey]
    if (!agentId) return {}
    const { [fromKey]: _moved, ...rest } = s.configToLiveAgent
    return { configToLiveAgent: { ...rest, [toKey]: agentId } }
  })
}

/**
 * A chat that now runs its own Account keeps its agent: register that agent
 * under the chat's key, so a reopen of the chat finds it.
 */
function keyAgentToChat(sessionId: string): void {
  const session = useAcpStore.getState().sessions[sessionId]
  if (!session?.agentId) return
  const key = agentReuseKey(CLAUDE_AGENT_CONFIG_ID, session.cwd, session.projectId, sessionId)
  useAcpStore.setState((s) => ({
    configToLiveAgent: { ...s.configToLiveAgent, [key]: session.agentId }
  }))
}

/**
 * The new Account has no copy of the session (on Windows its config directory
 * may not share `projects`): continue the chat in a new session that starts
 * from a summary, the same handoff as an agent switch (ADR-0004 fallback).
 * The new session runs the chat's Account and keeps it as its own, and with
 * it the agent, so a reopen of the new session finds that agent.
 */
async function continueInNewSession(
  sessionId: string,
  notice: string | undefined
): Promise<string | null> {
  void logFrontendError({
    level: 'warn',
    source: 'claudeAccountSwitch.handoff',
    message: `The account cannot resume chat ${sessionId}; continuing in a new session (notice=${notice !== undefined})`
  })
  toast.info('This account could not resume the chat', {
    description: 'The chat continues in a new session that starts from a summary.'
  })
  const old = useAcpStore.getState().sessions[sessionId]
  const ownAccount = await readOwnChatAccount(sessionId)
  const blocks: ContentBlock[] = notice ? [{ type: 'text', text: notice }] : []
  const newSessionId = await useAcpStore.getState().switchAgent(sessionId, CLAUDE_AGENT_CONFIG_ID, {
    wireBlocks: blocks,
    displayBlocks: blocks,
    accountChatId: reuseScopeFor(sessionId, ownAccount)
  })
  if (!newSessionId) return null
  // An unreadable list spawned on the chat's key; read it again to bind the new session.
  const account = ownAccount === undefined ? await readOwnChatAccount(sessionId) : ownAccount
  if (!account || !old?.projectId) return newSessionId
  const kept = await claudeAccountsApi
    .setChatAccount(old.projectId, newSessionId, account)
    .catch((error) => (error instanceof Error ? error.message : String(error)))
  if (kept !== true) {
    void logFrontendError({
      level: 'warn',
      source: 'claudeAccountSwitch.handoff',
      message: `Chat ${newSessionId} could not keep account ${account}: ${kept === false ? 'the host did not apply it' : kept}`
    })
    return newSessionId
  }
  moveChatAgentKey(sessionId, newSessionId, old.cwd, old.projectId)
  void logFrontendError({
    level: 'info',
    source: 'claudeAccountSwitch.handoff',
    message: `Chat ${newSessionId} keeps account ${account} and the agent of chat ${sessionId}`
  })
  return newSessionId
}

/**
 * The prompt a chat that a person moved off an Account at its limit continues
 * with, worded like the host's own switch notice. Sending the last prompt
 * again would make the agent answer it twice.
 */
export function chatSwitchNotice(from: string, to: string, window: string): string {
  return `You moved this chat from Claude account ${from} to ${to} because ${from} reached its ${window} limit. Continue the task you were working on. Subagents and background commands that were running before the switch were stopped; restart the ones that are still needed.`
}

/** Chats with a restart already running or waiting, so a second switch does not stack. */
const restarting = new Set<string>()

/**
 * Restart one Claude chat on the Account it resolves to now (its own, else its
 * Project's) and resume the same session. `notice` is sent as a new prompt
 * once the chat runs again; `cancelTurn` stops a turn that is still held (a
 * usage limit can keep a turn open until reset).
 */
export async function restartClaudeSession(
  sessionId: string,
  options: { notice?: string; cancelTurn?: boolean } = {}
): Promise<boolean> {
  if (restarting.has(sessionId)) return false
  restarting.add(sessionId)
  try {
    const store = useAcpStore.getState()
    if (!isOpen(store, sessionId) || !isClaudeSession(store, sessionId)) return false
    const blocked = switchBlockedReason(store, sessionId)
    if (options.cancelTurn && blocked !== null && !isBackgroundWorkBlock(blocked)) {
      await store.cancelPrompt(sessionId).catch(() => undefined)
    }
    if (!options.cancelTurn && blocked === BACKGROUND_SUBAGENTS_BLOCK_REASON) {
      const count = runningBackgroundSubagents(
        store.toolCalls[sessionId],
        store.messages[sessionId]
      ).length
      void logFrontendError({
        level: 'info',
        source: 'claudeAccountSwitch.restart',
        message: `Restart of chat ${sessionId} waits on ${count} background subagent${count === 1 ? '' : 's'}`
      })
    }
    if (!options.cancelTurn && blocked === BACKGROUND_COMMANDS_BLOCK_REASON) {
      const count = runningBackgroundCommands(store.sessions[sessionId])
      void logFrontendError({
        level: 'info',
        source: 'claudeAccountSwitch.restart',
        message: `Restart of chat ${sessionId} waits on ${count} background command${count === 1 ? '' : 's'}`
      })
    }
    // A chat that hit a limit continues now: its background subagents run on
    // the same exhausted account.
    if (!(await waitUntilIdle(sessionId, Boolean(options.cancelTurn)))) return false
    const oldAgentId = useAcpStore.getState().sessions[sessionId]?.agentId
    const shared =
      oldAgentId !== undefined &&
      liveSiblingCount(useAcpStore.getState().sessions, sessionId, oldAgentId) > 0
    if (!openChatIds().has(sessionId)) {
      if (oldAgentId && !shared) {
        await stopOldAgent(oldAgentId, `turn of unopened chat ${sessionId} ended`)
      }
      return false
    }
    void logFrontendError({
      level: 'info',
      source: 'claudeAccountSwitch.restart',
      message: `Restarting chat ${sessionId} on its account (notice=${options.notice !== undefined}, shared agent=${shared})`
    })
    // Release the old process first so a web reopen cannot adopt it. Other
    // chats on a shared process may run another Account, so it keeps running
    // and only this chat's session closes; the reload guard keeps that close
    // from cancelling the reopen.
    if (shared) {
      reloadInFlight.add(sessionId)
      await acpApi.closeSession(oldAgentId, sessionId).catch(() => undefined)
    } else if (oldAgentId) {
      await useAcpStore
        .getState()
        .killAgent(oldAgentId)
        .catch(() => undefined)
    }
    let handedOff = false
    let continuedId = sessionId
    try {
      await useAcpStore.getState().retryCrashedSession(sessionId, { resend: false })
    } catch (error) {
      const stopped = useAcpStore.getState().sessions[sessionId]?.status === 'closed'
      if (!stopped || !resumeMissesSession(error)) throw error
      const newSessionId = await continueInNewSession(sessionId, options.notice)
      if (newSessionId) continuedId = newSessionId
      handedOff = true
    } finally {
      if (shared) reloadInFlight.delete(sessionId)
    }
    const active = useAcpStore.getState().sessions[continuedId]?.status === 'active'
    // A chat that did not come back keeps its limit card, so the person can retry.
    if (active) {
      useAcpStore.setState((s) => {
        const usage = s.sessionUsage[sessionId]
        if (!usage?.rateLimit) return {}
        const { rateLimit: _cleared, ...rest } = usage
        return { sessionUsage: { ...s.sessionUsage, [sessionId]: rest } }
      })
    }
    if (active && options.notice && !handedOff) {
      // The chat already runs on its new Account; only the notice failed.
      await useAcpStore
        .getState()
        .sendPrompt(sessionId, options.notice)
        .catch((error: unknown) => {
          void logFrontendError({
            level: 'warn',
            source: 'claudeAccountSwitch.restart',
            message: `Chat ${sessionId} restarted, but its continuation notice failed: ${error instanceof Error ? error.message : String(error)}`
          })
          toast.warning('The chat moved to the new account', {
            description:
              'The message asking it to continue was not sent. Send a message to continue.'
          })
        })
    }
    return active
  } catch (error) {
    void logFrontendError({
      level: 'warn',
      source: 'claudeAccountSwitch.restart',
      message: `Restart of chat ${sessionId} failed: ${error instanceof Error ? error.message : String(error)}`
    })
    return false
  } finally {
    restarting.delete(sessionId)
  }
}

/**
 * Chat ids with their own Account, which a Project change leaves alone. When
 * the host cannot list the Accounts, no chat counts as having one.
 */
async function chatsWithOwnAccount(projectId: string): Promise<Set<string>> {
  try {
    const snapshot = await claudeAccountsApi.list()
    return new Set(
      Object.keys(snapshot.chatAccounts).filter((id) => ownChatAccountId(snapshot, id) !== null)
    )
  } catch (error) {
    void logFrontendError({
      level: 'warn',
      source: 'claudeAccountSwitch.apply',
      message: `Listing Claude accounts for project ${projectId} failed; restarting every chat of it: ${error instanceof Error ? error.message : String(error)}`
    })
    return new Set()
  }
}

async function restartAfterReopen(sessionId: string, projectId: string): Promise<void> {
  await historyOpenInFlight(sessionId)?.catch(() => undefined)
  const state = useAcpStore.getState()
  if (state.sessions[sessionId]?.projectId !== projectId) return
  if (!isClaudeSession(state, sessionId) || runsProjectAccount(state, sessionId)) return
  void logFrontendError({
    level: 'info',
    source: 'claudeAccountSwitch.apply',
    message: `Chat ${sessionId} reopened on an agent of the previous account; restarting it`
  })
  await restartClaudeSession(sessionId)
}

/**
 * Restart every open Claude chat of a Project after its Account changed: a
 * chat with a tab, or one kept for its Project while that Project is off
 * screen. A chat with its own Account keeps running, and so does its agent.
 * Busy chats restart in the background when their turn ends. An unopened chat (a warm-pool seed, or a
 * chat whose tab was closed) is not reopened; its agent stops, after the
 * running turn if there is one, unless an open chat shares it. The Project's
 * Claude warm sessions are prepared again on the new Account. Resolves when
 * the idle chats restarted.
 */
export async function applyProjectClaudeAccount(
  projectId: string,
  options: { credentialsRenewed?: boolean } = {}
): Promise<void> {
  if (!options.credentialsRenewed) renewAgentCredentials(CLAUDE_AGENT_CONFIG_ID, projectId)
  const ownAccount = await chatsWithOwnAccount(projectId)
  const state = useAcpStore.getState()
  const openIds = openChatIds()
  const projectChats = Object.values(state.sessions).filter(
    (s) => s.projectId === projectId && isOpen(state, s.id) && isClaudeSession(state, s.id)
  )
  const chats = projectChats.filter((s) => !ownAccount.has(s.id))
  const open = chats.filter((s) => openIds.has(s.id))
  const keptAgents = new Set(
    [...open, ...projectChats.filter((s) => ownAccount.has(s.id))].map((s) => s.agentId)
  )
  const unopened = chats.filter((s) => !openIds.has(s.id) && !keptAgents.has(s.agentId))
  const busy = unopened.filter((s) => switchBlockedReason(state, s.id) !== null)
  const busyAgents = new Set(busy.map((s) => s.agentId))
  const idleAgents = new Set(unopened.map((s) => s.agentId).filter((a) => !busyAgents.has(a)))
  const warm = new Set(Object.values(state.preparedSessions))
  const rewarmCwds = new Set<string>()
  for (const [key, sessionId] of Object.entries(state.preparedSessions)) {
    const [configId, cwd, mcpKey] = key.split('\0')
    if (configId !== CLAUDE_AGENT_CONFIG_ID || mcpKey || !cwd) continue
    if (state.sessions[sessionId]?.projectId === projectId) rewarmCwds.add(cwd)
  }
  void logFrontendError({
    level: 'info',
    source: 'claudeAccountSwitch.apply',
    message: `Project ${projectId} account changed; leaving ${projectChats.length - chats.length} chats with their own account, restarting ${open.length} open Claude chats, stopping ${idleAgents.size} agents of unopened chats now (${unopened.filter((s) => warm.has(s.id)).length} warm-pool) and ${busy.length} after their turn, preparing ${rewarmCwds.size} warm sessions again`
  })
  const now: Promise<unknown>[] = []
  for (const agentId of idleAgents) now.push(stopOldAgent(agentId, 'chat not open'))
  for (const { id, agentId } of busy) {
    void logFrontendError({
      level: 'info',
      source: 'claudeAccountSwitch.stop',
      message: `Agent ${agentId} of unopened chat ${id} stops after its running turn`
    })
    void restartClaudeSession(id)
  }
  for (const id of Object.keys(state.openingHistoryIds)) {
    if (!ownAccount.has(id)) void restartAfterReopen(id, projectId)
  }
  for (const cwd of rewarmCwds) {
    useAcpStore
      .getState()
      .prepareChat(CLAUDE_AGENT_CONFIG_ID, cwd, undefined, projectId, { silent: true })
  }
  for (const { id } of open) {
    if (switchBlockedReason(state, id) === null) now.push(restartClaudeSession(id))
    else void restartClaudeSession(id)
  }
  await Promise.all(now)
}

/**
 * Restart the chats an Account removal moved: the open Claude chats of each
 * moved Project that follow it (`followerProjectIds` adds Projects that
 * followed a removed Default Account), and each chat that had the removed
 * Account as its own. Each runs the Account it resolves to now.
 */
export async function applyRemovedClaudeAccount(
  removed: RemovedClaudeAccount,
  followerProjectIds: readonly string[] = []
): Promise<void> {
  const projects = new Set([...removed.movedProjectIds, ...followerProjectIds])
  const sessions = useAcpStore.getState().sessions
  // A chat of a moved Project restarts with its Project.
  const chats = removed.movedChatIds.filter((id) => {
    const projectId = sessions[id]?.projectId
    return projectId !== undefined && !projects.has(projectId)
  })
  void logFrontendError({
    level: 'info',
    source: 'claudeAccountSwitch.remove',
    message: `Claude account removed; restarting chats of ${projects.size} projects and ${chats.length} of ${removed.movedChatIds.length} chats that ran it as their own`
  })
  await Promise.all([
    ...[...projects].map((projectId) => applyProjectClaudeAccount(projectId)),
    ...chats.map((id) => restartClaudeSession(id))
  ])
}

/**
 * Choose a Project's Account on the host, then restart its Claude chats on it.
 * Agents already spawned for the Project stop taking new chats before the
 * host write, so a chat started during the switch never lands on the old
 * Account. With `expectedAccountId` the host applies the choice only while
 * the Project still uses that Account; when another client switched first,
 * nothing restarts and this resolves `false`.
 */
export async function switchProjectClaudeAccount(
  projectId: string,
  accountId: string | null,
  options: { expectedAccountId?: string } = {}
): Promise<boolean> {
  renewAgentCredentials(CLAUDE_AGENT_CONFIG_ID, projectId)
  const applied = await claudeAccountsApi.setProjectAccount(projectId, accountId, {
    expectedAccountId: options.expectedAccountId
  })
  if (!applied) return false
  await applyProjectClaudeAccount(projectId, { credentialsRenewed: true })
  return true
}

/**
 * What a chat account choice did: `unchanged` (the chat already has that
 * choice; nothing written), `kept` (the choice changed but resolves to the
 * Account the chat runs, so it keeps its agent), `lost` (another client or
 * the host moved the chat first; nothing restarted), `restarted` or
 * `failed` (the restart ran), or `pending` (a busy chat restarts after its
 * turn).
 */
export type ChatAccountSwitch = 'unchanged' | 'kept' | 'lost' | 'restarted' | 'failed' | 'pending'

export interface ChatSwitchToast {
  kind: 'success' | 'info' | 'error'
  title: string
  description?: string
}

/**
 * The toast for what a chat account choice did. `target` names the Account
 * picked, or is `null` when the chat follows its Project again. Only a choice
 * the chat now runs on reads as done; a busy chat says when it moves.
 */
export function chatSwitchToast(
  outcome: ChatAccountSwitch,
  target: string | null
): ChatSwitchToast | null {
  const now =
    target === null ? 'This chat follows the project again' : `This chat now uses ${target}`
  const to = target ?? 'the project account'
  switch (outcome) {
    case 'unchanged':
      return null
    case 'kept':
    case 'restarted':
      return { kind: 'success', title: now }
    case 'lost':
      return {
        kind: 'info',
        title: 'The account of this chat already changed',
        description: 'Troupe or another device switched it first.'
      }
    case 'pending':
      return {
        kind: 'info',
        title: `This chat moves to ${to} when its reply ends`
      }
    case 'failed':
      return {
        kind: 'error',
        title: `Could not restart this chat on ${to}`,
        description: 'Send a message to continue.'
      }
  }
}

export function showChatSwitchToast(t: ChatSwitchToast | null): void {
  if (!t) return
  const show = t.kind === 'success' ? toast.success : t.kind === 'info' ? toast.info : toast.error
  if (t.description) show(t.title, { description: t.description })
  else show(t.title)
}

/**
 * Choose a chat's own Account on the host (`null`: follow its Project again),
 * then restart only that chat on it. Its Project and other chats keep their
 * Account. Pinning a chat to the Account it already runs writes the choice
 * and keeps its agent. The host applies the choice only while the chat still
 * runs on `chat.runsOn`. With `notice`, a held turn is cancelled and the
 * chat continues with that prompt.
 */
export async function switchChatClaudeAccount(
  chat: {
    sessionId: string
    projectId: string
    runsOn: string
    /** The chat's own Account; `null` while it follows its Project. */
    ownAccountId: string | null
    projectAccountId: string
  },
  accountId: string | null,
  options: { notice?: string } = {}
): Promise<ChatAccountSwitch> {
  const { sessionId, projectId, runsOn } = chat
  if (accountId === chat.ownAccountId) return 'unchanged'
  const applied = await claudeAccountsApi.setChatAccount(projectId, sessionId, accountId, {
    expectedAccountId: runsOn
  })
  if (!applied) {
    void logFrontendError({
      level: 'info',
      source: 'claudeAccountSwitch.chat',
      message: `Chat ${sessionId} account changed elsewhere first; not restarting it`
    })
    return 'lost'
  }
  if ((accountId ?? chat.projectAccountId) === runsOn) {
    if (reuseScopeFor(sessionId, accountId)) keyAgentToChat(sessionId)
    return 'kept'
  }
  void logFrontendError({
    level: 'info',
    source: 'claudeAccountSwitch.chat',
    message: `Chat ${sessionId} now ${accountId === null ? 'follows its project account' : `uses account ${accountId}`}; restarting it`
  })
  const idle = switchBlockedReason(useAcpStore.getState(), sessionId) === null
  const restart = restartClaudeSession(
    sessionId,
    options.notice ? { notice: options.notice, cancelTurn: true } : {}
  )
  if (!options.notice && !idle) {
    void restart
    return 'pending'
  }
  return (await restart) ? 'restarted' : 'failed'
}
