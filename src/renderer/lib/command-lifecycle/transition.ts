import type { SessionFrame } from '@shared/types/command-session'

/** Input surface. Editor is mounted only for a trusted suppressed prompt. */
export type InputMode = 'Editor' | 'PTY' | 'raw' | 'exited'

/** Shell phase. CompletionPending is not a phase; it stays inside AtPrompt. */
export type SessionPhase = 'Unknown' | 'AtPrompt' | 'Submitting' | 'Executing' | 'Terminated'

/** Session identity, shell lifecycle, and the retained editor draft. */
export interface SessionState {
  sessionId: string | null
  nonce: string | null
  registered: boolean
  alive: boolean
  trusted: boolean
  mode: InputMode
  phase: SessionPhase
  buffer: string
  promptGeneration: number | null
  lastExitCode: number | null
  committedSubmit: boolean
  completionPending: boolean
  alternateScreen: boolean
  /**
   * Generation of a mountable prompt that arrived while the alternate screen was
   * still active. PromptReady can win the race against xterm parsing the
   * alternate-screen exit, so the leave mounts the editor for it.
   */
  heldPromptGeneration: number | null
}

/** Safe metadata describing a session fallback. */
export interface SessionLogEvent {
  name: string
  detail: string
}

/** Next state and host-facing effects of one session event. */
export interface SessionReduction {
  state: SessionState
  /** True only when the host must write the draft. Fallback must leave this false. */
  writeDraft: boolean
  log: SessionLogEvent | null
}

type PromptReadyFrame = Extract<SessionFrame, { type: 'PromptReady' }>

/** Shell lifecycle and local terminal signals accepted by the reducer. */
export type SessionEvent =
  | { type: 'PromptReady'; sessionId?: string; frame: PromptReadyFrame }
  | { type: 'CommandStarted'; sessionId?: string; nonce?: string }
  | { type: 'CommandFinished'; sessionId?: string; nonce?: string; exit_code?: number }
  | { type: 'Osc133'; text: string }
  | { type: 'IntegrationLost' }
  | { type: 'ProcessExit' }
  | { type: 'CompletionPending' }
  | { type: 'Desync' }
  | { type: 'AlternateScreenEnter' }
  | { type: 'AlternateScreenLeave' }
  | { type: 'Elapsed'; ms: number }

export type LifecycleEvent = Extract<
  SessionEvent,
  { type: 'PromptReady' | 'CommandStarted' | 'CommandFinished' }
>

function hold(state: SessionState): SessionReduction {
  return { state, writeDraft: false, log: null }
}

function isSubmittingTransaction(state: SessionState): boolean {
  return state.phase === 'Submitting' && state.trusted && state.mode === 'PTY'
}

function fallbackRaw(state: SessionState, detail: string): SessionReduction {
  return {
    state: {
      ...state,
      mode: 'raw',
      phase: 'Unknown',
      trusted: false,
      completionPending: false,
      heldPromptGeneration: null
    },
    writeDraft: false,
    log: { name: 'fallback', detail }
  }
}

function isNewerPrompt(state: SessionState, generation: number): boolean {
  return state.promptGeneration === null || generation > state.promptGeneration
}

/** Every editor condition except the alternate screen, which may clear later. */
function isMountablePrompt(
  state: SessionState,
  frame: PromptReadyFrame,
  generation: number
): boolean {
  return (
    frame.prompt_suppressed === true &&
    frame.line_empty === true &&
    isNewerPrompt(state, generation) &&
    !(state.committedSubmit && state.phase !== 'Executing')
  )
}

function dropHeldPrompt(state: SessionState): SessionState {
  return state.heldPromptGeneration === null ? state : { ...state, heldPromptGeneration: null }
}

function openEditor(state: SessionState, generation: number): SessionReduction {
  return hold({
    ...state,
    mode: 'Editor',
    phase: 'AtPrompt',
    trusted: true,
    buffer: state.committedSubmit || isSubmittingTransaction(state) ? '' : state.buffer,
    committedSubmit: false,
    completionPending: false,
    promptGeneration: generation,
    heldPromptGeneration: null
  })
}

function isLifecycleEvent(event: SessionEvent): event is LifecycleEvent {
  return (
    event.type === 'PromptReady' ||
    event.type === 'CommandStarted' ||
    event.type === 'CommandFinished'
  )
}

/** Live registered session, matching session id, and an explicit matching nonce. */
export function authenticated(state: SessionState, event: LifecycleEvent): boolean {
  const nonce = event.type === 'PromptReady' ? event.frame.nonce : event.nonce
  return (
    state.alive &&
    state.registered &&
    event.sessionId !== undefined &&
    event.sessionId === state.sessionId &&
    nonce !== undefined &&
    nonce === state.nonce
  )
}

function reducePrompt(state: SessionState, frame: PromptReadyFrame): SessionReduction {
  const generation = frame.prompt_generation
  if (typeof generation === 'number' && isMountablePrompt(state, frame, generation)) {
    if (!state.alternateScreen) return openEditor(state, generation)
    return hold({ ...state, heldPromptGeneration: generation })
  }
  if (
    isSubmittingTransaction(state) &&
    typeof generation === 'number' &&
    isNewerPrompt(state, generation) &&
    (!frame.prompt_suppressed || !frame.line_empty)
  ) {
    return fallbackRaw(state, 'mode=raw reason=unsuppressed_prompt')
  }
  // A newer prompt that cannot mount supersedes a held one.
  const held = state.heldPromptGeneration
  if (typeof generation === 'number' && held !== null && generation > held) {
    return hold(dropHeldPrompt(state))
  }
  return hold(state)
}

function reduceLifecycle(state: SessionState, event: LifecycleEvent): SessionReduction {
  if (!authenticated(state, event)) return hold(state)
  if (event.type === 'PromptReady') return reducePrompt(state, event.frame)
  if (event.type === 'CommandStarted') {
    return hold(
      state.committedSubmit || isSubmittingTransaction(state)
        ? {
            ...state,
            mode: 'PTY',
            phase: 'Executing',
            committedSubmit: true,
            completionPending: false,
            heldPromptGeneration: null
          }
        : dropHeldPrompt(state)
    )
  }
  if (state.mode === 'Editor' && !state.committedSubmit) return hold(state)
  return hold({
    ...state,
    phase: state.committedSubmit ? 'Executing' : state.phase,
    completionPending: state.committedSubmit ? false : state.completionPending,
    lastExitCode: event.exit_code ?? state.lastExitCode
  })
}

function reduceExitOrFallback(state: SessionState, event: SessionEvent): SessionReduction | null {
  if (event.type === 'ProcessExit') {
    return hold({
      ...state,
      mode: 'exited',
      buffer: '',
      alive: false,
      phase: 'Terminated',
      trusted: false,
      completionPending: false,
      heldPromptGeneration: null
    })
  }
  if (event.type === 'Desync' || event.type === 'IntegrationLost') {
    return fallbackRaw(
      state,
      `mode=raw reason=${event.type === 'Desync' ? 'desync' : 'integration_lost'}`
    )
  }
  return null
}

/**
 * Leaving the alternate screen alone never returns Editor. It mounts the editor
 * only for a held prompt that was already mountable apart from the screen.
 */
function leaveAlternateScreen(state: SessionState): SessionReduction {
  const held = state.heldPromptGeneration
  const left = { ...state, alternateScreen: false, heldPromptGeneration: null }
  if (held === null || !isNewerPrompt(left, held)) return hold(left)
  return openEditor(left, held)
}

/** Pure session reducer. Only an authenticated suppressed prompt mounts the editor. */
export function reduceSession(state: SessionState, event: SessionEvent): SessionReduction {
  if (!state.alive || state.mode === 'exited') return hold(state)
  if (isLifecycleEvent(event)) return reduceLifecycle(state, event)
  const exitOrFallback = reduceExitOrFallback(state, event)
  if (exitOrFallback) return exitOrFallback
  switch (event.type) {
    case 'AlternateScreenEnter':
      return hold({ ...state, alternateScreen: true, mode: 'PTY', completionPending: false })
    case 'AlternateScreenLeave':
      return leaveAlternateScreen(state)
    case 'CompletionPending':
      if (
        !state.trusted ||
        state.mode !== 'Editor' ||
        state.phase !== 'AtPrompt' ||
        state.committedSubmit ||
        state.alternateScreen
      )
        return hold(state)
      return hold({ ...state, completionPending: true })
    default:
      return hold(state)
  }
}
