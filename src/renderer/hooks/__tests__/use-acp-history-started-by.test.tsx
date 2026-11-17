import type { PersistedSessionSummary } from '@shared/types/web-protocol.types'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tauri: false,
  historyList: vi.fn(),
  paneDnd: { startChatDrag: vi.fn(), dragPayload: null }
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: () => mocks.tauri,
  cleanupTauriListener: vi.fn()
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/acp-history-api', () => ({
  acpHistoryApi: {
    list: mocks.historyList,
    listLegacy: vi.fn(async () => ({ sessions: [], legacyImportComplete: true }))
  }
}))
vi.mock('@/hooks/use-pane-dnd', () => ({ usePaneDnd: () => mocks.paneDnd }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { RailProjectChats } from '@/components/shell/rail/RailProjectChats'
import type { SessionIndexEntry } from '@/lib/acp-history-persistence'
import type { AcpTransport } from '@/lib/acp-transport'
import { _resetAcpTransportForTests, _setAcpTransportForTests } from '@/lib/acp-transport'
import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { _resetSessionIndexLoadGenerationForTesting, useAcpStore } from '@/stores/acp-store'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import type { Project } from '@/types/project'
import { useAcpHistory } from '../use-acp-history'

const project = { id: 'p1', name: 'Alpha', path: '/repo', isGitRepo: false } as Project

const parent = mockSessionIndexEntry({
  id: 'parent',
  title: 'Plan the refactor',
  cwd: '/repo',
  projectId: 'p1',
  lastActivityAt: 1
})
const worker = mockSessionIndexEntry({
  id: 'worker',
  title: 'Split the parser',
  cwd: '/repo',
  projectId: 'p1',
  lastActivityAt: 2,
  startedBy: 'parent'
})

function summaryOf(entry: SessionIndexEntry): PersistedSessionSummary {
  return {
    storageKey: entry.id,
    sessionId: entry.id,
    stableAgentNamespace: null,
    runtimeAgentId: entry.agentId,
    projectId: entry.projectId,
    cwd: entry.cwd,
    title: entry.title,
    createdAt: entry.createdAt,
    lastActivityAt: entry.lastActivityAt,
    status: 'closed',
    messageCount: 0,
    toolCount: 0,
    lastSeq: 0,
    resumeEligible: false,
    discovered: false,
    startedBy: entry.startedBy
  }
}

interface WatchHandlers {
  onState: (state: unknown) => void
  onDelta?: (delta: unknown) => void
}

function fakeTransport(listPersisted: () => Promise<PersistedSessionSummary[]>): {
  transport: AcpTransport
  chatHistory: () => WatchHandlers[]
} {
  const watchers: Array<[string, WatchHandlers]> = []
  const transport = {
    watches: {
      subscribe: (name: string, handlers: WatchHandlers) => {
        watchers.push([name, handlers])
        return () => undefined
      }
    },
    ...(mocks.tauri
      ? {}
      : { historyMode: () => 'server' as const, listPersistedSessions: listPersisted }),
    connect: async () => {},
    dispose: () => {}
  } as unknown as AcpTransport
  return {
    transport,
    chatHistory: () => watchers.filter(([name]) => name === 'chat_history').map(([, h]) => h)
  }
}

function Harness(): React.JSX.Element {
  useAcpHistory()
  return <RailProjectChats project={project} />
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.historyList.mockReset()
  _resetAcpTransportForTests(null)
  _resetSessionIndexLoadGenerationForTesting()
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ status: 'ready' })
  useAcpStore.setState({ sessionIndex: [], sessions: {}, agentConfigs: [] })
})

describe('a host-started chat reaches the Rail without a reload', () => {
  it('desktop: a chat_history delta refetches the index and names the parent', async () => {
    mocks.tauri = true
    mocks.historyList.mockResolvedValueOnce({ sessions: [parent], legacyImportComplete: true })
    const { transport, chatHistory } = fakeTransport(async () => [])
    _setAcpTransportForTests(transport)
    render(<Harness />)
    await screen.findByRole('button', { name: 'Plan the refactor' })

    for (const handlers of chatHistory()) handlers.onState([summaryOf(worker)])
    expect(useAcpStore.getState().sessionIndex.map((e) => e.id)).toEqual(['parent'])

    mocks.historyList.mockResolvedValueOnce({
      sessions: [parent, worker],
      legacyImportComplete: true
    })
    for (const handlers of chatHistory()) handlers.onDelta?.({ changed: ['worker'] })

    const row = await screen.findByRole('button', {
      name: 'Split the parser, Started by Plan the refactor'
    })
    expect(row).toHaveAttribute('title', 'Split the parser\nStarted by Plan the refactor')
  })

  it('web: the chat_history state installs the worker and names the parent', async () => {
    mocks.tauri = false
    const { transport, chatHistory } = fakeTransport(async () => [summaryOf(parent)])
    _setAcpTransportForTests(transport)
    render(<Harness />)
    await screen.findByRole('button', { name: 'Plan the refactor' })

    for (const handlers of chatHistory()) handlers.onState([parent, worker].map(summaryOf))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Split the parser, Started by Plan the refactor' })
      ).toBeInTheDocument()
    )
  })

  it('shows no parent when the index does not hold it', async () => {
    mocks.tauri = true
    mocks.historyList.mockResolvedValueOnce({
      sessions: [{ ...worker, startedBy: 'gone' }],
      legacyImportComplete: true
    })
    const { transport } = fakeTransport(async () => [])
    _setAcpTransportForTests(transport)
    render(<Harness />)

    const row = await screen.findByRole('button', { name: 'Split the parser' })
    expect(row).toHaveAttribute('title', 'Split the parser')
  })
})
