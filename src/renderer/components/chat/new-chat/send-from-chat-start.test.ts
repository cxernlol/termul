import { beforeEach, describe, expect, it, vi } from 'vitest'

const { launchChat, writesRef, toastError, persistWrite } = vi.hoisted(() => ({
  launchChat: vi.fn(),
  writesRef: { current: true },
  toastError: vi.fn(),
  persistWrite: vi.fn(async () => ({ success: true }))
}))

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(async () => {}) }))
vi.mock('@/lib/api', () => ({
  persistenceApi: { write: persistWrite }
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: toastError }) }))
vi.mock('@/lib/tauri-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri-runtime')>()),
  serverAdmitsRemoteWrites: () => writesRef.current
}))
vi.mock('@/components/agents/launcher/launch-chat', () => ({ launchChat }))

import type { ContentBlock } from '@/lib/acp-api'
import { registerSessionTempFiles } from '@/lib/attachment-temp-cleanup'
import { useAcpStore } from '@/stores/acp-store'
import { type ChatStartPick, useChatStartPickStore } from '@/stores/chat-start-pick-store'
import { useProjectStore } from '@/stores/project-store'
import { agentChatTabId, useWorkspaceStore } from '@/stores/workspace-store'
import { chatStartTarget, sendFromChatStart } from './send-from-chat-start'

const WT = '/work/.termul/worktrees/feat'
const project = {
  id: 'p1',
  name: 'termul',
  path: '/work',
  isGitRepo: true,
  worktrees: [{ id: 'w1', name: 'feat', branch: 'feat/x', path: WT, createdAt: '2026-01-01' }]
}
const wire: ContentBlock[] = [{ type: 'text', text: 'wire text' }]
const display: ContentBlock[] = [{ type: 'text', text: 'hello there' }]

const pick = (over: Partial<ChatStartPick>): ChatStartPick => ({
  isolationMode: 'current',
  existingWorktreeId: null,
  baseBranch: null,
  ...over
})

let started: { resolve: (id: string) => void; reject: (err: unknown) => void }
const closeSession = vi.fn(async () => {})
const deleteHistorySession = vi.fn(async () => {})

function send(): ReturnType<typeof sendFromChatStart> {
  return sendFromChatStart({ sessionId: 's1', blocks: wire, displayBlocks: display })
}

beforeEach(() => {
  vi.clearAllMocks()
  writesRef.current = true
  useProjectStore.setState({ activeProjectId: 'p1', projects: [project] } as never)
  const tabId = agentChatTabId('s1')
  useWorkspaceStore.setState({
    root: {
      type: 'leaf',
      id: 'pane-1',
      tabs: [{ type: 'agent-chat', id: tabId, sessionId: 's1', mountKey: tabId }],
      activeTabId: tabId
    },
    activePaneId: 'pane-1'
  } as never)
  useAcpStore.setState({
    sessions: {
      s1: {
        id: 's1',
        agentId: '',
        projectId: 'p1',
        cwd: '/work',
        status: 'active',
        launchConfigId: 'cfg-1',
        models: { currentModelId: 'm2', availableModels: [{ modelId: 'm2', name: 'M2' }] },
        modes: null,
        configOptions: []
      }
    },
    messages: { s1: [] },
    promptQueues: {},
    launchingSessionIds: {},
    sessionIndex: [],
    configToLiveAgent: {},
    closeSession,
    deleteHistorySession
  } as never)
  useChatStartPickStore.setState({ picks: {} })
  launchChat.mockImplementation(() => ({
    placeholderId: 'launch-1',
    started: new Promise<string>((resolve, reject) => {
      started = { resolve, reject }
    })
  }))
})

describe('chatStartTarget', () => {
  it('stays when the pick is the folder the chat runs in', () => {
    expect(chatStartTarget({ cwd: '/work' }, pick({}), project)).toEqual({ kind: 'stay' })
    expect(
      chatStartTarget(
        { cwd: WT },
        pick({ isolationMode: 'existing', existingWorktreeId: 'w1' }),
        project
      )
    ).toEqual({ kind: 'stay' })
  })

  it('moves a worktree chat back to the current checkout', () => {
    expect(chatStartTarget({ cwd: WT }, pick({}), project)).toEqual({
      kind: 'move',
      checkout: { launchCwd: '/work' }
    })
  })

  it('makes a new worktree only where the server admits writes', () => {
    const worktree = pick({ isolationMode: 'worktree', baseBranch: 'dev' })
    expect(chatStartTarget({ cwd: '/work' }, worktree, project)).toEqual({
      kind: 'new-worktree',
      projectRoot: '/work',
      baseBranch: 'dev'
    })
    writesRef.current = false
    expect(chatStartTarget({ cwd: '/work' }, worktree, project)).toEqual({ kind: 'stay' })
  })

  it('blocks a pick that cannot apply', () => {
    expect(
      chatStartTarget({ cwd: '/work' }, pick({ isolationMode: 'worktree' }), project).kind
    ).toBe('blocked')
    expect(
      chatStartTarget(
        { cwd: '/work' },
        pick({ isolationMode: 'existing', existingWorktreeId: 'gone' }),
        project
      ).kind
    ).toBe('blocked')
  })
})

describe('sendFromChatStart', () => {
  it('sends as usual when the chat has no pick, or the pick changes nothing', () => {
    expect(send()).toBe('normal')
    useChatStartPickStore.getState().setPick('s1', pick({}))
    expect(send()).toBe('normal')
    expect(launchChat).not.toHaveBeenCalled()
    // A pick that changes nothing is used up by the send.
    expect(useChatStartPickStore.getState().picks.s1).toBeUndefined()
  })

  it('never applies a pick once the chat has messages', () => {
    useChatStartPickStore
      .getState()
      .setPick('s1', pick({ isolationMode: 'existing', existingWorktreeId: 'w1' }))
    useAcpStore.setState({ messages: { s1: [{ id: 'm', role: 'user', blocks: [] }] } } as never)
    expect(send()).toBe('normal')
  })

  it('never applies a pick once a message waits in the queue', () => {
    useChatStartPickStore
      .getState()
      .setPick('s1', pick({ isolationMode: 'existing', existingWorktreeId: 'w1' }))
    useAcpStore.setState({
      promptQueues: { s1: [{ id: 'q', blocks: [{ type: 'text', text: 'first' }], createdAt: 1 }] }
    } as never)
    expect(send()).toBe('normal')
    expect(launchChat).not.toHaveBeenCalled()
  })

  it('starts the empty chat again in the picked worktree with the message and options', async () => {
    useChatStartPickStore
      .getState()
      .setPick('s1', pick({ isolationMode: 'existing', existingWorktreeId: 'w1' }))
    registerSessionTempFiles('s1', ['/tmp/shot.png'])

    expect(send()).toBe('restarted')

    const request = launchChat.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      configId: 'cfg-1',
      projectId: 'p1',
      paneId: 'pane-1',
      checkout: { launchCwd: WT, worktreePath: WT, worktreeBranch: 'feat/x' },
      placeholder: { initialUserBlocks: display }
    })
    expect(request.newWorktree).toBeUndefined()
    await expect(request.beforeStart()).resolves.toEqual({
      blocks: wire,
      pending: expect.objectContaining({ modelId: 'm2' })
    })

    // The new chat takes the old chat's tab in place.
    const remap = vi.spyOn(useWorkspaceStore.getState(), 'remapAgentChatSession')
    request.onOpened('launch-1')
    expect(remap).toHaveBeenCalledWith('s1', 'launch-1', 'pane-1')

    started.resolve('real-1')
    await vi.waitFor(() => expect(deleteHistorySession).toHaveBeenCalledWith('s1'))
    expect(closeSession).toHaveBeenCalledWith('s1')
    expect(useChatStartPickStore.getState().picks.s1).toBeUndefined()
  })

  it('makes the new worktree on the first send; when it fails the tab goes back to the old chat', async () => {
    useChatStartPickStore
      .getState()
      .setPick('s1', pick({ isolationMode: 'worktree', baseBranch: 'dev' }))

    expect(send()).toBe('restarted')

    const request = launchChat.mock.calls[0]?.[0]
    expect(request.newWorktree).toEqual({ projectRoot: '/work', baseBranch: 'dev' })
    expect(request.checkout).toEqual({ launchCwd: '/work' })
    const remap = vi.spyOn(useWorkspaceStore.getState(), 'remapAgentChatSession')
    request.onRollback('launch-1')
    expect(remap).toHaveBeenCalledWith('launch-1', 's1', 'pane-1')
    request.onWorktreeFailed(new Error('Worktree creation failed: boom'))
    started.reject(new Error('Worktree creation failed: boom'))

    expect(toastError).toHaveBeenCalledWith('Worktree creation failed: boom')
    expect(persistWrite).toHaveBeenCalledWith('chat-draft/p1/s1', 'hello there')
    await Promise.resolve()
    // The old chat still has its tab, so it stays (and keeps its pasted files).
    expect(deleteHistorySession).not.toHaveBeenCalled()
  })

  it('discards the old chat when the new one fails after it took the tab', async () => {
    useChatStartPickStore
      .getState()
      .setPick('s1', pick({ isolationMode: 'existing', existingWorktreeId: 'w1' }))
    send()
    const tabId = agentChatTabId('launch-1')
    useWorkspaceStore.setState({
      root: {
        type: 'leaf',
        id: 'pane-1',
        tabs: [{ type: 'agent-chat', id: tabId, sessionId: 'launch-1', mountKey: tabId }],
        activeTabId: tabId
      }
    } as never)
    started.reject(new Error('session/new failed'))
    await vi.waitFor(() => expect(deleteHistorySession).toHaveBeenCalledWith('s1'))
  })

  it('sends nothing when the pick cannot apply, so the composer keeps its draft', () => {
    useChatStartPickStore.getState().setPick('s1', pick({ isolationMode: 'worktree' }))
    expect(send()).toBe('blocked')
    expect(launchChat).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('Pick a base branch for the new worktree.')
  })
})
