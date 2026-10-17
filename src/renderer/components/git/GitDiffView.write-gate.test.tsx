import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectNotWriteGated, expectWriteGated } from '@/lib/test-utils/write-gate'

const admits = vi.hoisted(() => ({ value: false }))
vi.mock('@/hooks/use-server-admits-remote-writes', () => ({
  useServerAdmitsRemoteWrites: () => admits.value
}))

import { GitDiffView } from './GitDiffView'

const DIFF = `diff --git a/foo.ts b/foo.ts
index 1234567..abcdefg 100644
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,3 @@
 const x = 1
-oldLine
+newLine
 const y = 2
`

const SIDES = [
  ['unstaged', 'Stage'],
  ['staged', 'Unstage']
] as const

describe('GitDiffView write gate', () => {
  const onStage = vi.fn()
  const onUnstage = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    admits.value = false
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  function renderDiff(side: 'unstaged' | 'staged', mode: 'inline' | 'split' = 'inline') {
    return render(
      <GitDiffView
        diff={DIFF}
        mode={mode}
        filePath="foo.ts"
        diffSide={side}
        onStageHunk={onStage}
        onUnstageHunk={onUnstage}
      />
    )
  }

  for (const [side, verb] of SIDES) {
    const action = side === 'unstaged' ? onStage : onUnstage

    for (const mode of ['inline', 'split'] as const) {
      it(`${verb.toLowerCase()} hunk (${mode}) is disabled with the read-only reason on a read-only server`, () => {
        renderDiff(side, mode)
        const hunk = screen.getByRole('button', { name: `${verb} hunk` })
        expectWriteGated(hunk)
        fireEvent.click(hunk)
        expect(action).not.toHaveBeenCalled()
      })

      it(`${verb.toLowerCase()} hunk (${mode}) stays enabled and unwrapped when writes are admitted`, () => {
        admits.value = true
        renderDiff(side, mode)
        const hunk = screen.getByRole('button', { name: `${verb} hunk` })
        expectNotWriteGated(hunk)
        fireEvent.click(hunk)
        expect(action).toHaveBeenCalledTimes(1)
      })
    }

    it(`${verb.toLowerCase()} selected lines is disabled with the read-only reason on a read-only server`, () => {
      renderDiff(side)
      fireEvent.click(screen.getAllByRole('button', { name: /line for partial staging/i })[0])
      const selected = screen.getByRole('button', { name: `${verb} selected lines` })
      expectWriteGated(selected)
      fireEvent.click(selected)
      expect(action).not.toHaveBeenCalled()
    })

    it(`${verb.toLowerCase()} selected lines stays enabled and unwrapped when writes are admitted`, () => {
      admits.value = true
      renderDiff(side)
      fireEvent.click(screen.getAllByRole('button', { name: /line for partial staging/i })[0])
      const selected = screen.getByRole('button', { name: `${verb} selected lines` })
      expectNotWriteGated(selected)
      fireEvent.click(selected)
      expect(action).toHaveBeenCalledTimes(1)
    })
  }
})
