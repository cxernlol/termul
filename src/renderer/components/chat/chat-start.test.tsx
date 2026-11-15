import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { ChatEmptyState } from './ChatEmptyState'
import { ChatStartHero } from './chat-start'

describe('ChatStartHero (shared by the launcher and the empty chat)', () => {
  it('shows the Troupe mark and the project question', () => {
    render(<ChatStartHero projectLabel="termul-new" headingLevel={2} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'What should we do in termul-new?'
    )
  })

  it('uses the Paper type and spacing: 56px mark, 20px gap, 22/28 heading', () => {
    render(<ChatStartHero projectLabel="termul-new" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveClass(
      'text-hero',
      'leading-7',
      'tracking-[-0.015em]',
      'font-normal',
      'text-foreground'
    )
    const mark = screen.getByRole('img', { name: 'Troupe' })
    expect(mark).toHaveAttribute('width', '56')
    expect(heading.parentElement).toHaveClass('gap-5', 'mb-6')
  })

  it('keeps the smaller mobile hero', () => {
    render(<ChatStartHero projectLabel="termul-new" isMobileShell />)
    expect(screen.getByRole('img', { name: 'Troupe' })).toHaveAttribute('width', '32')
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-xl')
  })
})

describe('ChatEmptyState', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'termul-new' }] as never
    })
    useAcpStore.setState((s) => ({
      sessions: { ...s.sessions, 's-1': { id: 's-1', projectId: 'p1' } as never }
    }))
  })

  it('uses the same hero as the launcher, named for the chat project', () => {
    render(<ChatEmptyState sessionId="s-1" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'What should we do in termul-new?'
    )
    // No agent glyph tile and no starter cards: the starters live under the composer.
    expect(screen.queryByRole('group', { name: 'Starters' })).toBeNull()
  })

  it('falls back to "this folder" without a project', () => {
    render(<ChatEmptyState sessionId="unknown" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'What should we do in this folder?'
    )
  })
})
