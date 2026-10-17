import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNotWriteGated, expectWriteGated } from '@/lib/test-utils/write-gate'
import { READ_ONLY_SERVER_REASON } from '@/lib/write-gate'

const admits = vi.hoisted(() => ({ value: false }))
vi.mock('@/hooks/use-server-admits-remote-writes', () => ({
  useServerAdmitsRemoteWrites: () => admits.value
}))

import { GitPanelHeader } from './GitPanelHeader'

const handlers = {
  onCreateBranch: vi.fn(),
  onSwitchBranch: vi.fn(),
  onOpenStash: vi.fn()
}

function renderHeader(variant: 'desktop' | 'mobile') {
  return render(
    <GitPanelHeader
      variant={variant}
      branches={['dev', 'feature/x']}
      currentBranch="dev"
      hasUncommittedChanges
      isGenerating={false}
      searchQuery=""
      onSearchQueryChange={vi.fn()}
      onCreateBranch={handlers.onCreateBranch}
      onSwitchBranch={handlers.onSwitchBranch}
      onOpenStash={handlers.onOpenStash}
    />
  )
}

function openBranchMenu() {
  // The trigger stays enabled so branches remain viewable on a read-only server.
  const trigger = screen.getByRole('button', { name: /dev/ })
  expect(trigger).not.toBeDisabled()
  fireEvent.keyDown(trigger, { key: 'Enter' })
}

describe('GitPanelHeader write gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    admits.value = false
  })

  for (const variant of ['desktop', 'mobile'] as const) {
    describe(variant, () => {
      it('Stash changes is disabled with the read-only reason on a read-only server', () => {
        renderHeader(variant)
        const stash = screen.getByTitle('Stash changes', { selector: 'button' })
        expectWriteGated(stash)
        fireEvent.click(stash)
        expect(handlers.onOpenStash).not.toHaveBeenCalled()
      })

      it('Stash changes stays enabled and unwrapped when writes are admitted', () => {
        admits.value = true
        renderHeader(variant)
        const stash = screen.getByTitle('Stash changes', { selector: 'button' })
        expectNotWriteGated(stash)
        fireEvent.click(stash)
        expect(handlers.onOpenStash).toHaveBeenCalledTimes(1)
      })

      it('branch create is disabled with the read-only reason on a read-only server', async () => {
        renderHeader(variant)
        openBranchMenu()
        const create = await screen.findByRole('menuitem', { name: /Create new branch/ })
        expectWriteGated(create)
        expect(create).toHaveTextContent(READ_ONLY_SERVER_REASON)
        fireEvent.click(create)
        expect(handlers.onCreateBranch).not.toHaveBeenCalled()
      })

      it('branch create stays enabled and unwrapped when writes are admitted', async () => {
        admits.value = true
        renderHeader(variant)
        openBranchMenu()
        const create = await screen.findByRole('menuitem', { name: /Create new branch/ })
        expectNotWriteGated(create)
        fireEvent.click(create)
        expect(handlers.onCreateBranch).toHaveBeenCalledTimes(1)
      })

      it('branch switch is disabled with the read-only reason on a read-only server', async () => {
        renderHeader(variant)
        openBranchMenu()
        const row = await screen.findByRole('menuitem', { name: /feature\/x/ })
        expectWriteGated(row)
        fireEvent.click(row)
        expect(handlers.onSwitchBranch).not.toHaveBeenCalled()
      })

      it('branch switch stays enabled and unwrapped when writes are admitted', async () => {
        admits.value = true
        renderHeader(variant)
        openBranchMenu()
        const row = await screen.findByRole('menuitem', { name: /feature\/x/ })
        expectNotWriteGated(row)
        fireEvent.click(row)
        expect(handlers.onSwitchBranch).toHaveBeenCalledWith('feature/x')
      })
    })
  }
})
