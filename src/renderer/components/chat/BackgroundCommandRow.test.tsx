import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BackgroundCommand } from '@/lib/acp-api'
import { BackgroundCommandRow } from './BackgroundCommandRow'

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return { ...actual, useReducedMotion: () => true }
})

const command: BackgroundCommand = {
  toolCallId: 'toolu_bg',
  title: 'Watch checks',
  command: 'gh pr checks --watch',
  startedAtMs: Date.now() - 5_000,
  state: 'running'
}

describe('BackgroundCommandRow', () => {
  it('marks a running command with a neutral spinner, not amber', () => {
    render(<BackgroundCommandRow sessionId="s1" command={command} />)
    const row = screen.getByRole('button', { name: /Watch checks/ })
    expect(row).toHaveTextContent('Running')
    expect(row.querySelectorAll('.tm-comet')).toHaveLength(2)
    expect(row.querySelector('.text-warning')).toBeNull()
    expect(row.querySelector('.bg-warning')).toBeNull()
  })

  it('shows an ended command without a spinner', () => {
    render(
      <BackgroundCommandRow
        sessionId="s1"
        command={{ ...command, state: 'ended', endedAtMs: Date.now() }}
      />
    )
    const row = screen.getByRole('button', { name: /Watch checks/ })
    expect(row).toHaveTextContent('Ended')
    expect(row.querySelector('.tm-comet')).toBeNull()
  })
})
