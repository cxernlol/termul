import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { ChatEmptyState } from './ChatEmptyState'
import { CHAT_START_PHONE_HERO_CLASS, ChatStartHero } from './chat-start'

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

  it('keeps the full-size hero on the phone, centred by its host (Paper 2.6g)', () => {
    const { container } = render(<ChatStartHero projectLabel="termul-new" isMobileShell />)
    expect(screen.getByRole('img', { name: 'Troupe' })).toHaveAttribute('width', '56')
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-hero', 'leading-7')
    expect(container.firstElementChild).not.toHaveClass('mb-6')
  })

  it('centres the phone hero in the space above the composer', () => {
    expect(CHAT_START_PHONE_HERO_CLASS).toContain('justify-center')
    expect(CHAT_START_PHONE_HERO_CLASS).toContain('flex-1')
    expect(CHAT_START_PHONE_HERO_CLASS).toContain('pb-7')
  })
})

describe('quick chat empty state copy', () => {
  it('asks a neutral question and does not name a project', () => {
    render(<ChatStartHero projectLabel="this folder" quick />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What should we do?')
    expect(screen.queryByText(/folder|project|workspace/i)).toBeNull()
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

  it('asks a neutral question for a quick chat', () => {
    useAcpStore.setState((s) => ({
      sessions: { ...s.sessions, 's-quick': { id: 's-quick', kind: 'quick' } as never }
    }))
    render(<ChatEmptyState sessionId="s-quick" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('What should we do?')
  })

  it('falls back to "this folder" without a project', () => {
    render(<ChatEmptyState sessionId="unknown" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'What should we do in this folder?'
    )
  })
})
