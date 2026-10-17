import type { PersistenceKeyChange } from '@shared/types/ipc.types'
import { PersistenceKeys } from '@shared/types/persistence.types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/stores/app-settings-store'
import { DEFAULT_APP_SETTINGS, type TerminalProfile } from '@/types/settings'
import { useAppSettingsLoader, useResetAppSettings, useUpdateAppSetting } from './use-app-settings'

// The host store as both surfaces reach it: values cross a JSON wire.
const host = vi.hoisted(() => ({
  records: new Map<string, string>(),
  watchers: new Map<string, (change: PersistenceKeyChange) => void>()
}))

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('@/lib/api', () => {
  const write = async (key: string, value: unknown) => {
    host.records.set(key, JSON.stringify(value))
    return { success: true, data: undefined }
  }
  return {
    acpApi: {
      setTurnTimeout: vi.fn(async () => {}),
      setTurnIdleTimeout: vi.fn(async () => {}),
      setSessionNewTimeout: vi.fn(async () => {}),
      setSessionReopenTimeout: vi.fn(async () => {}),
      setAgentIdleWindow: vi.fn(async () => {}),
      getAgentIdleWindow: vi.fn(async () => ({ secs: 1800, source: 'default' }))
    },
    persistenceApi: {
      read: async (key: string) => {
        const raw = host.records.get(key)
        return raw === undefined
          ? { success: false, error: 'Key not found', code: 'KEY_NOT_FOUND' }
          : { success: true, data: JSON.parse(raw) }
      },
      write,
      writeDebounced: write,
      watchShared: (key: string, listener: (change: PersistenceKeyChange) => void) => {
        host.watchers.set(key, listener)
        return () => host.watchers.delete(key)
      }
    }
  }
})

const profile: TerminalProfile = {
  id: 'p1',
  name: 'Node dev',
  shell: '/bin/zsh',
  args: ['-l'],
  cwd: '/work/app',
  env: { NODE_ENV: 'development' }
}

async function loadSettings(): Promise<void> {
  useAppSettingsStore.setState({ settings: DEFAULT_APP_SETTINGS, isLoaded: false })
  renderHook(() => useAppSettingsLoader())
  await waitFor(() => expect(useAppSettingsStore.getState().isLoaded).toBe(true))
}

describe('terminal profiles in app settings', () => {
  beforeEach(() => {
    host.records.clear()
    host.watchers.clear()
  })

  it('come back from the host store as they were saved', async () => {
    await loadSettings()
    const { result } = renderHook(() => useUpdateAppSetting())
    await act(() => result.current('terminalProfiles', [profile]))

    await loadSettings()

    expect(useAppSettingsStore.getState().settings.terminalProfiles).toEqual([profile])
  })

  it('drop a stored or remotely saved profile whose env key is invalid', async () => {
    const bad = { ...profile, id: 'p2', env: { 'BAD-KEY': 'x' } }
    host.records.set(
      PersistenceKeys.appSettings,
      JSON.stringify({ ...DEFAULT_APP_SETTINGS, terminalProfiles: [profile, bad] })
    )
    await loadSettings()
    expect(useAppSettingsStore.getState().settings.terminalProfiles).toEqual([profile])

    act(() => {
      host.watchers.get(PersistenceKeys.appSettings)?.({
        exists: true,
        data: { ...DEFAULT_APP_SETTINGS, terminalProfiles: [bad, { ...profile, name: 'Renamed' }] }
      })
    })
    expect(useAppSettingsStore.getState().settings.terminalProfiles).toEqual([
      { ...profile, name: 'Renamed' }
    ])
  })

  it('survive Reset to Defaults while the preferences reset', async () => {
    host.records.set(
      PersistenceKeys.appSettings,
      JSON.stringify({ ...DEFAULT_APP_SETTINGS, terminalFontSize: 20, terminalProfiles: [profile] })
    )
    await loadSettings()

    const { result } = renderHook(() => useResetAppSettings())
    await act(() => result.current())

    const saved = JSON.parse(host.records.get(PersistenceKeys.appSettings) ?? 'null')
    expect(saved.terminalFontSize).toBe(14)
    expect(saved.terminalProfiles).toEqual([profile])
  })
})
