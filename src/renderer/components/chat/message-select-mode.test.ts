import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enterMessageSelectMode,
  resetMessageSelectModeForTests,
  useMessageSelectMode
} from './message-select-mode'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

describe('useMessageSelectMode', () => {
  beforeEach(() => resetMessageSelectModeForTests())

  it('clears select mode when the selected message unmounts', () => {
    const first = renderHook(() => useMessageSelectMode('m1'))
    act(() => enterMessageSelectMode('m1'))
    expect(first.result.current.selecting).toBe(true)

    first.unmount()

    const reopened = renderHook(() => useMessageSelectMode('m1'))
    expect(reopened.result.current.selecting).toBe(false)
  })

  it('keeps select mode when another message unmounts', () => {
    const selected = renderHook(() => useMessageSelectMode('m1'))
    const other = renderHook(() => useMessageSelectMode('m2'))
    act(() => enterMessageSelectMode('m1'))

    other.unmount()

    expect(selected.result.current.selecting).toBe(true)
  })
})
