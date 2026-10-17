import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RailButton, railButtonClass } from './rail-button'

function renderButton(props: Partial<React.ComponentProps<typeof RailButton>> = {}) {
  const onClick = vi.fn()
  render(
    <TooltipProvider>
      <RailButton label="Open canvas" aria-label="Open canvas" onClick={onClick} {...props}>
        <span>icon</span>
      </RailButton>
    </TooltipProvider>
  )
  return { onClick, button: screen.getByRole('button', { name: 'Open canvas' }) }
}

describe('RailButton', () => {
  it('runs onClick and uses a Radix tooltip instead of a native title', () => {
    const { onClick, button } = renderButton()

    expect(button).not.toBeDisabled()
    expect(button).not.toHaveAttribute('title')

    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not run onClick when disabled and dims the icon', () => {
    const { onClick, button } = renderButton({ disabled: true })

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).not.toHaveAttribute('title')
    expect(button.className).toContain('disabled:opacity-40')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('marks a pressed view with the keycap surface and no accent fill', () => {
    const { button } = renderButton({ pressed: true })

    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button.className).toContain('keycap')
    expect(button.className).toContain('size-9')
    expect(button.className).not.toMatch(/bg-(secondary|accent|primary)/)
  })

  it('leaves aria-pressed unset when no pressed state is given', () => {
    const { button } = renderButton()

    expect(button).not.toHaveAttribute('aria-pressed')
    expect(button.className).not.toContain('keycap')
  })

  it('renders the badge next to the icon', () => {
    renderButton({ badge: <span data-testid="badge" /> })

    expect(screen.getByTestId('badge')).toBeInTheDocument()
  })
})

describe('railButtonClass', () => {
  it('adds the keycap surface only when active', () => {
    expect(railButtonClass(true)).toContain('keycap')
    expect(railButtonClass(false)).not.toContain('keycap')
  })
})
