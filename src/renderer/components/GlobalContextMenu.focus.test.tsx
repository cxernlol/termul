import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalContextMenu } from '@/components/GlobalContextMenu'

const clipboard = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn()
}))

vi.mock('@/lib/api', () => ({ clipboardApi: clipboard }))
vi.mock('@/lib/tauri-runtime', () => ({ isTauriContext: () => false }))

type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * jsdom has no `document.execCommand`. This stand-in edits the element that has
 * focus when the command runs, as a browser does, so a menu action that fires
 * while focus sits elsewhere changes nothing.
 */
function installFocusedExecCommand(): void {
  document.execCommand = (command: string, _showUi?: boolean, value?: string): boolean => {
    const el = document.activeElement
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    if (command === 'delete') {
      el.setRangeText('', start, end, 'end')
      return true
    }
    if (command === 'insertText') {
      el.setRangeText(value ?? '', start, end, 'end')
      return true
    }
    return false
  }
}

function openMenuOnSelection(selection: [number, number]): Field {
  const field = screen.getByTestId('field') as Field
  field.focus()
  field.setSelectionRange(selection[0], selection[1])
  fireEvent.contextMenu(field)
  return field
}

function choose(label: string): void {
  fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${label}\\b`) }))
}

describe.each([
  ['input', <input key="i" data-testid="field" defaultValue="hello world" />],
  ['textarea', <textarea key="t" data-testid="field" defaultValue="hello world" />]
])('GlobalContextMenu acting on the right-clicked %s', (_kind, field) => {
  beforeEach(() => {
    vi.clearAllMocks()
    installFocusedExecCommand()
    clipboard.writeText.mockResolvedValue({ success: true })
    clipboard.readText.mockResolvedValue({ success: true, data: 'PASTED' })
    render(<GlobalContextMenu>{field}</GlobalContextMenu>)
  })

  it('Copy copies the selection and leaves the field unchanged', async () => {
    const el = openMenuOnSelection([0, 5])

    choose('Copy')

    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('hello'))
    expect(el.value).toBe('hello world')
  })

  it('Cut copies the selection and removes it from the field', async () => {
    const el = openMenuOnSelection([0, 5])

    choose('Cut')

    await waitFor(() => expect(el.value).toBe(' world'))
    expect(clipboard.writeText).toHaveBeenCalledWith('hello')
  })

  it('Paste inserts the clipboard text over the selection in the field', async () => {
    const el = openMenuOnSelection([0, 5])

    choose('Paste')

    await waitFor(() => expect(el.value).toBe('PASTED world'))
  })

  it('Select All selects the whole field', async () => {
    const el = openMenuOnSelection([2, 2])

    choose('Select All')

    await waitFor(() => {
      expect([el.selectionStart, el.selectionEnd]).toEqual([0, 'hello world'.length])
    })
  })

  it('starts the clipboard write inside the select event, on the restored field', () => {
    const el = openMenuOnSelection([0, 5])
    const writeContext: Array<[boolean, string]> = []
    clipboard.writeText.mockImplementation(() => {
      writeContext.push([
        document.activeElement === el,
        el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0)
      ])
      return Promise.resolve({ success: true })
    })

    choose('Copy')

    expect(writeContext).toEqual([[true, 'hello']])
  })

  it('starts the clipboard read inside the select event, on the restored field', () => {
    const el = openMenuOnSelection([0, 5])
    const readContext: boolean[] = []
    clipboard.readText.mockImplementation(() => {
      readContext.push(document.activeElement === el)
      return Promise.resolve({ success: true, data: 'PASTED' })
    })

    choose('Paste')

    expect(readContext).toEqual([true])
  })

  describe('while the menu is still playing its exit animation', () => {
    beforeEach(() => {
      const style = document.createElement('style')
      style.textContent = '[data-state="closed"] { animation-name: leave; animation-duration: 1s; }'
      document.head.appendChild(style)
      return () => style.remove()
    })

    it('applies the chosen action instead of dropping it when the menu is reopened', async () => {
      const el = openMenuOnSelection([0, 5])

      choose('Cut')
      await waitFor(() => expect(el.value).toBe(' world'))
      expect(document.querySelector('[role="menu"]')).not.toBeNull()

      fireEvent.contextMenu(el)

      expect(clipboard.writeText).toHaveBeenCalledTimes(1)
      expect(clipboard.writeText).toHaveBeenCalledWith('hello')
      expect(el.value).toBe(' world')
    })

    it.each([
      ['Copy', 'hello world', [0, 5]],
      ['Cut', ' world', [0, 0]]
    ])('keeps the field focused when the pointer moves over the closing menu after %s', async (label, value, selection) => {
      const el = openMenuOnSelection([0, 5])

      choose(label)
      await waitFor(() => expect(el.value).toBe(value))
      const paste = screen.getByRole('menuitem', { name: /^Paste\b/ })
      fireEvent.pointerMove(paste, { pointerType: 'mouse' })
      fireEvent(
        screen.getByRole('menu'),
        Object.assign(new Event('animationend', { bubbles: true }), { animationName: 'leave' })
      )

      await waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
      await waitFor(() => expect(document.activeElement).toBe(el))
      expect([el.selectionStart, el.selectionEnd]).toEqual(selection)
    })
  })
})
