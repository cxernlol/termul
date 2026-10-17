import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TitleBarShortcutsPopover } from './TitleBarShortcutsPopover'

// Issue #843: the quick-shortcuts popover must not list the desktop-only
// "New Browser Tab" entry on web (it would show an unbindable shortcut for a
// no-op action).
const { tauriRef } = vi.hoisted(() => ({ tauriRef: { current: true } }))

vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: () => tauriRef.current
}))

vi.mock('@/hooks/use-keyboard-shortcuts', () => ({
  useUpdateShortcut: () => vi.fn(),
  useResetShortcut: () => vi.fn()
}))

// ShortcutRecorder is stubbed below, so the store mock only needs the
// selector. `shortcuts` is keyed by id (the popover indexes shortcuts[id]).
vi.mock('@/stores/keyboard-shortcuts-store', () => ({
  useKeyboardShortcutsStore: (selector: (s: { shortcuts: Record<string, unknown> }) => unknown) =>
    selector({
      shortcuts: {
        commandPalette: {
          id: 'commandPalette',
          label: 'Command Palette',
          description: '',
          defaultKey: 'ctrl+k'
        },
        newBrowserTab: {
          id: 'newBrowserTab',
          label: 'New Browser Tab',
          description: '',
          defaultKey: 'ctrl+shift+n'
        }
      }
    })
}))

vi.mock('@/components/ShortcutRecorder', () => ({
  ShortcutRecorder: ({ shortcut }: { shortcut: { label: string } }) => (
    <div data-testid="shortcut-row">{shortcut.label}</div>
  )
}))

vi.mock('framer-motion', async () => {
  const React = await import('react')
  return {
    // Models the exit: `onExitComplete` fires once the open content goes away.
    AnimatePresence: ({
      children,
      onExitComplete
    }: {
      children: React.ReactNode
      onExitComplete?: () => void
    }) => {
      const hadChildren = React.useRef(false)
      const hasChildren = Boolean(children)
      React.useEffect(() => {
        if (hadChildren.current && !hasChildren) onExitComplete?.()
        hadChildren.current = hasChildren
      })
      return children
    },
    motion: {
      div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
        ({ children, ...props }, ref) => (
          <div ref={ref} {...props}>
            {children}
          </div>
        )
      )
    }
  }
})

describe('TitleBarShortcutsPopover web filter (#843)', () => {
  beforeEach(() => {
    tauriRef.current = true
  })

  function openPopover() {
    render(<TitleBarShortcutsPopover buttonClassName="" />)
    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts menu/i }))
  }

  it('lists New Browser Tab on desktop', () => {
    openPopover()

    expect(screen.getAllByTestId('shortcut-row').length).toBe(2)
    expect(screen.getByText('New Browser Tab')).toBeInTheDocument()
  })

  it('omits New Browser Tab on web', () => {
    tauriRef.current = false
    openPopover()

    expect(screen.getAllByTestId('shortcut-row').length).toBe(1)
    expect(screen.queryByText('New Browser Tab')).not.toBeInTheDocument()
    expect(screen.getByText('Command Palette')).toBeInTheDocument()
  })
})

describe('TitleBarShortcutsPopover focus return', () => {
  beforeEach(() => {
    tauriRef.current = true
  })

  function Harness({ restoreFocusOnClose }: { restoreFocusOnClose?: boolean }) {
    const [open, setOpen] = React.useState(false)
    return (
      <>
        <button type="button">elsewhere</button>
        <TitleBarShortcutsPopover
          buttonClassName=""
          open={open}
          onOpenChange={setOpen}
          restoreFocusOnClose={restoreFocusOnClose}
        />
      </>
    )
  }

  function openAndClose(): HTMLElement {
    const trigger = screen.getByRole('button', { name: /keyboard shortcuts menu/i })
    fireEvent.click(trigger)
    fireEvent.keyDown(window, { key: 'Escape' })
    return trigger
  }

  it('returns focus to its button on close when focus fell to the body', () => {
    render(<Harness restoreFocusOnClose />)
    const trigger = openAndClose()
    expect(trigger).toHaveFocus()
  })

  it('leaves focus alone when it moved elsewhere', () => {
    render(<Harness restoreFocusOnClose />)
    const trigger = screen.getByRole('button', { name: /keyboard shortcuts menu/i })
    fireEvent.click(trigger)
    const elsewhere = screen.getByRole('button', { name: 'elsewhere' })
    elsewhere.focus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(elsewhere).toHaveFocus()
  })

  it('keeps the classic behavior (no focus return) by default', () => {
    render(<Harness />)
    const trigger = openAndClose()
    expect(trigger).not.toHaveFocus()
  })
})
