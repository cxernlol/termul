import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RailFooter } from './RailFooter'
import { type RailDensity, RailDensityProvider } from './rail/rail-density'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

function footer(density: RailDensity): React.JSX.Element {
  return (
    <TooltipProvider>
      <RailDensityProvider density={density}>
        <RailFooter
          isShortcutsOpen={false}
          onShortcutsOpenChange={() => undefined}
          isThemePickerOpen={false}
          onToggleThemePicker={() => undefined}
        />
      </RailDensityProvider>
    </TooltipProvider>
  )
}

describe('RailFooter', () => {
  it('keeps focus on the same button when the density changes', () => {
    const { rerender } = render(footer('expanded'))
    act(() => screen.getByRole('button', { name: 'Settings' }).focus())

    rerender(footer('collapsed'))
    expect(document.activeElement).toHaveAttribute('aria-label', 'Settings')

    rerender(footer('expanded'))
    expect(document.activeElement).toHaveAttribute('aria-label', 'Settings')
  })

  it('does not take focus back after focus left the footer', async () => {
    const { rerender } = render(
      <>
        {footer('expanded')}
        <button type="button">Elsewhere</button>
      </>
    )
    act(() => screen.getByRole('button', { name: 'Settings' }).focus())
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus())
    // The blur clears the remembered button on the next frame.
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).blur())

    rerender(
      <>
        {footer('collapsed')}
        <button type="button">Elsewhere</button>
      </>
    )
    expect(document.activeElement).not.toHaveAttribute('aria-label', 'Settings')
  })
})
