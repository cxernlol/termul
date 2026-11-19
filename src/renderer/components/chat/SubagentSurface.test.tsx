import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ToolCall } from '@/lib/acp-api'
import type { FilePathResolutionContext } from '@/lib/file-path-links'
import {
  endedState,
  orchestratedSubagentRecord,
  type SubagentRecordOverrides,
  subagentToolCall
} from '@/lib/test-utils/subagent'
import { agentReuseKey } from '@/stores/acp-reuse-keys'
import { useAcpStore } from '@/stores/acp-store'
import type { ChatMessage } from '@/stores/acp-store/types'
import { useOverlayStackStore } from '@/stores/overlay-stack-store'
import { ChatMessageList } from './ChatMessageList'
import { buildTimeline } from './chat-timeline'
import { SubagentSurfaceProvider } from './SubagentSurface'

const mobileRef = vi.hoisted(() => ({ current: false }))
const reducedRef = vi.hoisted(() => ({ current: true }))
vi.mock('@/hooks/use-mobile-web-shell', () => ({ useMobileWebShell: () => mobileRef.current }))

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return { ...actual, useReducedMotion: () => reducedRef.current }
})

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const openFilePathFromTerminal = vi.hoisted(() => vi.fn(() => Promise.resolve({ ok: true })))
vi.mock('@/lib/file-path-links', async () => ({
  ...(await vi.importActual<typeof import('@/lib/file-path-links')>('@/lib/file-path-links')),
  openFilePathFromTerminal
}))

function prose({
  text,
  filePathContext
}: {
  text: string
  filePathContext?: FilePathResolutionContext
}): React.JSX.Element {
  return (
    <div
      data-testid="agent-prose"
      data-cwd={filePathContext?.cwd}
      data-project-root={filePathContext?.projectRoot}
    >
      {text}
    </div>
  )
}
vi.mock('./chat-agent-prose', () => ({ AgentProse: prose }))
vi.mock('./ChatMessage', () => ({
  AgentProse: prose,
  ChatMessage: ({ message }: { message: ChatMessage }) => (
    <div>{message.blocks.map((block) => block.text ?? '').join('')}</div>
  )
}))

const SESSION = 's1'

const user: ChatMessage = {
  id: 'u1',
  role: 'user',
  blocks: [{ type: 'text', text: 'Check the auth race' }],
  streaming: false,
  timestamp: 1_000,
  seq: 1
}

const narration: ChatMessage = {
  id: 'a1',
  role: 'agent',
  blocks: [{ type: 'text', text: 'Splitting this into subagents.' }],
  streaming: false,
  timestamp: 1_100,
  seq: 2
}

const finalReply: ChatMessage = {
  id: 'a2',
  role: 'agent',
  blocks: [{ type: 'text', text: 'All done.' }],
  streaming: false,
  timestamp: 9_000,
  seq: 50
}

let seq = 10

function dispatch(
  id: string,
  record: SubagentRecordOverrides = {},
  call: Partial<ToolCall> = {}
): ToolCall {
  seq += 1
  return subagentToolCall(
    { title: id, startedAt: Date.now() - 5_000, ...record },
    { toolCallId: id, seq, timestamp: 1_200, ...call }
  )
}

function child(parent: string, id: string, call: Partial<ToolCall> = {}): ToolCall {
  seq += 1
  return {
    toolCallId: id,
    title: 'Read refresh.rs',
    kind: 'read',
    rawInput: { path: 'src/auth/refresh.rs' },
    status: 'completed',
    parentToolCallId: parent,
    seq,
    timestamp: 1_300,
    ...call
  }
}

interface ChatProps {
  toolCalls: ToolCall[]
  messages?: ChatMessage[]
  turnActive?: boolean
  filePathContext?: FilePathResolutionContext
  agentId?: string
}

/** A chat transcript inside its subagent surface, with the store holding its calls. */
function Chat({
  toolCalls,
  messages = [user, narration],
  turnActive = true,
  filePathContext,
  agentId
}: ChatProps): React.JSX.Element {
  return (
    <TooltipProvider>
      <SubagentSurfaceProvider
        sessionId={SESSION}
        agentId={agentId}
        toolCalls={toolCalls}
        messages={messages}
        turnActive={turnActive}
        filePathContext={filePathContext}
        isVisible
      >
        <ChatMessageList
          items={buildTimeline(messages, toolCalls)}
          sessionId={SESSION}
          showRunningIndicator={turnActive}
          filePathContext={filePathContext}
        />
      </SubagentSurfaceProvider>
    </TooltipProvider>
  )
}

function renderChat(props: ChatProps) {
  useAcpStore.setState((s) => ({ toolCalls: { ...s.toolCalls, [SESSION]: props.toolCalls } }))
  const view = render(<Chat {...props} />)
  return {
    ...view,
    update(next: ChatProps) {
      useAcpStore.setState((s) => ({ toolCalls: { ...s.toolCalls, [SESSION]: next.toolCalls } }))
      view.rerender(<Chat {...next} />)
    }
  }
}

const panel = () => screen.getByTestId('subagent-panel')
const row = (name: RegExp) => screen.getByRole('button', { name })

describe('subagents in the transcript', () => {
  beforeEach(() => {
    mobileRef.current = false
    seq = 10
    useOverlayStackStore.setState({ stack: [] })
  })
  afterEach(async () => {
    cleanup()
    // FocusScope restores focus on a 0ms timer. Drain that timer before the
    // next file replaces this document.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    useAcpStore.setState({ toolCalls: {} })
  })

  it('groups subagents launched together, outside the tool fold, with a status summary', () => {
    renderChat({
      toolCalls: [
        child('audit', 'c1', { status: 'in_progress' }),
        dispatch('audit', { title: 'Audit auth flow', role: 'Explore' }),
        dispatch(
          'tests',
          { title: 'Fix session tests', state: endedState() },
          { status: 'completed', rawOutput: { text: 'Fixed 2 assertions.\nAll pass.' } }
        ),
        dispatch(
          'lint',
          {
            title: 'Lint the renderer',
            state: { activity: 'idle', end: { reason: 'failed', error: 'ENOENT biome.json' } }
          },
          { status: 'failed' }
        ),
        { toolCallId: 'r1', kind: 'read', rawInput: { path: 'a.ts' }, status: 'completed', seq: 40 }
      ]
    })

    expect(
      screen.getByRole('button', { name: '3 subagents: 1 working, 1 done, 1 failed' })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('3 subagents')).toBeVisible()
    expect(row(/^Audit auth flow.*Working/)).toHaveTextContent(
      /Audit auth flowExploreReading refresh.rs · 1 toolWorking/
    )
    expect(row(/^Fix session tests.*Done/)).toHaveTextContent('Fixed 2 assertions.')
    expect(row(/^Fix session tests.*Done/)).not.toHaveTextContent('All pass.')
    expect(row(/^Lint the renderer.*Failed/)).toHaveTextContent('ENOENT biome.json')
    // The plain read stays in its own fold.
    expect(screen.getByRole('button', { name: /^Read 1 file/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('shows a running subagent as a neutral spinner, not amber', () => {
    renderChat({ toolCalls: [dispatch('map', { title: 'Map the UI' })] })
    const card = row(/^Map the UI.*Working/)
    expect(card.querySelectorAll('.tm-comet').length).toBeGreaterThanOrEqual(2)
    expect(card.querySelector('.text-muted-foreground .tm-comet')).not.toBeNull()
    expect(card.querySelector('.text-warning')).toBeNull()
    expect(card.querySelector('.bg-warning')).toBeNull()
  })

  it('keeps the warning ink for a subagent that waits on the user', () => {
    renderChat({
      toolCalls: [
        dispatch('ask', { title: 'Ask the user', state: { activity: 'requires_action' } })
      ]
    })
    const card = row(/^Ask the user.*Needs input/)
    expect(card.querySelector('.text-warning')).not.toBeNull()
    expect(card.querySelector('.bg-warning')).not.toBeNull()
  })

  it('shows a single subagent as one card without a group header', () => {
    renderChat({ toolCalls: [dispatch('map', { title: 'Map the UI', role: 'Explore' })] })
    expect(row(/^Map the UI.*Working/)).toBeInTheDocument()
    expect(screen.queryByText(/subagents$/)).toBeNull()
  })

  it('folds and dims the group once every subagent settled', async () => {
    const live = [dispatch('a'), dispatch('b')]
    const { update } = renderChat({ toolCalls: live })
    const header = () => screen.getByRole('button', { name: /^2 subagents/ })
    expect(header()).toHaveAttribute('aria-expanded', 'true')

    update({
      toolCalls: live.map((tc) => ({
        ...tc,
        status: 'completed' as const,
        subagent: { ...tc.subagent!, ...endedState() }
      })),
      messages: [user, narration],
      turnActive: true
    })
    await waitFor(() => expect(header()).toHaveAttribute('aria-expanded', 'false'))
    expect(header()).toHaveAccessibleName('2 subagents: 2 done')
    expect(header().closest('[data-subagent-group]')).toHaveClass('opacity-60')
  })

  it('opens the panel from a row with its place in the group and the reported metadata', () => {
    renderChat({
      toolCalls: [
        dispatch('a', { title: 'Audit auth flow' }),
        dispatch('b', {
          title: 'Fix session tests',
          role: 'Explore',
          model: 'Opus 4.5',
          usage: { totalTokens: 37_800 },
          prompt: 'Fix the failing session tests.'
        }),
        child('b', 'c1'),
        child('b', 'c2')
      ]
    })
    fireEvent.click(row(/^Fix session tests/))
    expect(panel()).toHaveTextContent('Subagent of this chat · 2 of 2')
    expect(within(panel()).getByRole('heading', { name: 'Fix session tests' })).toBeVisible()
    expect(panel()).toHaveTextContent('Explore · Opus 4.5 · 2 tools · 37.8k tok')
    expect(panel()).toHaveTextContent('Fix the failing session tests.')
    expect(panel()).toHaveTextContent('Activity · 2')
    expect(row(/^Fix session tests/)).toHaveAttribute('aria-current', 'true')

    fireEvent.keyDown(panel(), { key: 'ArrowUp' })
    expect(within(panel()).getByRole('heading', { name: 'Audit auth flow' })).toBeVisible()
    expect(panel()).toHaveTextContent('1 of 2')

    fireEvent.click(within(panel()).getByRole('button', { name: 'Back to chat' }))
    expect(screen.queryByTestId('subagent-panel')).toBeNull()
  })

  it('hides sections the agent did not report, saying why in one line', () => {
    renderChat({
      toolCalls: [
        dispatch('final', { title: 'Cursor task', caps: { transcript: 'final' } }),
        dispatch('bare', { title: 'Bare task', caps: { transcript: 'none' } })
      ]
    })
    fireEvent.click(row(/^Cursor task/))
    expect(panel()).toHaveTextContent('The agent did not share the task it gave this subagent.')
    expect(panel()).toHaveTextContent("reports only this subagent's result, not its steps.")
    expect(panel()).toHaveTextContent('The result shows here when it finishes.')
    expect(within(panel()).queryByRole('heading', { name: /^Activity/ })).toBeNull()
    expect(within(panel()).queryByRole('heading', { name: 'Task' })).toBeNull()

    fireEvent.click(row(/^Bare task/))
    expect(panel()).toHaveTextContent("doesn't report what this subagent does.")
  })

  it("wears the chat agent's icon and name on a subagent the chat agent runs itself", () => {
    useAcpStore.setState({
      agentConfigs: [
        {
          id: 'acp-registry:claude-acp',
          name: 'Claude',
          command: 'claude',
          args: [],
          env: {},
          templateId: 'claude-acp'
        }
      ],
      configToLiveAgent: { [agentReuseKey('acp-registry:claude-acp', '/repo')]: 'agent-live-1' }
    })
    renderChat({
      agentId: 'agent-live-1',
      toolCalls: [dispatch('own', { title: 'Own task', caps: { transcript: 'final' } })]
    })

    const avatar = row(/^Own task/).querySelector('[data-subagent-avatar]')
    expect(avatar?.querySelector('[data-termul-icon="Bot"]')).toBeNull()
    expect(avatar?.querySelector('[data-agent-brand] svg')).not.toBeNull()
    fireEvent.click(row(/^Own task/))
    expect(panel()).toHaveTextContent('Claude did not share the task it gave this subagent.')
    useAcpStore.setState({ agentConfigs: [], configToLiveAgent: {} })
  })

  it('shows the latest message while running and the result once settled, never twice', async () => {
    const running = dispatch(
      'a',
      { title: 'Audit auth flow' },
      { subagentText: 'So far the race is in session.ts:143.' }
    )
    const { update } = renderChat({ toolCalls: [running] })
    fireEvent.click(row(/^Audit auth flow/))
    expect(within(panel()).getByRole('heading', { name: 'Latest message' })).toBeVisible()
    expect(within(panel()).getByTestId('agent-prose')).toHaveTextContent('session.ts:143')

    const finalText = 'The race is in session.ts:143; refresh() runs without the lock.'
    update({
      toolCalls: [
        {
          ...running,
          status: 'completed',
          subagentText: finalText,
          content: [{ type: 'content', content: { type: 'text', text: finalText } }],
          subagent: { ...running.subagent!, ...endedState() }
        }
      ],
      messages: [user, narration, finalReply],
      turnActive: false
    })
    await waitFor(() =>
      expect(within(panel()).getByRole('heading', { name: 'Result' })).toBeVisible()
    )
    expect(within(panel()).queryByRole('heading', { name: 'Latest message' })).toBeNull()
    expect(within(panel()).getAllByText(finalText)).toHaveLength(1)
    expect(within(panel()).getByText('Done')).toBeVisible()
  })

  it('opens a nested subagent from Activity and returns to its parent on Back', () => {
    renderChat({
      toolCalls: [
        dispatch('parent', { title: 'Plan the fix' }),
        child('parent', 'c1'),
        dispatch('nested', { title: 'Read the spec' }, { parentToolCallId: 'parent' })
      ]
    })
    expect(screen.queryByRole('button', { name: /^Read the spec/ })).toBeNull()
    fireEvent.click(row(/^Plan the fix/))
    expect(panel()).toHaveTextContent('Activity · 2')
    fireEvent.click(within(panel()).getByRole('button', { name: /^Read the spec/ }))
    expect(within(panel()).getByRole('heading', { name: 'Read the spec' })).toBeVisible()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Back' }))
    expect(within(panel()).getByRole('heading', { name: 'Plan the fix' })).toBeVisible()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Back' }))
    expect(screen.queryByTestId('subagent-panel')).toBeNull()
  })

  it('keeps the panel open when the turn completes and folds the transcript', async () => {
    const running = dispatch('a', { title: 'Audit branch', prompt: 'Review it.' })
    const { update } = renderChat({ toolCalls: [running] })
    fireEvent.click(row(/^Audit branch/))
    expect(within(panel()).getByText('Working')).toBeVisible()

    update({
      toolCalls: [
        {
          ...running,
          status: 'completed',
          rawOutput: { text: 'No changes needed.' },
          subagent: { ...running.subagent!, ...endedState() }
        }
      ],
      messages: [user, narration, finalReply],
      turnActive: false
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Worked/ })).toHaveAttribute(
        'aria-expanded',
        'false'
      )
    )
    expect(panel()).toHaveTextContent('No changes needed.')
  })

  it('passes the chat file-path context to the result prose', () => {
    renderChat({
      toolCalls: [
        dispatch(
          'a',
          { title: 'Audit branch', state: endedState() },
          { status: 'completed', rawOutput: { text: 'Edited src/foo.ts.' } }
        )
      ],
      filePathContext: { cwd: '/proj/sub', projectRoot: '/proj' }
    })
    fireEvent.click(row(/^Audit branch/))
    const result = within(panel()).getByTestId('agent-prose')
    expect(result).toHaveTextContent('Edited src/foo.ts.')
    expect(result).toHaveAttribute('data-cwd', '/proj/sub')
    expect(result).toHaveAttribute('data-project-root', '/proj')
  })

  it('says a background subagent with no result reported to the agent, not this chat', () => {
    renderChat({
      toolCalls: [
        dispatch(
          'a',
          { title: 'Watch the build', background: true, state: endedState() },
          { status: 'completed' }
        )
      ]
    })
    fireEvent.click(row(/^Watch the build/))
    expect(panel()).toHaveTextContent(
      'This subagent ran in the background and reported to The agent, not to this chat.'
    )
  })

  it('opens a full-height bottom sheet on the phone and closes it with system Back', () => {
    mobileRef.current = true
    renderChat({ toolCalls: [dispatch('a', { title: 'Audit auth flow' })] })
    fireEvent.click(row(/^Audit auth flow/))
    const sheet = screen.getByRole('dialog', { name: 'Audit auth flow' })
    expect(sheet).toHaveAttribute('data-sheet')
    expect(useOverlayStackStore.getState().stack.map((e) => e.id)).toEqual(['subagent-panel'])
    act(() => {
      useOverlayStackStore.getState().stack.at(-1)?.close()
    })
    expect(screen.queryByRole('dialog', { name: 'Audit auth flow' })).toBeNull()
  })
})

describe('opening the subagent panel', () => {
  const animate = vi.fn((): { cancel: () => void; onfinish: (() => void) | null } => ({
    cancel: vi.fn(),
    onfinish: null
  }))
  beforeEach(() => {
    mobileRef.current = false
    reducedRef.current = false
    seq = 10
    useOverlayStackStore.setState({ stack: [] })
    animate.mockClear()
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 40, y: 80, width: 32, height: 32 })
    )
  })
  afterEach(async () => {
    cleanup()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    vi.restoreAllMocks()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    reducedRef.current = true
    useAcpStore.setState({ toolCalls: {} })
  })

  const morphCalls = () =>
    animate.mock.contexts.filter((el) => (el as Element).hasAttribute('data-subagent-morph'))

  it('grows the header avatar out of the clicked row avatar', () => {
    renderChat({ toolCalls: [dispatch('a', { title: 'Audit auth flow' }), dispatch('b')] })
    fireEvent.click(row(/^Audit auth flow/), { detail: 1 })
    expect(morphCalls()).toHaveLength(1)
    const [keyframes, options] = animate.mock.calls[0] as unknown as [
      Keyframe[],
      KeyframeAnimationOptions
    ]
    expect(String(keyframes[0].transform)).toMatch(/^translate\(.+\) scale\(.+\)$/)
    expect(keyframes[1].transform).toBe('translate(0, 0) scale(1)')
    expect(options.duration).toBe(340)
  })

  it('opens at once from the keyboard, on a step and under reduced motion', () => {
    renderChat({ toolCalls: [dispatch('a', { title: 'Audit auth flow' }), dispatch('b')] })
    // A keyboard click has detail 0.
    fireEvent.click(row(/^Audit auth flow/), { detail: 0 })
    expect(morphCalls()).toHaveLength(0)
    fireEvent.keyDown(panel(), { key: 'ArrowDown' })
    expect(morphCalls()).toHaveLength(0)
    fireEvent.click(within(panel()).getByRole('button', { name: 'Back to chat' }))

    reducedRef.current = true
    fireEvent.click(row(/^Audit auth flow/), { detail: 1 })
    expect(morphCalls()).toHaveLength(0)
  })

  it('slides the docked panel in once, not on each step', () => {
    renderChat({ toolCalls: [dispatch('a', { title: 'Audit auth flow' }), dispatch('b')] })
    fireEvent.click(row(/^Audit auth flow/), { detail: 1 })
    const aside = screen.getByRole('complementary', { name: 'Subagent' })
    expect(aside.className).toContain('animate-in')
    expect(aside.className).toContain('motion-safe:slide-in-from-right-3')
    fireEvent.keyDown(panel(), { key: 'ArrowDown' })
    expect(screen.getByRole('complementary', { name: 'Subagent' })).toBe(aside)
  })

  it('closes the docked panel with a fade and a slide out, then removes it', () => {
    renderChat({ toolCalls: [dispatch('a', { title: 'Audit auth flow' }), dispatch('b')] })
    fireEvent.click(row(/^Audit auth flow/), { detail: 1 })
    const shown = panel()
    animate.mockClear()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Back to chat' }), { detail: 1 })

    // The panel leaves the layout at once and fades out over the chat. It is
    // the same element: no second mount, so no second avatar morph.
    expect(screen.getByTestId('subagent-panel')).toBe(shown)
    expect(morphCalls()).toHaveLength(0)
    expect(screen.queryByRole('complementary', { name: 'Subagent' })).toBeNull()
    const exitCall = animate.mock.calls.findIndex(
      (call) => (call as unknown as [Keyframe[]])[0]?.[1]?.opacity === 0
    )
    expect(exitCall).toBeGreaterThanOrEqual(0)
    const [keyframes, options] = animate.mock.calls[exitCall] as unknown as [
      Keyframe[],
      KeyframeAnimationOptions
    ]
    expect(keyframes[1]).toEqual({ opacity: 0, transform: 'translateX(12px)' })
    expect(options).toMatchObject({ duration: 150, fill: 'forwards' })
    const leaving = animate.mock.contexts[exitCall] as HTMLElement
    expect(leaving).toHaveAttribute('aria-hidden', 'true')
    expect(leaving.className).toContain('absolute')

    act(() => animate.mock.results[exitCall].value.onfinish?.())
    expect(leaving).not.toBeInTheDocument()
  })

  it('closes at once from the keyboard: Esc, and Enter or Space on Close or Back', () => {
    renderChat({ toolCalls: [dispatch('a', { title: 'Audit auth flow' })] })
    const exits = () =>
      animate.mock.calls.filter((call) => (call as unknown as [Keyframe[]])[0]?.[1]?.opacity === 0)

    fireEvent.click(row(/^Audit auth flow/), { detail: 1 })
    fireEvent.keyDown(panel(), { key: 'Escape' })
    expect(screen.queryByTestId('subagent-panel')).toBeNull()

    fireEvent.click(row(/^Audit auth flow/), { detail: 1 })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }), { detail: 0 })
    expect(screen.queryByTestId('subagent-panel')).toBeNull()

    fireEvent.click(row(/^Audit auth flow/), { detail: 1 })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Back' }), { detail: 0 })
    expect(screen.queryByTestId('subagent-panel')).toBeNull()

    expect(exits()).toHaveLength(0)
  })

  it('does not play the exit when the chat empties the panel itself', () => {
    const view = renderChat({ toolCalls: [dispatch('a', { title: 'Audit auth flow' })] })
    fireEvent.click(row(/^Audit auth flow/), { detail: 1 })
    animate.mockClear()
    // The subagent leaves the chat: the panel closes with no exit.
    view.update({ toolCalls: [] })
    expect(screen.queryByTestId('subagent-panel')).toBeNull()
    expect(animate).not.toHaveBeenCalled()
  })
})

describe('orchestrated subagents in the transcript', () => {
  const CODEX_CONFIG = {
    id: 'acp-registry:codex-acp',
    name: 'Codex',
    command: 'codex',
    args: [],
    env: {},
    templateId: 'codex-acp'
  }

  function orchestrated(
    id: string,
    record: Parameters<typeof orchestratedSubagentRecord>[0] = {},
    call: Partial<ToolCall> = {}
  ): ToolCall {
    seq += 1
    return {
      toolCallId: id,
      title: 'Task',
      kind: 'think',
      status: 'in_progress',
      seq,
      timestamp: 1_200,
      ...call,
      subagent: orchestratedSubagentRecord({ ...record, dispatchToolCallId: id })
    }
  }

  beforeEach(() => {
    mobileRef.current = false
    seq = 10
    useOverlayStackStore.setState({ stack: [] })
    useAcpStore.setState({ agentConfigs: [CODEX_CONFIG] })
  })
  afterEach(async () => {
    cleanup()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    useAcpStore.setState({ toolCalls: {}, agentConfigs: [] })
  })

  it('runs the row on the child identity: its glyph, agent, model and workspace chip', () => {
    renderChat({
      toolCalls: [
        orchestrated('sub-1', {
          model: 'gpt-5.5',
          usage: { toolUses: 6 }
        }),
        child('sub-1', 'c1')
      ]
    })

    const card = row(/^Implement the retry fix.*Working/)
    expect(card.querySelector('[data-subagent-avatar] svg')).not.toBeNull()
    expect(card).toHaveTextContent('worktree · troupe/sub/retry-fix')
    // The workspace chip replaces the role and background chips.
    expect(card).not.toHaveTextContent('background')
    expect(card).toHaveTextContent('Codex · gpt-5.5 · Read refresh.rs · 6 tools')
  })

  it('docks the panel with the child identity, its workspace and the diff summary', () => {
    renderChat({
      toolCalls: [
        orchestrated(
          'sub-1',
          {
            model: 'gpt-5.5',
            usage: { toolUses: 6 },
            state: endedState(),
            workspace: { diffStat: '3 files changed, +42 -7' }
          },
          {
            status: 'completed',
            rawOutput: { text: 'Done. Committed on the branch below; nothing merged.' }
          }
        )
      ]
    })
    fireEvent.click(row(/^Implement the retry fix.*Done/))

    expect(panel()).toHaveTextContent('Codex · gpt-5.5 · 6 tools')
    expect(within(panel()).getByRole('heading', { name: 'Workspace' })).toBeVisible()
    expect(within(panel()).getByText('/work/.termul/worktrees/sub-retry-fix')).toBeVisible()
    expect(within(panel()).getByText('main @ 42be01e, with uncommitted changes')).toBeVisible()

    const result = within(panel()).getByRole('heading', { name: 'Result' }).closest('section')
    expect(result).toHaveTextContent('3 files changed')
    expect(result?.querySelector('.text-success')).toHaveTextContent('+42')
    expect(result?.querySelector('.text-destructive')).toHaveTextContent('−7')
    // The branch shows twice: in the Workspace section and the diff summary.
    expect(within(panel()).getAllByText('troupe/sub/retry-fix')).toHaveLength(2)
  })

  it('says a stopped run returned no result, not that it reported to the agent', () => {
    renderChat({
      toolCalls: [orchestrated('sub-1', { state: endedState('cancelled') }, { status: 'failed' })]
    })
    fireEvent.click(row(/^Implement the retry fix/))
    expect(panel()).toHaveTextContent('The subagent returned no result.')
    expect(panel()).not.toHaveTextContent('ran in the background')
  })

  it('resolves the result and activity paths in the run worktree, not the chat checkout', () => {
    openFilePathFromTerminal.mockClear()
    const worktree = '/work/.termul/worktrees/sub-retry-fix'
    renderChat({
      toolCalls: [
        orchestrated(
          'sub-1',
          { state: endedState() },
          { status: 'completed', rawOutput: { text: 'Wrote [Report](./report.md).' } }
        ),
        child('sub-1', 'c1')
      ],
      filePathContext: { cwd: '/work', projectRoot: '/work' }
    })
    fireEvent.click(row(/^Implement the retry fix/))

    const result = within(panel()).getByTestId('agent-prose')
    expect(result).toHaveTextContent('Wrote [Report](./report.md).')
    expect(result).toHaveAttribute('data-cwd', worktree)
    expect(result).toHaveAttribute('data-project-root', worktree)

    fireEvent.click(within(panel()).getByRole('button', { name: 'Open file' }))
    expect(openFilePathFromTerminal).toHaveBeenCalledWith('src/auth/refresh.rs', {
      cwd: worktree,
      projectRoot: worktree
    })
  })

  it('keeps the chat file-path context for a run in the chat folder', () => {
    renderChat({
      toolCalls: [
        orchestrated(
          'sub-1',
          {
            state: endedState(),
            workspace: { mode: 'shared', path: undefined, branch: undefined }
          },
          { status: 'completed', rawOutput: { text: 'Edited src/foo.ts.' } }
        )
      ],
      filePathContext: { cwd: '/work/sub', projectRoot: '/work' }
    })
    fireEvent.click(row(/^Implement the retry fix/))

    const result = within(panel()).getByTestId('agent-prose')
    expect(result).toHaveAttribute('data-cwd', '/work/sub')
    expect(result).toHaveAttribute('data-project-root', '/work')
  })
})
