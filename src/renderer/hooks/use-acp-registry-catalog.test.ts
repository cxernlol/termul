import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchRegistrySnapshot } = vi.hoisted(() => ({ fetchRegistrySnapshot: vi.fn() }))

vi.mock('@/lib/acp-api', () => ({ acpApi: { fetchRegistrySnapshot } }))
vi.mock('@/lib/api', () => ({ acpCatalogApi: { setCatalogOptIn: vi.fn() } }))

import { useAcpRegistryCatalog } from '@/hooks/use-acp-registry-catalog'
import type { RegistryCheckReason } from '@/lib/acp-api'
import { REGISTRY_AGENTS } from '@/lib/agents/acp-registry'

beforeEach(() => {
  fetchRegistrySnapshot.mockReset()
})

async function check(reason: RegistryCheckReason) {
  const { result } = renderHook(() => useAcpRegistryCatalog())
  let summary: Awaited<ReturnType<typeof result.current.checkForUpdates>> = null
  await act(async () => {
    summary = await result.current.checkForUpdates(reason)
  })
  return summary
}

describe('useAcpRegistryCatalog.checkForUpdates', () => {
  it('marks a manual check that fell back to the cache as unreachable', async () => {
    fetchRegistrySnapshot.mockResolvedValue({
      agents: REGISTRY_AGENTS,
      source: 'cache',
      fetchedAt: '2026-10-15T12:00:00+00:00'
    })

    const summary = await check('manual')

    expect(fetchRegistrySnapshot).toHaveBeenCalledWith('manual')
    expect(summary).toEqual({
      updatedCount: 0,
      newAgentIds: [],
      fetchedAt: '2026-10-15T12:00:00+00:00',
      source: 'cache',
      registryUnreachable: true
    })
  })

  it('reports a manual check served by the network as reachable', async () => {
    fetchRegistrySnapshot.mockResolvedValue({
      agents: REGISTRY_AGENTS,
      source: 'network',
      fetchedAt: '2026-10-16T09:30:00+00:00'
    })

    expect(await check('manual')).toMatchObject({
      source: 'network',
      registryUnreachable: false
    })
  })

  it('never flags a background check as unreachable, even when the host served its cache', async () => {
    fetchRegistrySnapshot.mockResolvedValue({
      agents: REGISTRY_AGENTS,
      source: 'cache',
      fetchedAt: '2026-10-15T12:00:00+00:00'
    })

    const summary = await check('background')

    expect(fetchRegistrySnapshot).toHaveBeenCalledWith('background')
    expect(summary).toMatchObject({ source: 'cache', registryUnreachable: false })
  })
})
