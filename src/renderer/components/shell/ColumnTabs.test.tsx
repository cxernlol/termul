import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColumnTabs } from './ColumnTabs'

describe('ColumnTabs', () => {
  it('renders Chats, Explorer, Changes in order as a tablist', () => {
    render(<ColumnTabs selected="chats" onSelect={vi.fn()} changedCount={0} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Chats',
      'Explorer',
      'Changes'
    ])
  })

  it('marks the selected tab and roves the tabindex', () => {
    render(<ColumnTabs selected="explorer" onSelect={vi.fn()} changedCount={0} />)
    const [chats, explorer, changes] = screen.getAllByRole('tab')
    expect(explorer).toHaveAttribute('aria-selected', 'true')
    expect(chats).toHaveAttribute('aria-selected', 'false')
    expect(explorer).toHaveAttribute('tabindex', '0')
    expect(chats).toHaveAttribute('tabindex', '-1')
    expect(changes).toHaveAttribute('tabindex', '-1')
  })

  it('selects a tab on click', () => {
    const onSelect = vi.fn()
    render(<ColumnTabs selected="chats" onSelect={onSelect} changedCount={0} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }))
    expect(onSelect).toHaveBeenCalledWith('changes')
  })

  it('moves and selects with Left and Right, wrapping at both ends', () => {
    const onSelect = vi.fn()
    render(<ColumnTabs selected="chats" onSelect={onSelect} changedCount={0} />)
    const [chats, explorer, changes] = screen.getAllByRole('tab')

    chats.focus()
    fireEvent.keyDown(chats, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith('explorer')
    expect(explorer).toHaveFocus()

    fireEvent.keyDown(chats, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenLastCalledWith('changes')
    expect(changes).toHaveFocus()

    fireEvent.keyDown(changes, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenLastCalledWith('chats')
  })

  it('shows the changed-file badge only above zero and caps it at 99+', () => {
    const { rerender } = render(<ColumnTabs selected="chats" onSelect={vi.fn()} changedCount={0} />)
    expect(screen.queryByTestId('column-tab-changes-badge')).toBeNull()

    rerender(<ColumnTabs selected="chats" onSelect={vi.fn()} changedCount={7} />)
    expect(screen.getByTestId('column-tab-changes-badge')).toHaveTextContent('7')
    expect(screen.getByRole('tab', { name: /Changes/ })).toContainElement(
      screen.getByTestId('column-tab-changes-badge')
    )

    rerender(<ColumnTabs selected="chats" onSelect={vi.fn()} changedCount={150} />)
    expect(screen.getByTestId('column-tab-changes-badge')).toHaveTextContent('99+')
  })
})
