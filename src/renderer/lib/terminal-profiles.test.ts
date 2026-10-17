import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

import {
  normalizeTerminalProfiles,
  parseTerminalProfileDraft,
  terminalProfileToDraft
} from './terminal-profiles'

const draft = {
  name: '  Node dev ',
  shell: '/bin/zsh',
  args: '-c\n\n echo $0 \n',
  cwd: ' /work/app ',
  env: '# comment\nNODE_ENV=development\n API_URL ="http://localhost:3000" \n'
}

const stored = {
  id: 'p1',
  name: 'Node dev',
  shell: '/bin/zsh',
  args: ['-l', ' -i '],
  cwd: '/work/app',
  env: { NODE_ENV: 'development', GREETING: '"hi" ' }
}

describe('parseTerminalProfileDraft', () => {
  it('trims the name and folder but keeps arguments and env values as typed', () => {
    expect(parseTerminalProfileDraft(draft, 'p1')).toEqual({
      ok: true,
      profile: {
        id: 'p1',
        name: 'Node dev',
        shell: '/bin/zsh',
        args: ['-c', ' echo $0 '],
        cwd: '/work/app',
        env: { NODE_ENV: 'development', API_URL: '"http://localhost:3000" ' }
      }
    })
  })

  it('rejects an env key that a shell cannot export, naming its line', () => {
    expect(parseTerminalProfileDraft({ ...draft, env: 'GOOD=1\nBAD-KEY=2' }, 'p1')).toEqual({
      ok: false,
      errors: {
        env: 'Line 2: write KEY=value. A key starts with a letter or _ and holds only letters, digits and _.'
      }
    })
    expect(parseTerminalProfileDraft({ ...draft, env: '1ST=x' }, 'p1')).toEqual({
      ok: false,
      errors: {
        env: 'Line 1: write KEY=value. A key starts with a letter or _ and holds only letters, digits and _.'
      }
    })
  })

  it('requires a name, and a shell when there are arguments', () => {
    expect(parseTerminalProfileDraft({ ...draft, name: ' ', shell: '' }, 'p1')).toEqual({
      ok: false,
      errors: { name: 'Name is required.', args: 'Choose a shell to pass arguments to.' }
    })
  })

  it('reads back a stored profile through the editor unchanged', () => {
    expect(parseTerminalProfileDraft(terminalProfileToDraft(stored), 'p1')).toEqual({
      ok: true,
      profile: stored
    })
  })
})

describe('normalizeTerminalProfiles', () => {
  it('keeps valid profiles and drops malformed or repeated ones', () => {
    expect(
      normalizeTerminalProfiles([
        stored,
        { ...stored, id: 'bad-env', env: { 'NOT-OK': 'x' } },
        { ...stored, id: 'bad-env-value', env: { OK: 1 } },
        { ...stored, id: 'bad-args', args: ['-l', 2] },
        { ...stored, id: 'args-no-shell', shell: '' },
        { ...stored, id: 'no-name', name: '' },
        { ...stored, name: 'Same id again' },
        { ...stored, id: 'p2', shell: '', args: [], cwd: '', env: {} },
        'not a profile'
      ])
    ).toEqual([stored, { ...stored, id: 'p2', shell: '', args: [], cwd: '', env: {} }])
  })

  it('reads a missing list as no profiles', () => {
    expect(normalizeTerminalProfiles(undefined)).toEqual([])
    expect(normalizeTerminalProfiles({ p1: stored })).toEqual([])
  })
})
