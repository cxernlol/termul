import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { deleteConversation } from './delete-conversation'

describe('deleteConversation', () => {
  const deleteHistorySession = vi.fn(async () => undefined)

  beforeEach(() => {
    deleteHistorySession.mockClear()
    useAcpStore.setState({
      deleteHistorySession,
      sessionIndex: [
        mockSessionIndexEntry({ id: 'first', projectId: 'p1' }),
        mockSessionIndexEntry({ id: 'second', projectId: 'p1', continuedFrom: 'first' })
      ]
    })
  })

  it('returns every id it deletes, the folded ancestor included', () => {
    const deleted = deleteConversation('second', 'test')
    expect([...deleted].sort()).toEqual(['first', 'second'])
    expect(deleteHistorySession).toHaveBeenCalledWith('first')
    expect(deleteHistorySession).toHaveBeenCalledWith('second')
  })
})
