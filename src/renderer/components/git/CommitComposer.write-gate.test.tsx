import type { GitCommitContext } from '@shared/types/ipc.types'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNotWriteGated, expectWriteGated } from '@/lib/test-utils/write-gate'
import { READ_ONLY_SERVER_REASON } from '@/lib/write-gate'

const admits = vi.hoisted(() => ({ value: false }))
vi.mock('@/hooks/use-server-admits-remote-writes', () => ({
  useServerAdmitsRemoteWrites: () => admits.value
}))

import { CommitComposer } from './CommitComposer'

const handlers = { onCommit: vi.fn(), onPush: vi.fn() }

function context(overrides: Partial<GitCommitContext> = {}): GitCommitContext {
  return {
    branch: 'dev',
    hasUpstream: true,
    ahead: 1,
    behind: 0,
    stagedCount: 1,
    hasHead: true,
    lastSubject: '',
    lastBody: '',
    ...overrides
  }
}

function renderComposer(variant: 'desktop' | 'mobile', commitContext: GitCommitContext) {
  return render(
    <CommitComposer
      variant={variant === 'mobile' ? 'mobile' : undefined}
      summary="msg"
      onSummaryChange={vi.fn()}
      description=""
      onDescriptionChange={vi.fn()}
      amend={false}
      onToggleAmend={vi.fn()}
      isCommitting={false}
      isGenerating={false}
      isPushing={false}
      commitContext={commitContext}
      stagedCount={1}
      hasUsableAgent
      canGenerate
      canCommit
      onGenerateMessage={vi.fn()}
      onCommit={handlers.onCommit}
      onPush={handlers.onPush}
    />
  )
}

describe('CommitComposer write gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    admits.value = false
  })

  for (const variant of ['desktop', 'mobile'] as const) {
    describe(variant, () => {
      it('Commit is disabled with the read-only reason on a read-only server', () => {
        renderComposer(variant, context())
        const commit = screen.getByRole('button', { name: /Commit to dev/ })
        expectWriteGated(commit)
        fireEvent.click(commit)
        expect(handlers.onCommit).not.toHaveBeenCalled()
      })

      it('Commit stays enabled and unwrapped when writes are admitted', () => {
        admits.value = true
        renderComposer(variant, context())
        const commit = screen.getByRole('button', { name: /Commit to dev/ })
        expectNotWriteGated(commit)
        fireEvent.click(commit)
        expect(handlers.onCommit).toHaveBeenCalledTimes(1)
      })

      it('Push is disabled with the read-only reason on a read-only server', () => {
        renderComposer(variant, context())
        const push = screen.getByRole('button', { name: /Push 1/ })
        expectWriteGated(push)
        fireEvent.click(push)
        expect(handlers.onPush).not.toHaveBeenCalled()
      })

      it('Push stays enabled and unwrapped when writes are admitted', () => {
        admits.value = true
        renderComposer(variant, context())
        const push = screen.getByRole('button', { name: /Push 1/ })
        expectNotWriteGated(push)
        fireEvent.click(push)
        expect(handlers.onPush).toHaveBeenCalledTimes(1)
      })
    })
  }

  describe('mobile overflow menu (no upstream)', () => {
    const noUpstream = () => context({ hasUpstream: false, ahead: 0 })

    function openMenu() {
      const trigger = screen.getByRole('button', { name: 'More actions' })
      expect(trigger).not.toBeDisabled()
      fireEvent.keyDown(trigger, { key: 'Enter' })
    }

    it('Publish branch item is disabled with the read-only reason on a read-only server', async () => {
      renderComposer('mobile', noUpstream())
      openMenu()
      const item = await screen.findByRole('menuitem', { name: /Publish branch/ })
      expectWriteGated(item)
      expect(item).toHaveTextContent(READ_ONLY_SERVER_REASON)
      fireEvent.click(item)
      expect(handlers.onPush).not.toHaveBeenCalled()
    })

    it('Publish branch item stays enabled and unwrapped when writes are admitted', async () => {
      admits.value = true
      renderComposer('mobile', noUpstream())
      openMenu()
      const item = await screen.findByRole('menuitem', { name: /Publish branch/ })
      expectNotWriteGated(item)
      fireEvent.click(item)
      expect(handlers.onPush).toHaveBeenCalledTimes(1)
    })
  })

  it('desktop Publish branch is disabled with the read-only reason on a read-only server', () => {
    renderComposer('desktop', context({ hasUpstream: false, ahead: 0 }))
    const publish = screen.getByRole('button', { name: /Publish branch/ })
    expectWriteGated(publish)
    fireEvent.click(publish)
    expect(handlers.onPush).not.toHaveBeenCalled()
  })
})
