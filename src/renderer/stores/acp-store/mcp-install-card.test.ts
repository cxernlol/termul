import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpInstallRequestEvent } from '@/lib/mcp-install-request'

const SECRET = 'super-secret-token-1861'

const { answerMcpInstall, logFrontendError } = vi.hoisted(() => ({
  answerMcpInstall: vi.fn(async () => {}),
  logFrontendError: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() }
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: vi.fn(() => false),
  cleanupTauriListener: vi.fn()
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError }))
vi.mock('@/lib/acp-api', async (orig) => {
  const actual = await orig<typeof import('@/lib/acp-api')>()
  return { ...actual, answerMcpInstall }
})
vi.mock('@/lib/acp-mcp-persistence', async (orig) => {
  const actual = await orig<typeof import('@/lib/acp-mcp-persistence')>()
  return {
    ...actual,
    loadMcpServers: vi.fn(async () => [
      { id: 'srv-1', type: 'http', name: 'keys', url: 'https://example.com/mcp', enabled: true }
    ]),
    saveMcpServers: vi.fn(async () => {})
  }
})

import { useAcpStore } from '@/stores/acp-store'

const request: McpInstallRequestEvent = {
  agentId: 'agent-1',
  sessionId: 'sess-1',
  requestId: 'mcp-1',
  name: 'keys',
  title: 'Keys',
  transport: 'http',
  form: {
    source: { kind: 'catalog', name: 'com.example/keys', version: '1.0.0' },
    choice: null,
    title: 'Keys',
    fields: [
      {
        id: 'header/Authorization/token',
        label: 'token',
        target: { kind: 'header', name: 'Authorization' },
        variable: 'token',
        isRequired: true,
        isSecret: true,
        format: 'string',
        choices: null,
        default: null,
        placeholder: null,
        description: null
      }
    ]
  },
  consent: {
    transport: 'http',
    command: null,
    argv: [],
    url: 'https://example.com/mcp',
    env: [],
    headers: [],
    hostMounts: [],
    warnings: [],
    provenance: null
  },
  planId: 'plan-1',
  launchDigest: 'sha256:abc'
}

describe('mcp install approval store', () => {
  beforeEach(() => {
    answerMcpInstall.mockReset().mockResolvedValue(undefined)
    logFrontendError.mockReset()
    useAcpStore.setState({ pendingMcpInstalls: {}, mcpServers: [], mcpServersLoaded: false })
  })

  it('keeps the card and never stores the secret the user typed', async () => {
    useAcpStore.getState()._onMcpInstallRequest(request)
    expect(useAcpStore.getState().pendingMcpInstalls['mcp-1']?.title).toBe('Keys')
    expect(useAcpStore.getState().pendingMcpInstalls['mcp-1']?.consent?.url).toBe(
      'https://example.com/mcp'
    )

    await useAcpStore
      .getState()
      .answerMcpInstall('mcp-1', 'approve', {}, { 'header/Authorization/token': SECRET })

    expect(answerMcpInstall).toHaveBeenCalledWith({
      requestId: 'mcp-1',
      sessionId: 'sess-1',
      decision: 'approve',
      inputs: {},
      secretValues: { 'header/Authorization/token': SECRET },
      planId: 'plan-1',
      launchDigest: 'sha256:abc'
    })
    expect(JSON.stringify(useAcpStore.getState().pendingMcpInstalls)).not.toContain(SECRET)
    expect(JSON.stringify(logFrontendError.mock.calls)).not.toContain(SECRET)
  })

  it('decline removes the card and saves nothing', async () => {
    useAcpStore.getState()._onMcpInstallRequest(request)
    await useAcpStore.getState().answerMcpInstall('mcp-1', 'decline')
    useAcpStore.getState()._onMcpInstallResolved({
      agentId: 'agent-1',
      sessionId: 'sess-1',
      requestId: 'mcp-1',
      outcome: 'declined',
      nextSteps: [],
      oauth: false
    })
    expect(useAcpStore.getState().pendingMcpInstalls['mcp-1']).toBeUndefined()
    expect(useAcpStore.getState().mcpServers).toEqual([])
  })

  it('a resolved install shows next steps and reloads the server list', async () => {
    useAcpStore.getState()._onMcpInstallRequest(request)
    useAcpStore.getState()._onMcpRegistryChanged()
    useAcpStore.getState()._onMcpInstallResolved({
      agentId: 'agent-1',
      sessionId: 'sess-1',
      requestId: 'mcp-1',
      outcome: 'installed',
      name: 'keys',
      serverId: 'srv-1',
      oauth: true,
      nextSteps: [{ kind: 'new_session', message: 'Start a new chat.' }]
    })
    expect(useAcpStore.getState().pendingMcpInstalls['mcp-1']?.result).toMatchObject({
      outcome: 'installed',
      oauth: true,
      serverId: 'srv-1'
    })
    await vi.waitFor(() => {
      expect(useAcpStore.getState().mcpServers.map((server) => server.name)).toEqual(['keys'])
    })
  })
})
