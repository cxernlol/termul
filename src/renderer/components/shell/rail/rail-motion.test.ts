import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RAIL_FADE_MS, RAIL_WIDTH_MS, useRailMotion } from './rail-motion'

describe('useRailMotion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = (expanded: boolean, reducedMotion = false) =>
    renderHook(({ expanded, reducedMotion }) => useRailMotion(expanded, reducedMotion), {
      initialProps: { expanded, reducedMotion }
    })

  it('starts idle in the persisted density', () => {
    expect(setup(true).result.current).toEqual({ phase: 'idle', density: 'expanded' })
    expect(setup(false).result.current).toEqual({ phase: 'idle', density: 'collapsed' })
  })

  it('keeps the expanded rows while collapsing, then settles collapsed', () => {
    const { result, rerender } = setup(true)
    rerender({ expanded: false, reducedMotion: false })
    expect(result.current).toEqual({ phase: 'collapsing', density: 'expanded' })

    act(() => vi.advanceTimersByTime(RAIL_WIDTH_MS))
    expect(result.current).toEqual({ phase: 'settling', density: 'collapsed' })

    act(() => vi.advanceTimersByTime(RAIL_FADE_MS))
    expect(result.current).toEqual({ phase: 'idle', density: 'collapsed' })
  })

  it('switches to the expanded rows at once and ends idle', () => {
    const { result, rerender } = setup(false)
    rerender({ expanded: true, reducedMotion: false })
    expect(result.current).toEqual({ phase: 'expanding', density: 'expanded' })

    act(() => vi.advanceTimersByTime(RAIL_WIDTH_MS))
    expect(result.current).toEqual({ phase: 'idle', density: 'expanded' })
  })

  it('reverses a collapse that is in progress', () => {
    const { result, rerender } = setup(true)
    rerender({ expanded: false, reducedMotion: false })
    act(() => vi.advanceTimersByTime(RAIL_WIDTH_MS / 2))
    rerender({ expanded: true, reducedMotion: false })
    expect(result.current).toEqual({ phase: 'expanding', density: 'expanded' })

    // The collapse timer does not fire into the new phase.
    act(() => vi.advanceTimersByTime(RAIL_WIDTH_MS / 2))
    expect(result.current.phase).toBe('expanding')
    act(() => vi.advanceTimersByTime(RAIL_WIDTH_MS))
    expect(result.current).toEqual({ phase: 'idle', density: 'expanded' })
  })

  it('changes in one frame under reduced motion', () => {
    const { result, rerender } = setup(true, true)
    rerender({ expanded: false, reducedMotion: true })
    expect(result.current).toEqual({ phase: 'idle', density: 'collapsed' })
    rerender({ expanded: true, reducedMotion: true })
    expect(result.current).toEqual({ phase: 'idle', density: 'expanded' })
  })
})
