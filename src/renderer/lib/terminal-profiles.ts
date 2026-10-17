import { logFrontendError } from '@/lib/log-api'
import { randomUUID } from '@/lib/uuid'
import type { TerminalProfile } from '@/types/settings'

/** The profile editor's fields as typed: one argument per line, one `KEY=value` per env line. */
export interface TerminalProfileDraft {
  name: string
  shell: string
  args: string
  cwd: string
  env: string
}

export type TerminalProfileDraftErrors = Partial<Record<'name' | 'args' | 'env', string>>

export type TerminalProfileParse =
  | { ok: true; profile: TerminalProfile }
  | { ok: false; errors: TerminalProfileDraftErrors }

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

export const EMPTY_TERMINAL_PROFILE_DRAFT: TerminalProfileDraft = {
  name: '',
  shell: '',
  args: '',
  cwd: '',
  env: ''
}

export function terminalProfileToDraft(profile: TerminalProfile): TerminalProfileDraft {
  return {
    name: profile.name,
    shell: profile.shell,
    args: profile.args.join('\n'),
    cwd: profile.cwd,
    env: Object.entries(profile.env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
  }
}

/**
 * `KEY=value` lines. A value is kept exactly as typed, with no quote stripping
 * or trimming, so a saved profile reads back unchanged. Blank and `#` lines
 * are skipped.
 */
function parseEnvLines(text: string): { env: Record<string, string> } | { badLine: number } {
  const env: Record<string, string> = {}
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const eq = line.indexOf('=')
    const key = eq === -1 ? '' : line.slice(0, eq).trim()
    if (!ENV_KEY.test(key)) return { badLine: index + 1 }
    env[key] = line.slice(eq + 1)
  }
  return { env }
}

/** Parse the editor's fields. `id` keeps an edited profile's identity; a new profile gets a fresh one. */
export function parseTerminalProfileDraft(
  draft: TerminalProfileDraft,
  id: string = randomUUID()
): TerminalProfileParse {
  const errors: TerminalProfileDraftErrors = {}
  const name = draft.name.trim()
  const shell = draft.shell.trim()
  const args = draft.args.split(/\r?\n/).filter((arg) => arg.length > 0)
  const env = parseEnvLines(draft.env)

  if (name.length === 0) errors.name = 'Name is required.'
  if (args.length > 0 && shell.length === 0) {
    errors.args = 'Choose a shell to pass arguments to.'
  }
  if ('badLine' in env) {
    errors.env = `Line ${env.badLine}: write KEY=value. A key starts with a letter or _ and holds only letters, digits and _.`
  }
  if ('badLine' in env || Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    profile: { id, name, shell, args, cwd: draft.cwd.trim(), env: env.env }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseStoredProfile(value: unknown): TerminalProfile | null {
  if (!isRecord(value)) return null
  const { id, name, shell, args, cwd, env } = value
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof name !== 'string' || name.trim().length === 0) return null
  if (typeof shell !== 'string' || typeof cwd !== 'string') return null
  if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) return null
  if (args.length > 0 && shell.length === 0) return null
  if (!isRecord(env)) return null
  const entries = Object.entries(env)
  if (!entries.every(([key, val]) => ENV_KEY.test(key) && typeof val === 'string')) return null
  return { id, name, shell, args, cwd, env: Object.fromEntries(entries) as Record<string, string> }
}

/**
 * The stored profile list another version or device wrote. Malformed entries
 * and repeated ids are dropped, so every kept profile spawns as it reads.
 */
export function normalizeTerminalProfiles(value: unknown): TerminalProfile[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const profiles = value.flatMap((entry) => {
    const profile = parseStoredProfile(entry)
    if (!profile || seen.has(profile.id)) return []
    seen.add(profile.id)
    return [profile]
  })
  if (profiles.length !== value.length) {
    void logFrontendError({
      level: 'warn',
      source: 'terminal-profiles.normalizeTerminalProfiles',
      message: `Dropped ${value.length - profiles.length} malformed terminal profile(s) from settings`
    })
  }
  return profiles
}

/** The command line a profile runs, for list rows and palette entries. */
export function terminalProfileCommandLine(profile: TerminalProfile): string {
  return [profile.shell || 'Default shell', ...profile.args].join(' ')
}
