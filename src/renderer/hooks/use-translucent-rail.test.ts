import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/stores/app-settings-store'
import { DEFAULT_APP_SETTINGS } from '@/types/settings'

const platform = vi.hoisted(() => ({ isMac: true }))
const nativeWindow = vi.hoisted(() => ({
  setTheme: vi.fn(async (_theme: string | null) => {}),
  setEffects: vi.fn(async (_effects: unknown) => {}),
  clearEffects: vi.fn(async () => {})
}))

vi.mock('@/lib/platform', () => platform)
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(async () => {}) }))
vi.mock('@/lib/tauri-window', () => ({
  Effect: { Sidebar: 'sidebar' },
  EffectState: { FollowsWindowActiveState: 'followsWindowActiveState' },
  getCurrentWindow: () => nativeWindow
}))

import { logFrontendError } from '@/lib/log-api'
import {
  applyTranslucentRail,
  isTranslucentRailSupported,
  TRANSLUCENT_RAIL_ATTR,
  useTranslucentRailSync
} from './use-translucent-rail'

const tauriWindow = window as unknown as Record<string, unknown>
const root = document.documentElement

function loadSettings(translucentRail: boolean, appearanceMode: 'light' | 'dark' = 'dark'): void {
  useAppSettingsStore
    .getState()
    .setSettings({ ...DEFAULT_APP_SETTINGS, translucentRail, appearanceMode })
}

describe('translucent Rail', () => {
  beforeEach(async () => {
    tauriWindow.__TAURI_INTERNALS__ = {}
    platform.isMac = true
    // Reset the module's applied state from any earlier test.
    await applyTranslucentRail(false, 'dark').catch(() => {})
    vi.clearAllMocks()
    root.removeAttribute(TRANSLUCENT_RAIL_ATTR)
  })

  afterEach(() => {
    delete tauriWindow.__TAURI_INTERNALS__
    root.removeAttribute(TRANSLUCENT_RAIL_ATTR)
  })

  it('is supported only in the macOS desktop app', () => {
    expect(isTranslucentRailSupported()).toBe(true)
    platform.isMac = false
    expect(isTranslucentRailSupported()).toBe(false)
    platform.isMac = true
    delete tauriWindow.__TAURI_INTERNALS__
    expect(isTranslucentRailSupported()).toBe(false)
  })

  it('applies the window theme and sidebar material before the CSS lets it through', async () => {
    await applyTranslucentRail(true, 'light')
    expect(nativeWindow.setTheme).toHaveBeenCalledWith('light')
    expect(nativeWindow.setEffects).toHaveBeenCalledWith({
      effects: ['sidebar'],
      state: 'followsWindowActiveState'
    })
    expect(root.hasAttribute(TRANSLUCENT_RAIL_ATTR)).toBe(true)
  })

  it('clears the material and resets the window theme when turned off', async () => {
    await applyTranslucentRail(true, 'dark')
    await applyTranslucentRail(false, 'dark')
    expect(root.hasAttribute(TRANSLUCENT_RAIL_ATTR)).toBe(false)
    expect(nativeWindow.clearEffects).toHaveBeenCalledTimes(1)
    expect(nativeWindow.setTheme).toHaveBeenLastCalledWith(null)
  })

  it('makes no native call when it was never on', async () => {
    await applyTranslucentRail(false, 'dark')
    expect(nativeWindow.clearEffects).not.toHaveBeenCalled()
    expect(nativeWindow.setTheme).not.toHaveBeenCalled()
  })

  it('keeps the Rail solid when the material cannot be applied', async () => {
    nativeWindow.setEffects.mockRejectedValueOnce(new Error('no effects'))
    await expect(applyTranslucentRail(true, 'dark')).rejects.toThrow('no effects')
    expect(root.hasAttribute(TRANSLUCENT_RAIL_ATTR)).toBe(false)
  })

  it('resets the window theme on off when only the material failed', async () => {
    nativeWindow.setEffects.mockRejectedValueOnce(new Error('no effects'))
    await expect(applyTranslucentRail(true, 'dark')).rejects.toThrow('no effects')

    await applyTranslucentRail(false, 'dark')
    expect(nativeWindow.clearEffects).not.toHaveBeenCalled()
    expect(nativeWindow.setTheme).toHaveBeenLastCalledWith(null)
  })

  it('syncs the saved setting and logs a failure', async () => {
    nativeWindow.setEffects.mockRejectedValueOnce(new Error('no effects'))
    loadSettings(true)
    renderHook(() => useTranslucentRailSync())
    await waitFor(() =>
      expect(logFrontendError).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', source: 'useTranslucentRailSync' })
      )
    )
    expect(root.hasAttribute(TRANSLUCENT_RAIL_ATTR)).toBe(false)
  })

  it('does nothing outside the macOS desktop app', async () => {
    platform.isMac = false
    loadSettings(true)
    renderHook(() => useTranslucentRailSync())
    await Promise.resolve()
    expect(nativeWindow.setEffects).not.toHaveBeenCalled()
    expect(root.hasAttribute(TRANSLUCENT_RAIL_ATTR)).toBe(false)
  })

  it('follows the app appearance while on', async () => {
    loadSettings(true, 'dark')
    renderHook(() => useTranslucentRailSync())
    await waitFor(() => expect(nativeWindow.setTheme).toHaveBeenCalledWith('dark'))
    useAppSettingsStore.getState().updateSetting('appearanceMode', 'light')
    await waitFor(() => expect(nativeWindow.setTheme).toHaveBeenCalledWith('light'))
  })
})
