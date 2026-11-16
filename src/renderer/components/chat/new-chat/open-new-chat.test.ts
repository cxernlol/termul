import { PersistenceKeys } from '@shared/types/persistence.types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { read, write, resolveEntries, tauriRef, launchChat, readComposerOptions } = vi.hoisted(
  () => ({
    read: vi.fn(),
    write: vi.fn(async () => ({ success: true, data: undefined })),
    resolveEntries: vi.fn(),
    tauriRef: { current: true },
    launchChat: vi.fn(),
    readComposerOptions: vi.fn()
  })
)

vi.mock('@/lib/api', () => ({ persistenceApi: { read, write } }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))
vi.mock('@/lib/tauri-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri-runtime')>()),
  isTauriContext: () => tauriRef.current
}))
vi.mock('@/lib/agents/supported-acp-agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agents/supported-acp-agents')>()),
  resolveSupportedAcpAgents: resolveEntries
}))
vi.mock('@/components/agents/launcher/launch-chat', () => ({ launchChat }))
vi.mock('@/stores/acp-store/composer-options', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/acp-store/composer-options')>()),
  readComposerOptions
}))

import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { useShellLayoutStore } from '@/stores/shell-layout-store'
import { agentChatTabId, useWorkspaceStore } from '@/stores/workspace-store'
import {
  newChatPlaceholderOptions,
  openNewChat,
  openNewQuickChat,
  replaceEmptyChat
} from './open-new-chat'

const config = (id: string) => ({ id, name: id, command: 'agent', args: [] })
const entry = (id: string, status = 'ready') => ({
  id,
  configId: id,
  agent: { id, name: id },
  config: config(id),
  status
})

function pane(tabs: unknown[] = [], activeTabId: string | null = null): void {
  useWorkspaceStore.setState({
    root: { type: 'leaf', id: 'pane-1', tabs, activeTabId },
    activePaneId: 'pane-1',
    agentLauncherPaneId: null
  } as never)
}

function lastSelected(agentId: string | null): void {
  read.mockImplementation(async (key: string) =>
    key === PersistenceKeys.lastSelectedAgent && agentId
      ? { success: true, data: { agentId, mode: 'acp' } }
      : { success: false, error: 'missing', code: 'KEY_NOT_FOUND' }
  )
}

let started: { resolve: (id: string) => void; reject: (err: unknown) => void }

beforeEach(() => {
  vi.clearAllMocks()
  tauriRef.current = true
  useProjectStore.setState({
    activeProjectId: 'p1',
    projects: [{ id: 'p1', name: 'termul', path: '/work', isGitRepo: true }]
  } as never)
  useShellLayoutStore.setState({ worktreePickByProject: {} } as never)
  useAcpStore.setState({
    agentConfigs: [config('cfg-a'), config('cfg-b')],
    agentOptionsCache: {},
    sessions: {},
    messages: {},
    promptQueues: {},
    launchingSessionIds: {}
  } as never)
  resolveEntries.mockResolvedValue([entry('cfg-a'), entry('cfg-b')])
  readComposerOptions.mockResolvedValue(null)
  lastSelected('cfg-b')
  pane()
  launchChat.mockImplementation(() => ({
    placeholderId: 'launch-1',
    started: new Promise<string>((resolve, reject) => {
      started = { resolve, reject }
    })
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('openNewChat', () => {
  it('opens an empty chat on the last picked agent with its saved options', async () => {
    readComposerOptions.mockResolvedValue({ modelId: 'm2', modeId: 'plan' })
    useAcpStore.setState({
      agentOptionsCache: {
        'cfg-b': {
          models: {
            currentModelId: 'm1',
            availableModels: [
              { modelId: 'm1', name: 'M1' },
              { modelId: 'm2', name: 'M2' }
            ]
          },
          modes: {
            currentModeId: 'code',
            availableModes: [
              { id: 'code', name: 'Code' },
              { id: 'plan', name: 'Plan' }
            ]
          },
          configOptions: [],
          updatedAt: 1
        }
      }
    } as never)

    const result = await openNewChat({ reason: 'rail' })

    expect(result).toEqual({ kind: 'opened', sessionId: 'launch-1' })
    const request = launchChat.mock.calls[0]?.[0]
    expect(request).toMatchObject({
      configId: 'cfg-b',
      projectId: 'p1',
      paneId: 'pane-1',
      checkout: { launchCwd: '/work' }
    })
    expect(request.newWorktree).toBeUndefined()
    // The placeholder paints the saved picks; the session gets them on start.
    expect(request.placeholder.models.currentModelId).toBe('m2')
    expect(request.placeholder.modes.currentModeId).toBe('plan')
    await expect(request.beforeStart()).resolves.toEqual({
      pending: expect.objectContaining({ modelId: 'm2', modeId: 'plan' })
    })
    expect(useAcpStore.getState().selectedAgentConfigId).toBe('cfg-b')
  })

  it('starts in the worktree the Workspace switcher picked', async () => {
    useProjectStore.setState({
      projects: [
        {
          id: 'p1',
          name: 'termul',
          path: '/work',
          isGitRepo: true,
          worktrees: [
            {
              id: 'w1',
              name: 'feat',
              branch: 'feat/x',
              path: '/work/.termul/worktrees/feat',
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      ]
    } as never)
    useShellLayoutStore.setState({
      worktreePickByProject: { p1: '/work/.termul/worktrees/feat' }
    } as never)

    await openNewChat({ reason: 'shortcut' })

    expect(launchChat.mock.calls[0]?.[0].checkout).toEqual({
      launchCwd: '/work/.termul/worktrees/feat',
      worktreePath: '/work/.termul/worktrees/feat',
      worktreeBranch: 'feat/x'
    })
  })

  it('focuses the empty chat the pane already shows instead of making another', async () => {
    const tabId = agentChatTabId('s-empty')
    pane([{ type: 'agent-chat', id: tabId, sessionId: 's-empty' }], tabId)
    useAcpStore.setState({
      sessions: { 's-empty': { id: 's-empty', projectId: 'p1', status: 'active' } },
      messages: { 's-empty': [] }
    } as never)

    const result = await openNewChat({ reason: 'rail' })

    expect(result).toEqual({ kind: 'focused', sessionId: 's-empty' })
    expect(launchChat).not.toHaveBeenCalled()
    expect(resolveEntries).not.toHaveBeenCalled()
  })

  it('opens another chat when the shown chat already has messages', async () => {
    const tabId = agentChatTabId('s-used')
    pane([{ type: 'agent-chat', id: tabId, sessionId: 's-used' }], tabId)
    useAcpStore.setState({
      sessions: { 's-used': { id: 's-used', projectId: 'p1', status: 'active' } },
      messages: { 's-used': [{ id: 'm', role: 'user', blocks: [] }] }
    } as never)

    expect((await openNewChat({ reason: 'rail' })).kind).toBe('opened')
  })

  it('opens one chat for a double press while the first is starting', async () => {
    const [first, second] = await Promise.all([
      openNewChat({ reason: 'rail' }),
      openNewChat({ reason: 'rail' })
    ])
    expect(first).toEqual(second)
    expect(launchChat).toHaveBeenCalledTimes(1)
  })

  it('opens an empty quick chat when no project is active, and does not open the launcher', async () => {
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useProjectStore.setState({ activeProjectId: '', projects: [] } as never)
    const store = useAcpStore.getState()
    const createLaunchPlaceholder = vi.fn(() => 'launch-q')
    const finalizeChatLaunch = vi.fn(async () => 'sess-q')
    useAcpStore.setState({ createLaunchPlaceholder, finalizeChatLaunch } as never)
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')

    const result = await openNewChat({ reason: 'rail' })

    expect(result).toEqual({ kind: 'opened', sessionId: 'launch-q' })
    expect(launchChat).not.toHaveBeenCalled()
    expect(showAgentLauncher).not.toHaveBeenCalled()
    expect(createLaunchPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: 'cfg-b',
        cwd: '',
        projectId: '__unassigned__',
        kind: 'quick'
      })
    )
    expect(finalizeChatLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        placeholderId: 'launch-q',
        configId: 'cfg-b',
        cwd: '',
        projectId: '__unassigned__'
      })
    )
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'chat', sessionId: 'launch-q' })
    useAcpStore.setState({
      createLaunchPlaceholder: store.createLaunchPlaceholder,
      finalizeChatLaunch: store.finalizeChatLaunch
    } as never)
  })

  it('closes the open quick chat so a project New chat is visible', async () => {
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'quick-1' } })
    expect((await openNewChat({ reason: 'shortcut' })).kind).toBe('opened')
    expect(launchChat).toHaveBeenCalledTimes(1)
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'closed' })
  })

  it('starts a quick chat from the Quick chats + while a project is active', async () => {
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    const store = useAcpStore.getState()
    const createLaunchPlaceholder = vi.fn(() => 'launch-q2')
    const finalizeChatLaunch = vi.fn(async () => 'sess-q2')
    useAcpStore.setState({ createLaunchPlaceholder, finalizeChatLaunch } as never)

    const result = await openNewQuickChat('quick-chats-header')

    expect(result).toEqual({ kind: 'opened', sessionId: 'launch-q2' })
    expect(launchChat).not.toHaveBeenCalled()
    expect(createLaunchPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: '__unassigned__', kind: 'quick' })
    )
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'chat', sessionId: 'launch-q2' })
    useAcpStore.setState({
      createLaunchPlaceholder: store.createLaunchPlaceholder,
      finalizeChatLaunch: store.finalizeChatLaunch
    } as never)
  })

  it('does not open the launcher when no project is active and no agent can start', async () => {
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useProjectStore.setState({ activeProjectId: '', projects: [] } as never)
    resolveEntries.mockResolvedValue([entry('cfg-b', 'install-required')])
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')

    expect(await openNewChat({ reason: 'rail' })).toEqual({ kind: 'skipped' })
    expect(showAgentLauncher).not.toHaveBeenCalled()
    expect(launchChat).not.toHaveBeenCalled()
    expect(useQuickChatStore.getState().view.mode).toBe('closed')
  })

  it('opens the launcher when the last picked agent needs an install (desktop)', async () => {
    resolveEntries.mockResolvedValue([entry('cfg-a'), entry('cfg-b', 'install-required')])
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')

    expect(await openNewChat({ reason: 'rail' })).toEqual({ kind: 'launcher' })
    expect(showAgentLauncher).toHaveBeenCalledWith('pane-1')
    expect(launchChat).not.toHaveBeenCalled()
  })

  it('on web never spawns a catalog agent nobody configured (#840)', async () => {
    tauriRef.current = false
    useAcpStore.setState({ agentConfigs: [] } as never)
    resolveEntries.mockResolvedValue([entry('acp-registry:codex')])
    lastSelected('acp-registry:codex')
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')

    expect(await openNewChat({ reason: 'rail' })).toEqual({ kind: 'launcher' })
    expect(showAgentLauncher).toHaveBeenCalledWith('pane-1')
    expect(launchChat).not.toHaveBeenCalled()
  })

  it('on web starts the last picked agent once it is configured', async () => {
    tauriRef.current = false
    await openNewChat({ reason: 'rail' })
    expect(launchChat.mock.calls[0]?.[0].configId).toBe('cfg-b')
  })

  it('on web falls back to a configured default when the last pick is not configured', async () => {
    tauriRef.current = false
    useAcpStore.setState({ agentConfigs: [config('cfg-a')] } as never)
    await openNewChat({ reason: 'rail' })
    expect(launchChat.mock.calls[0]?.[0].configId).toBe('cfg-a')
  })

  it('on desktop saves a catalog default before it starts', async () => {
    useAcpStore.setState({ agentConfigs: [] } as never)
    lastSelected(null)
    resolveEntries.mockResolvedValue([entry('acp-registry:codex')])
    const saveAgentConfig = vi.fn(async () => {})
    useAcpStore.setState({ saveAgentConfig } as never)

    await openNewChat({ reason: 'rail' })

    expect(saveAgentConfig).toHaveBeenCalledWith(config('acp-registry:codex'))
    expect(launchChat.mock.calls[0]?.[0].configId).toBe('acp-registry:codex')
    expect(write).toHaveBeenCalledWith(PersistenceKeys.lastSelectedAgent, {
      agentId: 'acp-registry:codex',
      mode: 'acp'
    })
  })

  it('opens the launcher for a sign-in when the start fails on auth', async () => {
    const removeTab = vi.spyOn(useWorkspaceStore.getState(), 'removeTab')
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')
    const deleteHistorySession = vi.fn(async () => {})
    useAcpStore.setState({ deleteHistorySession, closeSession: vi.fn(async () => {}) } as never)

    await openNewChat({ reason: 'rail' })
    started.reject(new Error('ACP_AUTH_REQUIRED: sign in'))
    await vi.waitFor(() => expect(showAgentLauncher).toHaveBeenCalledWith('pane-1'))
    expect(removeTab).toHaveBeenCalledWith(agentChatTabId('launch-1'))
    await vi.waitFor(() => expect(deleteHistorySession).toHaveBeenCalledWith('launch-1'))
  })

  it('moves a message that waited in the queue into the launcher draft before it opens', async () => {
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')
    useAcpStore.setState({
      deleteHistorySession: vi.fn(async () => {}),
      closeSession: vi.fn(async () => {})
    } as never)

    await openNewChat({ reason: 'rail' })
    useAcpStore.setState({
      promptQueues: {
        'launch-1': [{ id: 'q', blocks: [{ type: 'text', text: 'fix the build' }], createdAt: 1 }]
      }
    } as never)
    started.reject(new Error('ACP_AUTH_REQUIRED: sign in'))

    await vi.waitFor(() => expect(showAgentLauncher).toHaveBeenCalledWith('pane-1'))
    expect(write).toHaveBeenCalledWith(PersistenceKeys.lastLaunchDraft('p1'), 'fix the build')
    expect(write.mock.invocationCallOrder.at(-1)).toBeLessThan(
      showAgentLauncher.mock.invocationCallOrder[0]
    )
  })

  it('a chat with a queued message is not an empty chat to focus', async () => {
    const tabId = agentChatTabId('s-queued')
    pane([{ type: 'agent-chat', id: tabId, sessionId: 's-queued' }], tabId)
    useAcpStore.setState({
      sessions: { 's-queued': { id: 's-queued', projectId: 'p1', status: 'active' } },
      messages: { 's-queued': [] },
      promptQueues: {
        's-queued': [{ id: 'q', blocks: [{ type: 'text', text: 'hi' }], createdAt: 1 }]
      }
    } as never)

    expect((await openNewChat({ reason: 'rail' })).kind).toBe('opened')
  })

  it('starts nothing when its pane closed while it resolved the agent', async () => {
    let finish: (value: unknown) => void = () => undefined
    resolveEntries.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const run = openNewChat({ reason: 'rail' })
    useWorkspaceStore.setState({
      root: { type: 'leaf', id: 'pane-2', tabs: [], activeTabId: null }
    } as never)
    finish([entry('cfg-a'), entry('cfg-b')])

    expect(await run).toEqual({ kind: 'skipped' })
    expect(launchChat).not.toHaveBeenCalled()
  })

  it('keeps one start per pane and project, not per pane', async () => {
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'termul', path: '/work', isGitRepo: true },
        { id: 'p2', name: 'other', path: '/other', isGitRepo: true }
      ]
    } as never)
    const first = openNewChat({ reason: 'rail', projectId: 'p1' })
    const second = openNewChat({ reason: 'rail', projectId: 'p2' })
    expect(second).not.toBe(first)
  })

  it('leaves other start failures to the chat (error and Retry)', async () => {
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')
    await openNewChat({ reason: 'rail' })
    started.reject(new Error('spawn failed'))
    await new Promise((r) => setTimeout(r, 0))
    expect(showAgentLauncher).not.toHaveBeenCalled()
  })
})

describe('newChatPlaceholderOptions (the effort a new chat shows before it starts)', () => {
  const effort = (current: string) => ({
    id: 'effort',
    name: 'Effort',
    category: 'thought_level',
    type: 'select' as const,
    currentValue: current,
    options: ['low', 'medium', 'high'].map((value) => ({ value, name: value }))
  })
  const permission = {
    id: 'permission',
    name: 'Permission',
    category: 'mode',
    type: 'select' as const,
    currentValue: 'default',
    options: ['default', 'bypass'].map((value) => ({ value, name: value }))
  }
  // The agent's last session ran Opus at High: the cache holds its options.
  const cache = {
    models: {
      currentModelId: 'opus',
      availableModels: [
        { modelId: 'opus', name: 'Opus' },
        { modelId: 'haiku', name: 'Haiku' }
      ]
    },
    modes: null,
    configOptions: [effort('high'), permission]
  }

  it("drops another model's effort: the saved Haiku has no effort of its own", () => {
    const shown = newChatPlaceholderOptions(cache as never, {
      modelId: 'haiku',
      configValues: {}
    })
    expect(shown.models?.currentModelId).toBe('haiku')
    expect(shown.configOptions.find((o) => o.id === 'effort')).toBeUndefined()
    // Agent-wide options stay.
    expect(shown.configOptions.find((o) => o.id === 'permission')).toBeDefined()
  })

  it("paints the saved model's own effort", () => {
    const shown = newChatPlaceholderOptions(cache as never, {
      modelId: 'haiku',
      configValues: { effort: 'medium' }
    })
    expect(shown.configOptions.find((o) => o.id === 'effort')?.currentValue).toBe('medium')
  })

  it('keeps the cached effort when the saved model is the cached one', () => {
    const shown = newChatPlaceholderOptions(cache as never, { modelId: 'opus', configValues: {} })
    expect(shown.configOptions.find((o) => o.id === 'effort')?.currentValue).toBe('high')
  })

  it('openNewChat paints no stale effort on the placeholder and sends none', async () => {
    readComposerOptions.mockResolvedValue({ modelId: 'haiku', modelValues: {} })
    useAcpStore.setState({
      agentOptionsCache: { 'cfg-b': { ...cache, updatedAt: 1 } }
    } as never)

    await openNewChat({ reason: 'rail' })

    const request = launchChat.mock.calls[0]?.[0]
    expect(request.placeholder.models.currentModelId).toBe('haiku')
    expect(
      request.placeholder.configOptions.find((o: { id: string }) => o.id === 'effort')
    ).toBeUndefined()
    const { pending } = await request.beforeStart()
    expect(pending.modelId).toBe('haiku')
    expect(pending.configValues.effort).toBeUndefined()
  })
})

describe('replaceEmptyChat (another agent picked in an empty chat)', () => {
  function stubLaunch(): {
    createLaunchPlaceholder: ReturnType<typeof vi.fn>
    finalizeChatLaunch: ReturnType<typeof vi.fn>
    closeSession: ReturnType<typeof vi.fn>
    deleteHistorySession: ReturnType<typeof vi.fn>
    armAgentSwitch: ReturnType<typeof vi.fn>
  } {
    const stubs = {
      createLaunchPlaceholder: vi.fn(() => 'launch-r'),
      finalizeChatLaunch: vi.fn(async () => 'sess-r'),
      closeSession: vi.fn(async () => {}),
      deleteHistorySession: vi.fn(async () => {}),
      armAgentSwitch: vi.fn(async () => true)
    }
    useAcpStore.setState(stubs as never)
    return stubs
  }

  it('moves the empty chat to the new agent in the same tab, with no armed switch', async () => {
    const tabId = agentChatTabId('s-empty')
    pane([{ type: 'agent-chat', id: tabId, sessionId: 's-empty' }], tabId)
    useAcpStore.setState({
      sessions: {
        's-empty': { id: 's-empty', projectId: 'p1', cwd: '/work', status: 'active' }
      },
      messages: { 's-empty': [] }
    } as never)
    const stubs = stubLaunch()

    await replaceEmptyChat('s-empty', 'cfg-b', { modelId: 'glm-flash', modelConfigId: null })

    expect(stubs.createLaunchPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ configId: 'cfg-b', cwd: '/work', projectId: 'p1' })
    )
    expect(stubs.finalizeChatLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        placeholderId: 'launch-r',
        configId: 'cfg-b',
        pending: expect.objectContaining({ modelId: 'glm-flash' })
      })
    )
    const leaf = useWorkspaceStore.getState().root as { tabs: { sessionId: string }[] }
    expect(leaf.tabs.map((t) => t.sessionId)).toEqual(['launch-r'])
    expect(stubs.deleteHistorySession).toHaveBeenCalledWith('s-empty')
    expect(stubs.armAgentSwitch).not.toHaveBeenCalled()
  })

  it('keeps a chat that started while the pick was read', async () => {
    useAcpStore.setState({
      sessions: {
        's-empty': { id: 's-empty', projectId: 'p1', cwd: '/work', status: 'active' }
      },
      messages: { 's-empty': [] }
    } as never)
    const stubs = stubLaunch()
    readComposerOptions.mockImplementation(async () => {
      useAcpStore.setState({ messages: { 's-empty': [{ id: 'm', role: 'user', blocks: [] }] } })
      return null
    })

    await replaceEmptyChat('s-empty', 'cfg-b', { modelId: 'glm-flash', modelConfigId: null })

    expect(stubs.createLaunchPlaceholder).not.toHaveBeenCalled()
    expect(stubs.deleteHistorySession).not.toHaveBeenCalled()
  })
})
