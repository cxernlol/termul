import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, runtimeMock, platformMock, logMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  runtimeMock: { isTauri: true },
  platformMock: { isMac: true },
  logMock: vi.fn(async (_payload: unknown) => {})
}))

vi.mock('./ipc/tauri', () => ({
  invokeIpcWrapped: (...args: unknown[]) => invokeMock(...args)
}))
vi.mock('./tauri-runtime', () => ({ isTauriContext: () => runtimeMock.isTauri }))
vi.mock('./platform', () => ({
  get isMac() {
    return platformMock.isMac
  }
}))
vi.mock('./log-api', () => ({ logFrontendError: (payload: unknown) => logMock(payload) }))

import { setTrafficLightsHidden } from './tauri-traffic-lights'

describe('setTrafficLightsHidden', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeMock.isTauri = true
    platformMock.isMac = true
    invokeMock.mockResolvedValue({ success: true, data: undefined })
  })

  it('invokes the set_traffic_lights_hidden command on Tauri macOS', async () => {
    await setTrafficLightsHidden(true)
    expect(invokeMock).toHaveBeenCalledWith('set_traffic_lights_hidden', { hidden: true })
    await setTrafficLightsHidden(false)
    expect(invokeMock).toHaveBeenLastCalledWith('set_traffic_lights_hidden', { hidden: false })
    expect(logMock).not.toHaveBeenCalled()
  })

  it('logs a warning when the command fails', async () => {
    invokeMock.mockResolvedValue({ success: false, error: 'boom', code: 'UNKNOWN_ERROR' })
    await setTrafficLightsHidden(true)
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', message: 'Traffic lights hide failed: boom' })
    )
  })

  it('does nothing outside Tauri or off macOS', async () => {
    runtimeMock.isTauri = false
    await setTrafficLightsHidden(true)

    runtimeMock.isTauri = true
    platformMock.isMac = false
    await setTrafficLightsHidden(true)

    expect(invokeMock).not.toHaveBeenCalled()
  })
})
