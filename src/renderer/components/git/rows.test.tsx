import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChangesFilter, FileItem, GitStatusLetter, SectionHeader } from './rows'

describe('git rows', () => {
  const file = { path: 'src/a.ts', status: 'modified' as const }

  it('open-diff row is the solid row fill, not a primary wash', () => {
    render(<FileItem file={file} isActive isSelected={false} onClick={vi.fn()} />)
    const row = screen.getByRole('option')
    expect(row.className).toContain('bg-row-hover-solid')
    expect(row.className).toContain('h-7')
    expect(row.className).toContain('text-foreground')
    expect(row.className).not.toMatch(/bg-primary|bg-secondary|bg-accent/)
  })

  it('multi-selected row uses the neutral 6% wash; idle rows hover at 3%', () => {
    const { rerender } = render(
      <FileItem file={file} isActive={false} isSelected onClick={vi.fn()} />
    )
    expect(screen.getByRole('option').className).toContain('bg-foreground/[0.06]')
    rerender(<FileItem file={file} isActive={false} isSelected={false} onClick={vi.fn()} />)
    const idle = screen.getByRole('option').className
    expect(idle).toContain('hover:bg-foreground/[0.03]')
    expect(idle).toContain('text-secondary-foreground')
    expect(idle).not.toContain('bg-row-hover-solid')
  })

  it('shows a plain outline file glyph, the name and the muted parent path', () => {
    const { container } = render(
      <FileItem file={file} isActive={false} isSelected={false} onClick={vi.fn()} />
    )
    // No file-type image icon: the Paper row draws one outline glyph.
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toHaveClass('text-project-blue')
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('src').className).toContain('text-muted-foreground')
  })

  it('status letters use diff tokens', () => {
    const { rerender } = render(<GitStatusLetter status="modified" />)
    expect(screen.getByRole('img', { name: /modified/i }).className).toContain('text-diff-modified')
    rerender(<GitStatusLetter status="deleted" />)
    expect(screen.getByRole('img').className).toContain('text-destructive')
    rerender(<GitStatusLetter status="untracked" />)
    expect(screen.getByRole('img').textContent).toBe('U')
    expect(screen.getByRole('img').className).toContain('text-diff-added')
  })

  it('section header uses the panel label and a tabular count', () => {
    render(<SectionHeader label="Changes" count={3} selectionCount={0} />)
    expect(screen.getByText('Changes').className).toContain('label-panel')
    expect(screen.getByText('3').className).toContain('tabular-nums')
  })

  it('filter is the shared field with a neutral focus border', () => {
    render(<ChangesFilter value="" onChange={vi.fn()} />)
    const input = screen.getByPlaceholderText('Filter changes')
    expect(input.className).toContain('h-7')
    expect(input.className).toContain('bg-card')
    expect(input.className).toContain('focus-visible:border-focus-ring')
    expect(input.className).toContain('focus-visible:ring-focus-ring')
    expect(input.className).toContain('focus-visible:outline-hidden')
    expect(input.className).not.toContain('ring-primary')
  })
})
