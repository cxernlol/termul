/**
 * The rename notice against the app's real Toaster. Each `launch` reloads the
 * modules, so the boot classification runs against storage exactly as a new
 * page load would find it.
 */

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/log-api', () => ({
  logFrontendError: vi.fn(async () => undefined)
}))

async function launch(): Promise<void> {
  cleanup()
  vi.resetModules()
  const { Toaster } = await import('@/components/ui/sonner')
  const { useRenameNotice } = await import('./use-rename-notice')
  // Mirror both renderer roots: the effects host is an *earlier sibling* of
  // <Toaster />, so the hook's mount effect runs before the Toaster subscribes
  // (gh-1799). A harness that nested <Toaster /> under the hook caller would
  // flip that order and hide the regression.
  function RenameNoticeEffect(): null {
    useRenameNotice()
    return null
  }
  function Harness(): React.JSX.Element {
    return (
      <>
        <RenameNoticeEffect />
        <Toaster />
      </>
    )
  }
  render(<Harness />)
  // Flush the hook's deferred publish and sonner's own create setTimeout.
  await act(async () => {
    for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('useRenameNotice', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it.each([
    'termul.deviceId',
    'termul-store:projects',
    'termul:file-explorer-width'
  ])('shows once on a device where an earlier version wrote %s', async (key) => {
    localStorage.setItem(key, 'from-0.4.x')

    await launch()

    expect(screen.getByText('Termul is now Troupe')).toBeTruthy()
    expect(
      screen.getByText(
        "It's the same app with a new name. Your projects, chats, settings and sign-ins are unchanged."
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close toast' })).toBeNull()
  })

  it('never shows on a fresh install, even after the app writes its own keys', async () => {
    await launch()

    expect(screen.queryByText('Termul is now Troupe')).toBeNull()
    expect(localStorage.getItem('termul.renameNotice')).toBe('fresh')

    localStorage.setItem('termul.deviceId', 'device-minted-this-session')
    await launch()

    expect(screen.queryByText('Termul is now Troupe')).toBeNull()
  })

  it('never shows when the only stored keys belong to another app on the origin', async () => {
    localStorage.setItem('other-app.session', 'x')

    await launch()

    expect(screen.queryByText('Termul is now Troupe')).toBeNull()
    expect(localStorage.getItem('termul.renameNotice')).toBe('fresh')
  })

  it('stays hidden when storage cannot be read', async () => {
    localStorage.setItem('termul.deviceId', 'device-from-0.4.60')
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    try {
      await launch()
    } finally {
      getItem.mockRestore()
    }

    expect(screen.queryByText('Termul is now Troupe')).toBeNull()
  })

  it('does not show again after Got it', async () => {
    localStorage.setItem('termul.deviceId', 'device-from-0.4.60')
    await launch()

    await act(async () => {
      screen.getByRole('button', { name: 'Got it' }).click()
    })

    expect(localStorage.getItem('termul.renameNotice')).toBe('dismissed')

    await launch()

    expect(screen.queryByText('Termul is now Troupe')).toBeNull()
  })

  it('shows again on the next launch when the app closed before a dismiss', async () => {
    localStorage.setItem('termul.deviceId', 'device-from-0.4.60')
    await launch()
    await launch()

    expect(screen.getByText('Termul is now Troupe')).toBeTruthy()
  })

  /**
   * gh-1850: sonner measures a toast once and reuses that height for the
   * hover-expanded stack. The desktop window starts hidden, so the notice can
   * mount while the viewport is still a few pixels wide and the narrow layout
   * wraps into a very tall toast. jsdom has no layout, so the toast's height
   * is modelled from the viewport width: narrow wraps tall, wide fits short.
   */
  describe('when the viewport size changes after the notice is shown', () => {
    const NARROW_HEIGHT = 1491
    const WIDE_HEIGHT = 110
    const originalWidth = window.innerWidth
    let rectSpy: ReturnType<typeof vi.spyOn>

    function setViewportWidth(width: number): void {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    }

    function noticeHeight(): string {
      const node = screen.getByText('Termul is now Troupe').closest('[data-sonner-toast]')
      if (!(node instanceof HTMLElement)) throw new Error('rename notice toast not found')
      return node.style.getPropertyValue('--initial-height')
    }

    async function resizeTo(width: number, event: 'resize' | 'visibilitychange' = 'resize') {
      setViewportWidth(width)
      await act(async () => {
        const target = event === 'resize' ? window : document
        target.dispatchEvent(new Event(event))
        await new Promise((resolve) => setTimeout(resolve, 200))
        for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    beforeEach(() => {
      rectSpy = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          const height = this.hasAttribute('data-sonner-toast')
            ? window.innerWidth < 600
              ? NARROW_HEIGHT
              : WIDE_HEIGHT
            : 0
          return DOMRect.fromRect({ x: 0, y: 0, width: window.innerWidth, height })
        })
    })

    afterEach(() => {
      rectSpy.mockRestore()
      setViewportWidth(originalWidth)
    })

    it('re-measures the toast once the hidden window gets its real size', async () => {
      localStorage.setItem('termul.deviceId', 'device-from-0.4.60')
      setViewportWidth(120)
      await launch()
      expect(noticeHeight()).toBe(`${NARROW_HEIGHT}px`)

      await resizeTo(1280)

      expect(noticeHeight()).toBe(`${WIDE_HEIGHT}px`)
      expect(screen.getAllByText('Termul is now Troupe')).toHaveLength(1)
    })

    it('re-measures the toast when the window becomes visible', async () => {
      localStorage.setItem('termul.deviceId', 'device-from-0.4.60')
      setViewportWidth(120)
      await launch()

      await resizeTo(1280, 'visibilitychange')

      expect(noticeHeight()).toBe(`${WIDE_HEIGHT}px`)
    })

    it('does not bring the notice back on a resize after Got it', async () => {
      localStorage.setItem('termul.deviceId', 'device-from-0.4.60')
      setViewportWidth(120)
      await launch()

      await act(async () => {
        screen.getByRole('button', { name: 'Got it' }).click()
        // sonner removes a dismissed toast after its 200ms exit animation.
        await new Promise((resolve) => setTimeout(resolve, 300))
      })
      await resizeTo(1280)

      expect(screen.queryByText('Termul is now Troupe')).toBeNull()
      expect(localStorage.getItem('termul.renameNotice')).toBe('dismissed')
    })
  })
})
