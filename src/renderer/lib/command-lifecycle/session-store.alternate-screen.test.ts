import type { TerminalModes } from '@shared/types/ipc.types'
import { afterEach, expect, it } from 'vitest'
import { bindSessionClient } from './bind-session'
import { commandDraftStore } from './draft-store'
import { type SessionLifecycleInput, sessionStore } from './session-store'

const NORMAL: TerminalModes = {
  alternateScreen: false,
  bracketedPaste: false,
  applicationCursor: false,
  mouseTracking: null,
  sgrMouseMode: false,
  sgrMousePixelsMode: false
}
const ALTERNATE: TerminalModes = { ...NORMAL, alternateScreen: true }

afterEach(() => {
  sessionStore.reset()
  commandDraftStore.processExited('t1')
})

function prompt(generation: number): SessionLifecycleInput {
  return {
    type: 'PromptReady',
    session_id: 's1',
    nonce: 'n1',
    prompt_generation: generation,
    cwd: '/repo',
    line_empty: true,
    prompt_suppressed: true
  }
}

/** Submits `vim` from a trusted editor and the host accepts it. */
async function submitFromEditor(): Promise<void> {
  sessionStore.apply('t1', { type: 'InitShell', session_id: 's1', nonce: 'n1' })
  sessionStore.apply('t1', prompt(1))
  commandDraftStore.offer('t1', 'Editor', 'vim')
  const binder = bindSessionClient({
    host: { submitCommand: async () => 'Accepted' },
    terminalId: 't1',
    ptyId: () => 'pty-9'
  })
  await binder.submit('vim')
}

/** Submits `vim` from a trusted editor; the program is now on the alternate screen. */
async function runFullScreenProgram(): Promise<void> {
  await submitFromEditor()
  sessionStore.apply('t1', { type: 'CommandStarted', session_id: 's1', nonce: 'n1' })
  sessionStore.applyScreen('t1', ALTERNATE)
  sessionStore.apply('t1', {
    type: 'CommandFinished',
    session_id: 's1',
    nonce: 'n1',
    exit_code: 0
  })
}

it('a prompt that arrives before the alternate-screen exit mounts the editor on leave', async () => {
  await runFullScreenProgram()

  // PromptReady wins the race against xterm parsing `CSI ? 1049 l`.
  sessionStore.apply('t1', prompt(2))
  expect(sessionStore.read('t1').mode).toBe('PTY')

  sessionStore.applyScreen('t1', NORMAL)

  const snapshot = sessionStore.read('t1')
  expect(snapshot).toMatchObject({
    mode: 'Editor',
    phase: 'AtPrompt',
    trusted: true,
    alternateScreen: false,
    promptGeneration: 2,
    committedSubmit: false
  })
  // The submitted command is not handed back as the next draft.
  expect(commandDraftStore.read('t1')).toBe('')
})

it('the alternate-screen exit observed before the prompt still mounts the editor', async () => {
  await runFullScreenProgram()

  sessionStore.applyScreen('t1', NORMAL)
  expect(sessionStore.read('t1').mode).toBe('PTY')
  sessionStore.apply('t1', prompt(2))

  expect(sessionStore.read('t1')).toMatchObject({ mode: 'Editor', promptGeneration: 2 })
})

it('a held prompt is dropped when a new command starts before the leave', async () => {
  await runFullScreenProgram()

  sessionStore.apply('t1', prompt(2))
  sessionStore.apply('t1', { type: 'CommandStarted', session_id: 's1', nonce: 'n1' })
  sessionStore.applyScreen('t1', NORMAL)

  expect(sessionStore.read('t1').mode).toBe('PTY')
  expect(sessionStore.read('t1').phase).toBe('Executing')
})

it('a held prompt is dropped by a desync before the leave', async () => {
  await runFullScreenProgram()

  sessionStore.apply('t1', prompt(2))
  sessionStore.invalidate('t1', 'info')
  sessionStore.applyScreen('t1', NORMAL)

  expect(sessionStore.read('t1').mode).toBe('raw')
})

it('an unsuppressed prompt inside the alternate screen is not held', async () => {
  await runFullScreenProgram()

  sessionStore.apply('t1', { ...prompt(2), prompt_suppressed: false })
  sessionStore.applyScreen('t1', NORMAL)

  expect(sessionStore.read('t1').mode).not.toBe('Editor')
})

it('a held prompt keeps an accepted submit until the leave mounts the editor', async () => {
  await submitFromEditor()
  expect(sessionStore.read('t1')).toMatchObject({ phase: 'Submitting', committedSubmit: true })

  // CommandStarted has not arrived yet when the program enters and leaves.
  sessionStore.applyScreen('t1', ALTERNATE)
  sessionStore.apply('t1', prompt(2))
  expect(sessionStore.read('t1')).toMatchObject({
    mode: 'PTY',
    phase: 'Submitting',
    committedSubmit: true
  })

  sessionStore.applyScreen('t1', NORMAL)
  expect(sessionStore.read('t1')).toMatchObject({
    mode: 'Editor',
    phase: 'AtPrompt',
    committedSubmit: false,
    promptGeneration: 2
  })
  expect(commandDraftStore.read('t1')).toBe('')
})
