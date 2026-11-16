import { beforeEach, describe, expect, it, vi } from 'vitest'

const rename = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@/lib/acp-api', () => ({ acpRenameQuickChat: (...args: unknown[]) => rename(...args) }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { useAcpStore } from '@/stores/acp-store'
import { renameQuickChat } from './quick-chat-rename'

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const title = (): string | undefined =>
  useAcpStore.getState().sessionIndex.find((entry) => entry.id === 'q')?.title

describe('renameQuickChat', () => {
  beforeEach(() => {
    rename.mockReset()
    toastError.mockReset()
    useAcpStore.setState({
      sessions: {},
      sessionIndex: [mockSessionIndexEntry({ id: 'q', title: 'A', kind: 'quick' })]
    })
  })

  it('does nothing for a blank or unchanged title', () => {
    renameQuickChat('q', '   ', 'A')
    renameQuickChat('q', 'A', 'A')
    expect(rename).not.toHaveBeenCalled()
  })

  it('rolls back to the old title when the host refuses', async () => {
    rename.mockRejectedValue(new Error('no'))
    renameQuickChat('q', 'B', 'A')
    expect(title()).toBe('B')
    await vi.waitFor(() => expect(title()).toBe('A'))
    expect(toastError).toHaveBeenCalled()
  })

  it('does not let an older failure undo a newer rename', async () => {
    const first = deferred()
    const second = deferred()
    rename.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    renameQuickChat('q', 'B', 'A')
    renameQuickChat('q', 'C', 'B')
    first.reject(new Error('no'))
    await vi.waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(title()).toBe('C')
    second.resolve()
    await second.promise
    expect(title()).toBe('C')
  })

  it('rolls a newer failure back to the last title the host stored', async () => {
    const first = deferred()
    const second = deferred()
    rename.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    renameQuickChat('q', 'B', 'A')
    renameQuickChat('q', 'C', 'B')
    first.resolve()
    await first.promise
    second.reject(new Error('no'))
    await vi.waitFor(() => expect(title()).toBe('B'))
  })
})
