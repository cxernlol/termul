import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onWindowFocus } from './window-focus-api'

const { mockIsTauriContext, mockGetCurrentWindow, mockLogFrontendError } = vi.hoisted(() => ({
  mockIsTauriContext: vi.fn(),
  mockGetCurrentWindow: vi.fn(),
  mockLogFrontendError: vi.fn()
}))

vi.mock('@/lib/tauri-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri-runtime')>()),
  isTauriContext: mockIsTauriContext
}))
vi.mock('@/lib/tauri-window', () => ({ getCurrentWindow: mockGetCurrentWindow }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: mockLogFrontendError }))

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  vi.clearAllMocks()
  setVisibility('visible')
})

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).visibilityState
})

describe('onWindowFocus (web)', () => {
  beforeEach(() => {
    mockIsTauriContext.mockReturnValue(false)
  })

  it('fires when the document becomes visible, not when it becomes hidden', () => {
    const callback = vi.fn()
    const stop = onWindowFocus(callback)

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(callback).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(callback).toHaveBeenCalledTimes(1)

    stop()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(mockGetCurrentWindow).not.toHaveBeenCalled()
  })
})

describe('onWindowFocus (desktop)', () => {
  beforeEach(() => {
    mockIsTauriContext.mockReturnValue(true)
  })

  it('fires on focused=true only and disposes the Tauri listener', async () => {
    const dispose = vi.fn()
    let handler: (event: { payload: boolean }) => void = () => {}
    mockGetCurrentWindow.mockReturnValue({
      onFocusChanged: vi.fn((cb: (event: { payload: boolean }) => void) => {
        handler = cb
        return Promise.resolve(dispose)
      })
    })
    const callback = vi.fn()

    const stop = onWindowFocus(callback)
    handler({ payload: false })
    expect(callback).not.toHaveBeenCalled()
    handler({ payload: true })
    expect(callback).toHaveBeenCalledTimes(1)

    stop()
    await Promise.resolve()
    await Promise.resolve()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('logs and survives a listener registration failure', async () => {
    mockGetCurrentWindow.mockReturnValue({
      onFocusChanged: vi.fn(() => Promise.reject(new Error('no window')))
    })

    const stop = onWindowFocus(vi.fn())
    await Promise.resolve()
    await Promise.resolve()

    expect(mockLogFrontendError).toHaveBeenCalledTimes(1)
    expect(mockLogFrontendError.mock.calls[0][0].message).toContain('[window-focus]')
    expect(() => stop()).not.toThrow()
  })

  it('logs and survives a synchronous failure', () => {
    mockGetCurrentWindow.mockImplementation(() => {
      throw new Error('not in tauri')
    })

    const stop = onWindowFocus(vi.fn())

    expect(mockLogFrontendError).toHaveBeenCalledTimes(1)
    expect(() => stop()).not.toThrow()
  })
})
