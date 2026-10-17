import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNotWriteGated, expectWriteGated } from '@/lib/test-utils/write-gate'

const admits = vi.hoisted(() => ({ value: false }))
vi.mock('@/hooks/use-server-admits-remote-writes', () => ({
  useServerAdmitsRemoteWrites: () => admits.value
}))

import { GitChangeList } from './GitChangeList'

const actions = {
  runStage: vi.fn(),
  runUnstage: vi.fn(),
  requestDiscard: vi.fn(),
  onApplyStash: vi.fn(),
  onPopStash: vi.fn(),
  onDropStash: vi.fn()
}

function renderList(variant: 'desktop' | 'mobile') {
  return render(
    <GitChangeList
      variant={variant}
      stagedFiles={[{ path: 'src/a.ts', status: 'modified', staged: true }]}
      unstagedFiles={[{ path: 'src/b.ts', status: 'modified', staged: false }]}
      stashes={[{ index: 0, name: 'stash@{0}', message: 'wip' }]}
      selectedFile={null}
      selectedStaged={false}
      selectionSection={null}
      selectedPaths={new Set()}
      stagedSelectionCount={0}
      unstagedSelectionCount={0}
      isMutating={false}
      isGenerating={false}
      onFileClick={vi.fn()}
      targetsFor={(path) => [path]}
      runStage={actions.runStage}
      runUnstage={actions.runUnstage}
      requestDiscard={actions.requestDiscard}
      onApplyStash={actions.onApplyStash}
      onPopStash={actions.onPopStash}
      onDropStash={actions.onDropStash}
    />
  )
}

const FILE_CONTROLS = [
  ['unstage all', 'Unstage all changes', 'runUnstage'],
  ['row unstage', 'Unstage changes', 'runUnstage'],
  ['discard all', 'Discard all changes', 'requestDiscard'],
  ['row discard', 'Discard changes', 'requestDiscard'],
  ['stage all', 'Stage all changes', 'runStage'],
  ['row stage', 'Stage changes', 'runStage']
] as const

const STASH_CONTROLS = [
  ['apply', 'Apply stash (keeps stash entry)', 'onApplyStash'],
  ['pop', 'Pop stash (applies and drops)', 'onPopStash'],
  ['drop', 'Drop stash', 'onDropStash']
] as const

describe('GitChangeList write gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    admits.value = false
  })

  for (const variant of ['desktop', 'mobile'] as const) {
    describe(variant, () => {
      for (const [name, label, action] of FILE_CONTROLS) {
        it(`${name} is disabled with the read-only reason on a read-only server`, () => {
          renderList(variant)
          const control = screen.getByRole('button', { name: label })
          expectWriteGated(control)
          fireEvent.click(control)
          expect(actions[action]).not.toHaveBeenCalled()
        })

        it(`${name} stays enabled and unwrapped when writes are admitted`, () => {
          admits.value = true
          renderList(variant)
          const control = screen.getByRole('button', { name: label })
          expectNotWriteGated(control)
          fireEvent.click(control)
          expect(actions[action]).toHaveBeenCalledTimes(1)
        })
      }

      for (const [name, label, action] of STASH_CONTROLS) {
        it(`stash ${name} is disabled with the read-only reason on a read-only server`, () => {
          renderList(variant)
          const control = screen.getByTitle(label, { selector: 'button' })
          expectWriteGated(control)
          fireEvent.click(control)
          expect(actions[action]).not.toHaveBeenCalled()
        })

        it(`stash ${name} stays enabled and unwrapped when writes are admitted`, () => {
          admits.value = true
          renderList(variant)
          const control = screen.getByTitle(label, { selector: 'button' })
          expectNotWriteGated(control)
          fireEvent.click(control)
          expect(actions[action]).toHaveBeenCalledWith(0)
        })
      }
    })
  }
})
