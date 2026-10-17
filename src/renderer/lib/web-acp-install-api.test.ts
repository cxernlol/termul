import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock isTauriContext to return false so the adapter uses fetch
vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: () => false
}))

import { __resetCommandEngineForTesting, AWAITED_RESEND_DELAYS_MS } from './command-engine'
import { __clearCommandJournalForTesting } from './command-journal'
import { webAcpInstallApi } from './web-acp-install-api'

/** Run the install through the whole same-id resend ladder (an unanswered command is resent). */
async function installUnanswered() {
  vi.useFakeTimers()
  const pending = webAcpInstallApi.installAgent('opencode')
  for (const delay of AWAITED_RESEND_DELAYS_MS) await vi.advanceTimersByTimeAsync(delay)
  return pending
}

describe('webAcpInstallApi', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    __clearCommandJournalForTesting()
    __resetCommandEngineForTesting()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('installAgent hits POST /acp/install with { agentId } body and maps IpcBody success', async () => {
    const outcome = { command: '/path/to/opencode', args: ['acp'] }
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: outcome })
    })

    const result = await webAcpInstallApi.installAgent('opencode')

    expect(fetchMock).toHaveBeenCalledWith(
      `${window.location.origin}/acp/install`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Command-Id': expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/)
        }),
        body: JSON.stringify({ agentId: 'opencode' })
      })
    )
    expect(result.success).toBe(true)
    expect(result.data).toEqual(outcome)
  })

  it('installAgent maps non-2xx HTTP to NETWORK_ERROR', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    })

    const result = await installUnanswered()

    expect(result.success).toBe(false)
    expect(result.code).toBe('NETWORK_ERROR')
  })

  it('installAgent maps fetch throw to NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    const result = await installUnanswered()

    expect(result.success).toBe(false)
    expect(result.code).toBe('NETWORK_ERROR')
  })

  it('installAgent preserves a structured failure body on non-2xx (web auth gate 401)', async () => {
    // The auth gate answers 401 with a valid IpcBody — the adapter must keep
    // the server's code/message instead of collapsing to NETWORK_ERROR.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
    })

    const result = await webAcpInstallApi.installAgent('opencode')

    expect(result).toEqual({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
  })

  it('installAgent falls back to NETWORK_ERROR when a non-2xx body is not a valid IpcBody', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({})
    })

    const result = await installUnanswered()

    expect(result.success).toBe(false)
    expect(result.code).toBe('NETWORK_ERROR')
  })

  it('installAgent maps IpcBody error (INTEGRITY_MISMATCH)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: 'downloaded archive sha256 does not match the catalog digest',
        code: 'INTEGRITY_MISMATCH'
      })
    })

    const result = await webAcpInstallApi.installAgent('tampered')

    expect(result.success).toBe(false)
    expect(result.code).toBe('INTEGRITY_MISMATCH')
  })

  describe('command state machine (same id on a resend, new id after a rejection)', () => {
    const installCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/acp/install'))
    const header = () =>
      installCalls().map(
        ([, init]) => (init as { headers: Record<string, string> }).headers['X-Command-Id']
      )
    const reply = (payload: unknown) => ({ ok: true, json: async () => payload })

    it('an in-progress receipt is neither accepted nor rejected: the same id is resent until the host answers', async () => {
      vi.useFakeTimers()
      fetchMock
        .mockResolvedValueOnce(reply({ success: true, receipt: 'in_progress' }))
        .mockResolvedValueOnce(reply({ success: true, data: { command: 'c', args: [] } }))
      const pending = webAcpInstallApi.installAgent('opencode')
      await vi.advanceTimersByTimeAsync(AWAITED_RESEND_DELAYS_MS[0])
      await expect(pending).resolves.toMatchObject({ success: true })
      const ids = header()
      expect(ids).toHaveLength(2)
      expect(ids[1]).toBe(ids[0])
    })

    it('OUTCOME_UNKNOWN is not resent and the next try is a new intent with a NEW id', async () => {
      fetchMock.mockResolvedValue(reply({ success: false, error: 'gone', code: 'OUTCOME_UNKNOWN' }))
      await expect(webAcpInstallApi.installAgent('opencode')).resolves.toMatchObject({
        success: false,
        code: 'OUTCOME_UNKNOWN'
      })
      expect(installCalls()).toHaveLength(1)
      await webAcpInstallApi.installAgent('opencode')
      const ids = header()
      expect(ids).toHaveLength(2)
      expect(ids[1]).not.toBe(ids[0])
    })

    it('a definite rejection ends the command and the next try mints a new id', async () => {
      fetchMock.mockResolvedValue(
        reply({ success: false, error: 'bad digest', code: 'INTEGRITY_MISMATCH' })
      )
      await webAcpInstallApi.installAgent('opencode')
      await webAcpInstallApi.installAgent('opencode')
      const ids = header()
      expect(ids[1]).not.toBe(ids[0])
    })

    it('a lost reply that never recovers stays unresolved: the next try reuses the SAME id', async () => {
      const first = await installUnanswered()
      expect(first).toMatchObject({ success: false, code: 'NETWORK_ERROR' })
      const firstIds = new Set(header())
      expect(firstIds.size).toBe(1)

      vi.useRealTimers()
      fetchMock.mockReset()
      fetchMock.mockResolvedValue(reply({ success: true, data: { command: 'c', args: [] } }))
      await webAcpInstallApi.installAgent('opencode')
      expect(header()).toEqual([...firstIds])
    })
  })
})
