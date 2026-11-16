import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TERMUL_TOOLS } from '@/lib/composer/termul-tools'
import { ComposerAddMenu } from './ComposerAddMenu'
import type { ComposerAddHandle } from './ComposerAddSheet'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(async () => undefined) }))

function makeHandle(): ComposerAddHandle {
  return {
    canPick: true,
    canPickImages: true,
    pickFiles: vi.fn(async () => undefined),
    insertTrigger: vi.fn(() => true),
    blurEditor: vi.fn(),
    focusEditor: vi.fn(),
    insertTool: vi.fn(() => true)
  }
}

function renderMenu() {
  const handle = makeHandle()
  render(
    <TooltipProvider>
      <ComposerAddMenu
        handle={handle}
        disabled={false}
        termulTools={TERMUL_TOOLS.map((tool) => ({
          tool,
          state: tool.state({ canvasReady: false })
        }))}
      />
    </TooltipProvider>
  )
  return { handle }
}

async function openMenu(): Promise<void> {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Add to chat' }), {
    button: 0,
    ctrlKey: false
  })
  await screen.findByRole('menu')
}

describe('ComposerAddMenu', () => {
  afterEach(() => cleanup())

  it('offers attach, mention, slash commands and Troupe tools; connectors live in the foot row', async () => {
    renderMenu()
    await openMenu()
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items).toEqual(['Add files or photos', '@Mention@', '/Slash commands/', 'Troupe tools'])
  })

  it('lists the Troupe tools, marks a closed canvas, and inserts the picked tool after closing', async () => {
    const { handle } = renderMenu()
    await openMenu()
    const trigger = screen.getByRole('menuitem', { name: 'Troupe tools' })
    act(() => trigger.focus())
    fireEvent.keyDown(trigger, { key: 'ArrowRight' })
    await screen.findByText('Ask the agent to use')
    const rows = screen
      .getAllByRole('menuitem')
      .filter(
        (item) =>
          item.closest('[data-radix-menu-content]') !== trigger.closest('[data-radix-menu-content]')
      )
      .map((item) => item.textContent)
    expect(rows).toEqual([
      'BrowserOpen, click and read pages',
      'CanvasDesign on the project canvasClosed',
      'AutomationsSchedule background work'
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: /^Browser/ }))
    await waitFor(() => expect(handle.insertTool).toHaveBeenCalledWith('browser'))
  })

  it('inserts the @ trigger once the menu has closed', async () => {
    const { handle } = renderMenu()
    let menuOpenAtInsert: boolean | null = null
    vi.mocked(handle.insertTrigger).mockImplementation(() => {
      menuOpenAtInsert = screen.queryByRole('menu') !== null
      return true
    })
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Mention/ }))
    await waitFor(() => expect(handle.insertTrigger).toHaveBeenCalledWith('@'))
    expect(menuOpenAtInsert).toBe(false)
    expect(handle.focusEditor).not.toHaveBeenCalled()
  })

  it('returns focus to the editor on Escape', async () => {
    const { handle } = renderMenu()
    await openMenu()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(handle.focusEditor).toHaveBeenCalledOnce())
  })
})
