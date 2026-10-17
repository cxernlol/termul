import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIRM_DIALOG_OVERLAY_PREFIX } from '@/components/ConfirmDialog'
import { logFrontendError } from '@/lib/log-api'
import {
  NEW_PROJECT_MODAL_OVERLAY_PREFIX,
  SETTINGS_MODAL_OVERLAY_ID,
  useOverlayStackStore
} from '@/stores/overlay-stack-store'
import {
  CONFIRM_APPEAR_TIMEOUT_MS,
  CONFIRM_EXIT_TIMEOUT_MS,
  returnFocusAfterConfirm,
  returnFocusAfterModal
} from './confirm-focus-return'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const CONFIRM_ID = `${CONFIRM_DIALOG_OVERLAY_PREFIX}:r1:`

function openConfirm(id = CONFIRM_ID): HTMLElement {
  useOverlayStackStore.getState().registerOverlay(id, () => {})
  const root = document.createElement('div')
  root.setAttribute('data-sibling-dialog', '')
  document.body.appendChild(root)
  return root
}

/** The confirm unregisters on close; its root outlives that for the exit animation. */
function closeConfirm(root: HTMLElement, id = CONFIRM_ID): void {
  useOverlayStackStore.getState().unregisterOverlay(id)
  root.dataset.closing = ''
}

function mountButton(): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  document.body.appendChild(button)
  return button
}

describe('returnFocusAfterConfirm', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(logFrontendError).mockClear()
    useOverlayStackStore.setState({ stack: [] })
    ;(document.activeElement as HTMLElement | null)?.blur()
  })

  afterEach(() => {
    vi.useRealTimers()
    useOverlayStackStore.setState({ stack: [] })
    document.body.innerHTML = ''
  })

  it('restores focus once the confirm left the store and the DOM and focus fell to body', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterConfirm(restore)

    const root = openConfirm()
    closeConfirm(root)
    // The exit animation: the root is still mounted for a few frames.
    vi.advanceTimersByTime(50)
    expect(restore).not.toHaveBeenCalled()

    root.remove()
    vi.advanceTimersByTime(20)

    expect(restore).toHaveBeenCalledTimes(1)
    expect(logFrontendError).not.toHaveBeenCalled()
  })

  it('does nothing while the confirm is still open', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterConfirm(restore)

    openConfirm()
    vi.advanceTimersByTime(CONFIRM_APPEAR_TIMEOUT_MS * 2)

    expect(restore).not.toHaveBeenCalled()
  })

  it('does not override focus that already sits on a real element', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterConfirm(restore)
    const elsewhere = mountButton()

    const root = openConfirm()
    elsewhere.focus()
    closeConfirm(root)
    root.remove()
    vi.advanceTimersByTime(20)

    expect(restore).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('works for a real restore target: Cancel unmounts, focus lands on the opener', () => {
    const opener = mountButton()
    returnFocusAfterConfirm(() => {
      opener.focus()
      return document.activeElement === opener
    })

    const root = openConfirm()
    const cancel = document.createElement('button')
    root.appendChild(cancel)
    cancel.focus()
    expect(document.activeElement).toBe(cancel)

    closeConfirm(root)
    root.remove()
    expect(document.activeElement).toBe(document.body)
    vi.advanceTimersByTime(20)

    expect(document.activeElement).toBe(opener)
  })

  it('logs info when restore finds no connected target', () => {
    returnFocusAfterConfirm(() => false)

    const root = openConfirm()
    closeConfirm(root)
    root.remove()
    vi.advanceTimersByTime(20)

    expect(logFrontendError).toHaveBeenCalledTimes(1)
    expect(logFrontendError).toHaveBeenCalledWith(expect.objectContaining({ level: 'info' }))
  })

  it('treats a confirm that was already open when it was called as seen', () => {
    const root = openConfirm()
    const restore = vi.fn(() => true)
    returnFocusAfterConfirm(restore)

    closeConfirm(root)
    root.remove()
    vi.advanceTimersByTime(20)

    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('ignores other overlays on the stack', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterConfirm(restore)

    useOverlayStackStore.getState().registerOverlay('projects-sheet', () => {})
    useOverlayStackStore.getState().unregisterOverlay('projects-sheet')
    vi.advanceTimersByTime(CONFIRM_APPEAR_TIMEOUT_MS * 2)

    expect(restore).not.toHaveBeenCalled()
  })

  it('unsubscribes without restoring when no confirm opens within the window', () => {
    const restore = vi.fn(() => true)
    const realSubscribe = useOverlayStackStore.subscribe
    const unsubscribe = vi.fn()
    const subscribeSpy = vi
      .spyOn(useOverlayStackStore, 'subscribe')
      .mockImplementation((listener) => {
        const stop = realSubscribe(listener)
        unsubscribe.mockImplementation(stop)
        return unsubscribe
      })
    returnFocusAfterConfirm(restore)
    expect(unsubscribe).not.toHaveBeenCalled()

    vi.advanceTimersByTime(CONFIRM_APPEAR_TIMEOUT_MS + 10)
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    // A confirm that opens (and closes) after the window is not tracked.
    const root = openConfirm()
    closeConfirm(root)
    root.remove()
    vi.advanceTimersByTime(20)
    expect(restore).not.toHaveBeenCalled()
    subscribeSpy.mockRestore()
  })

  it('unsubscribes once it has restored', () => {
    const realSubscribe = useOverlayStackStore.subscribe
    const unsubscribe = vi.fn()
    const subscribeSpy = vi
      .spyOn(useOverlayStackStore, 'subscribe')
      .mockImplementation((listener) => {
        const stop = realSubscribe(listener)
        unsubscribe.mockImplementation(stop)
        return unsubscribe
      })
    returnFocusAfterConfirm(() => true)

    const root = openConfirm()
    closeConfirm(root)
    root.remove()
    vi.advanceTimersByTime(20)

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    subscribeSpy.mockRestore()
  })

  it('gives up, logging info, when the closed confirm never leaves the DOM', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterConfirm(restore)

    const root = openConfirm()
    closeConfirm(root)
    vi.advanceTimersByTime(CONFIRM_EXIT_TIMEOUT_MS + 100)

    expect(restore).not.toHaveBeenCalled()
    expect(logFrontendError).toHaveBeenCalledWith(expect.objectContaining({ level: 'info' }))

    // Finished: removing the root later restores nothing.
    root.remove()
    vi.advanceTimersByTime(100)
    expect(restore).not.toHaveBeenCalled()
  })

  it('restores at most once even if the stack keeps changing', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterConfirm(restore)

    const root = openConfirm()
    closeConfirm(root)
    root.remove()
    vi.advanceTimersByTime(20)

    const second = openConfirm(`${CONFIRM_DIALOG_OVERLAY_PREFIX}:r2:`)
    closeConfirm(second, `${CONFIRM_DIALOG_OVERLAY_PREFIX}:r2:`)
    second.remove()
    vi.advanceTimersByTime(20)

    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('the returned cancel function stops it for good', () => {
    const restore = vi.fn(() => true)
    const cancel = returnFocusAfterConfirm(restore)
    cancel()

    const root = openConfirm()
    closeConfirm(root)
    root.remove()
    vi.advanceTimersByTime(CONFIRM_APPEAR_TIMEOUT_MS)

    expect(restore).not.toHaveBeenCalled()
  })
})

describe('returnFocusAfterModal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(logFrontendError).mockClear()
    useOverlayStackStore.setState({ stack: [] })
    ;(document.activeElement as HTMLElement | null)?.blur()
  })

  afterEach(() => {
    vi.useRealTimers()
    useOverlayStackStore.setState({ stack: [] })
    document.body.innerHTML = ''
  })

  function openModal(id: string): HTMLElement {
    useOverlayStackStore.getState().registerOverlay(id, () => {})
    const card = document.createElement('div')
    card.tabIndex = -1
    document.body.appendChild(card)
    card.focus()
    return card
  }

  /** The modal unregisters at once; its focused card leaves the DOM after the exit animation. */
  function closeModal(id: string, card: HTMLElement): void {
    useOverlayStackStore.getState().unregisterOverlay(id)
    vi.advanceTimersByTime(150)
    card.remove()
  }

  it.each([
    ['the settings modal', SETTINGS_MODAL_OVERLAY_ID],
    ['the New project modal', `${NEW_PROJECT_MODAL_OVERLAY_PREFIX}:r1:`]
  ])('restores focus once %s closed and its card left the DOM', (_name, id) => {
    const opener = mountButton()
    returnFocusAfterModal(() => {
      opener.focus()
      return document.activeElement === opener
    })

    const card = openModal(id)
    closeModal(id, card)
    expect(document.activeElement).toBe(document.body)
    vi.advanceTimersByTime(20)

    expect(document.activeElement).toBe(opener)
  })

  it('waits while the focused card is still animating out', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterModal(restore)

    const card = openModal(SETTINGS_MODAL_OVERLAY_ID)
    useOverlayStackStore.getState().unregisterOverlay(SETTINGS_MODAL_OVERLAY_ID)
    vi.advanceTimersByTime(100)
    expect(restore).not.toHaveBeenCalled()

    card.remove()
    vi.advanceTimersByTime(20)
    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('leaves focus where the user moved it before the modal closed', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterModal(restore)
    const elsewhere = mountButton()

    const card = openModal(SETTINGS_MODAL_OVERLAY_ID)
    elsewhere.focus()
    closeModal(SETTINGS_MODAL_OVERLAY_ID, card)
    vi.advanceTimersByTime(CONFIRM_EXIT_TIMEOUT_MS + 100)

    expect(restore).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('ignores a confirm dialog on the stack', () => {
    const restore = vi.fn(() => true)
    returnFocusAfterModal(restore)

    const card = openModal(CONFIRM_ID)
    closeModal(CONFIRM_ID, card)
    vi.advanceTimersByTime(CONFIRM_APPEAR_TIMEOUT_MS * 2)

    expect(restore).not.toHaveBeenCalled()
  })
})
