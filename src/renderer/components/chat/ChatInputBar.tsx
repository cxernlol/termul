import type { Editor } from '@tiptap/core'
import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { ClaudeAccountChip } from '@/components/chat/claude-account/ClaudeAccountChip'
import { ClaudeLimitWarning } from '@/components/chat/claude-account/ClaudeLimitWarning'
import { CodexAccountChip } from '@/components/chat/codex-account/CodexAccountChip'
import { CodexLimitWarning } from '@/components/chat/codex-account/CodexLimitWarning'
import { Paperclip } from '@/components/icons'
import { useAgentSkills } from '@/hooks/use-agent-skills'
import { useAttachmentDropZone } from '@/hooks/use-attachment-drop-zone'
import { useMentionRecents } from '@/hooks/use-mention-recents'
import { useMobileWebShell } from '@/hooks/use-mobile-web-shell'
import { useVisibleSnapshot } from '@/hooks/use-visible-snapshot'
import type {
  AvailableCommand,
  ContentBlock,
  SessionConfigOption,
  SessionModeState
} from '@/lib/acp-api'
import { registerSessionTempFiles } from '@/lib/attachment-temp-cleanup'
import type { TermulToolId } from '@/lib/composer/termul-tools'
import { cn } from '@/lib/utils'
import type { AcpSession, PendingPermission, QueuedPrompt } from '@/stores/acp-store'
import { useAcpMessages, useSessionUsage } from '@/stores/acp-store'
import type { OptionValues } from '@/stores/acp-store/composer-options'
import { useCodexRestartingStore } from '@/stores/codex-account-restart'
import { ModeChip } from './AgentHeader'
import { AttachmentPreviewGroup } from './AttachmentPreviewGroup'
import { AgentModelSelector } from './agent-model-selector/AgentModelSelector'
import { ComposerBeamShell } from './ComposerBeamShell'
import { ContextUsageIndicator } from './ContextUsageIndicator'
import { appOwnedTempPaths } from './chat-attachments'
import {
  filterDuplicateModeConfigOptions,
  partitionConfigOptions,
  resolveModelOption,
  splitFastModeOption
} from './chat-input-bar-config'
import {
  CHAT_GUTTER_X,
  COMPOSER_PHONE_CARD_CLASS,
  COMPOSER_PHONE_GUTTER_X,
  COMPOSER_PHONE_INPUT_MAX_HEIGHT,
  COMPOSER_PHONE_INPUT_MIN_HEIGHT,
  COMPOSER_PHONE_INPUT_ROW_CLASS,
  COMPOSER_PHONE_PLACEHOLDER,
  COMPOSER_TRAY_CLASS,
  useComposerToolbarMode
} from './chat-layout'
import {
  CHAT_START_COLUMN_CLASS,
  CHAT_START_INPUT_MAX_HEIGHT,
  CHAT_START_INPUT_MIN_HEIGHT,
  CHAT_START_INPUT_ROW_CLASS
} from './chat-start'
import { useComposerMorph } from './chat-start-morph'
import { ChatComposerEditor, focusComposerFromRowPress } from './composer/ChatComposerEditor'
import { ComposerAddMenu } from './composer/ComposerAddMenu'
import { ComposerAddSheet } from './composer/ComposerAddSheet'
import { ComposerConnectorsButton, ComposerFootRow, ComposerRaised } from './composer/ComposerFoot'
import { ComposerSendButton } from './composer/ComposerSendButton'
import { blurComposerEditor, insertComposerTrigger } from './composer/insert-composer-trigger'
import { insertComposerTool } from './composer/insert-pill'
import {
  type SelectionContextInsertRequest,
  useSelectionContextInsertRequest
} from './composer/insert-selection-context'
import { useChatConnectors } from './composer/use-chat-connectors'
import { useTermulTools } from './composer/use-termul-tools'
import { buildComposerSend } from './composer-send-blocks'
import { FileMentionMenu } from './FileMentionMenu'
import { PermissionPrompt } from './PermissionPrompt'
import { PromptQueuePanel } from './PromptQueuePanel'
import { SlashCommandMenu, type SlashMenuHandle } from './SlashCommandMenu'
import { SkillFilesProvider } from './skill-file-links'
import { useChatComposer } from './use-chat-composer'
import { useComposerAgent } from './use-composer-agent'
import { useComposerAttachments } from './use-composer-attachments'
import { useComposerCaretRestore, useComposerMentionSelect } from './use-composer-caret-restore'
import { useComposerDraft } from './use-composer-draft'
import { useComposerDraftStart } from './use-composer-draft-start'
import { useComposerMentions } from './use-composer-mentions'
import { useComposerSendLock } from './use-composer-send-lock'
import { useScrollEditorOnOsk } from './use-scroll-editor-on-osk'

interface ChatInputBarProps {
  /** Active session — drives selector chips. */
  session: AcpSession
  /** Project/worktree root used to discover project-local skills. */
  projectRoot?: string
  /** Whether a prompt turn is currently active (disables send, enables cancel). */
  busy: boolean
  /** Whether the session is closed/disconnected (fully disables input). */
  disabled: boolean
  /**
   * Whether the agent-backed controls (model / mode / config pickers, agent
   * switch, slash-menu config and mode rows) are disabled. Defaults to
   * `disabled`. A stopped chat that resumes on input keeps the editor enabled
   * but these controls off: they would hit the stopped agent.
   */
  controlsDisabled?: boolean
  /** Whether the agent accepts inline image content blocks (drag/paste images). */
  imageCapable?: boolean
  /** Whether the agent accepts embedded `resource` blocks (drag/paste text files). */
  embedCapable?: boolean
  /** Returns `false` when nothing was sent: the composer keeps its draft. */
  onSend: (text: string) => false | undefined
  /**
   * Send a prompt carrying structured content blocks (text + attachments).
   * The first arg is the wire text dispatched to the agent; the optional second
   * arg is the display blocks stored in the optimistic user message so the
   * timeline can render inline skill chips (token text) while the agent
   * receives the path-based wire framing. When omitted, the wire blocks are
   * also used for display.
   */
  onSendBlocks: (blocks: ContentBlock[], displayBlocks?: ContentBlock[]) => false | undefined
  onCancel: () => void
  /** Slash-menu data sources from the active session. */
  commands: AvailableCommand[]
  configOptions: SessionConfigOption[]
  modes: SessionModeState | null
  /** Apply a config option value immediately. May return a Promise for chip pending UI. */
  onSetConfig: (configId: string, valueId: string | boolean) => void | Promise<void>
  /** Apply a legacy mode immediately. May return a Promise for chip pending UI. */
  onSetMode: (modeId: string) => void | Promise<void>
  /**
   * Apply a model pick, then its option values (`values`: a favorite's
   * snapshot). May return a Promise for chip pending UI.
   */
  onSetModel: (modelId: string, values?: OptionValues) => void | Promise<void>
  /** External text to load into the composer (edit a message / pick a suggestion). */
  seedText?: string
  /** Bump to re-apply `seedText` even if the text is unchanged. */
  seedNonce?: number
  /** Add a selection context chip at the composer caret (from the message list). */
  selectionContextInsert?: SelectionContextInsertRequest
  /** Pending prompts shown above the composer. */
  queue?: QueuedPrompt[]
  /** Approval request currently waiting for the user. */
  permission?: PendingPermission | null
  /**
   * Composer dock at the top of the card (turn error, stopped chat, usage
   * limit). It replaces the near-limit warning while it shows.
   */
  notice?: React.ReactNode
  /**
   * Whether `notice` shows something now. A notice element can stay mounted
   * while empty (to animate out), so its presence alone must not hide the
   * limit warning. Defaults to `notice` being set.
   */
  noticeShown?: boolean
  /** Placeholder while `disabled` (default "Composer unavailable"). */
  disabledPlaceholder?: string
  onRemoveQueued?: (queueId: string) => void
  onSendQueuedNow?: (queueId: string) => void
  /** Move a queued prompt to `toIndex`; gives each row a drag handle. */
  onMoveQueued?: (queueId: string, toIndex: number) => void
  /** Drop every queued prompt; gives the queue header a Clear action. */
  onClearQueued?: () => void
  /**
   * Whether the host chat panel's tab is the pane's active tab. While false,
   * the per-flush `useAcpMessages` re-render is frozen (same render gate as
   * AgentChatPanel): the subscription stays live, but the derived value holds
   * its last-visible snapshot so a hidden panel's composer does no per-flush
   * work. Defaults to true (visible) for other hosts.
   */
  isVisible?: boolean
  /**
   * Fired when the user starts a draft: the first edit or paste into an empty
   * composer (no text, no attachments). A restored draft or a seed never
   * fires it. The chat panel uses it to resume a stopped chat early.
   */
  onDraftStart?: () => void
  /**
   * The chat has no messages yet: the composer takes the start screen's
   * 680px width and input area (Paper "2.2 New chat"; the launcher uses the
   * same values) and, on desktop, no padding: the start block places it
   * (chat-start.tsx). A working chat is 768px wide. On the first send the
   * composer moves to the dock (chat-start-morph.tsx).
   */
  startScreen?: boolean
  /**
   * Left side of the Composer V2 foot row (desktop): the worktree pick of an
   * empty chat or the read-only worktree of a running chat. `null` (a quick
   * chat without a project) leaves only the Connectors button.
   */
  worktree?: React.ReactNode
}

const NO_CONFIG_OPTIONS: SessionConfigOption[] = []

export function ChatInputBar({
  session,
  projectRoot,
  busy,
  disabled: composerDisabled,
  controlsDisabled = composerDisabled,
  imageCapable = false,
  embedCapable = false,
  onSend,
  onSendBlocks,
  onCancel,
  commands,
  configOptions,
  modes,
  onSetConfig,
  onSetMode,
  onSetModel,
  seedText,
  seedNonce,
  selectionContextInsert,
  queue = [],
  permission,
  notice = null,
  noticeShown = notice !== null,
  disabledPlaceholder = 'Composer unavailable',
  onRemoveQueued,
  onSendQueuedNow,
  onMoveQueued,
  onClearQueued,
  isVisible = true,
  onDraftStart,
  startScreen = false,
  worktree = null
}: ChatInputBarProps): React.JSX.Element {
  const accountRestarting = useCodexRestartingStore((state) => state.ids.includes(session.id))
  const disabled = composerDisabled || accountRestarting
  const usableConfigOptions = configOptions.filter(
    (option) => option.type === 'boolean' || (option.options?.length ?? 0) > 0
  )
  const {
    model,
    thoughtLevel,
    modelConfig: allModelConfig,
    rest: genericConfigOptions
  } = partitionConfigOptions(usableConfigOptions)
  const { option: modelOption, source: modelSource } = resolveModelOption(model, session.models)
  const visibleGenericConfigOptions = filterDuplicateModeConfigOptions(genericConfigOptions, modes)
  const {
    fastMode,
    modelConfig,
    rest: nonFastGenericOptions
  } = splitFastModeOption(allModelConfig, visibleGenericConfigOptions)
  const { skills: availableSkills } = useAgentSkills(projectRoot ?? session.cwd)
  const sessionUsage = useSessionUsage(session.id)
  // Compact shows only when the agent lists `/compact`; it sends the command as a prompt.
  const hasCompactCommand = commands.some((command) => command.name === 'compact')
  const onCompact = useMemo(
    () => (hasCompactCommand ? () => onSend('/compact') : undefined),
    [hasCompactCommand, onSend]
  )
  const compactSignals = useMemo(
    () => ({
      connected: session.status === 'active',
      activeTurn: session.activeTurn,
      compaction: session.opencodeNotice?.compaction ?? null
    }),
    [session.status, session.activeTurn, session.opencodeNotice?.compaction]
  )
  // Render gate (multi-project perf): the live subscription stays, but the
  // derived value freezes while the host panel is hidden (the composer only
  // reads `messages` for the context-usage ring's bootstrap filter).
  const messages = useVisibleSnapshot(isVisible, useAcpMessages(session.id))
  const {
    currentAgentConfigId,
    agentName: modeAgentName,
    agentTemplateId,
    agentIcon
  } = useComposerAgent(session)
  const { connectors, host: connectorsHost } = useChatConnectors(session)
  const termulTools = useTermulTools(session.projectId)
  const [value, setValue, draftHydrated] = useComposerDraft({
    projectId: session.projectId,
    sessionId: session.id,
    seedNonce
  })
  const { locked: sending, hold: holdComposer } = useComposerSendLock()
  const reduced = useReducedMotion() ?? false
  const morph = useComposerMorph(startScreen, reduced)
  const isMobileShell = useMobileWebShell()
  const {
    attachments,
    addFiles,
    pickFiles,
    handlePaste,
    removeAttachment,
    clearAttachments,
    canPick,
    canPickImages,
    canDropPaste
  } = useComposerAttachments({ imageCapable, embedCapable, disabled: disabled || sending })
  // Drag feedback for the attachment drop zone (shared with AgentLauncher):
  // depth-counted dragenter/dragleave pairs; the overlay stays local.
  const { dragActive, dropProps } = useAttachmentDropZone({ canDropPaste, addFiles })
  const rootRef = useRef<HTMLDivElement>(null)
  const toolbarMode = useComposerToolbarMode(rootRef)
  const editorRef = useRef<Editor | null>(null)
  const composerInputRef = useRef<HTMLElement | null>(null)
  const { scheduleRestoreCaret } = useComposerCaretRestore(editorRef)
  const slashMenuRef = useRef<SlashMenuHandle>(null)
  const { recents: mentionRecents, pushRecent: pushMentionRecent } = useMentionRecents(
    session.projectId,
    session.cwd
  )
  const mentions = useComposerMentions({
    rootPath: session.cwd,
    projectId: session.projectId,
    currentSessionId: session.id,
    disabled,
    recents: mentionRecents,
    onStageFileRef: (m) => {
      pushMentionRecent(m)
    }
  })

  // Mention-menu wiring (was in `useComposerTextarea`, now inlined — the
  // textarea is gone; the editor's `onCaretChange` feeds `mentions.update` on
  // natural typing, and `handleSelect`/`onMentionSelect` feed it on
  // programmatic splices). `onMentionSelect` restores the caret via the editor.
  // `mentions` is a new object each render (useComposerMentions returns a fresh
  // literal), so effects that depend on it would re-fire every render and loop
  // (the seed effect calls `setValue`, which re-renders, which re-fires the
  // effect). Stabilize the `update` access via a ref so effect deps stay
  // stable without lying to the lint rule.
  const mentionsRef = useRef(mentions)
  mentionsRef.current = mentions
  const updateMentionsStable = useCallback((v: string, c: number) => {
    mentionsRef.current.update(v, c)
  }, [])
  const mentionMenuRef = mentions.menuRef
  const resetMentions = mentions.reset
  const onMentionSelect = useComposerMentionSelect({
    value,
    setValue,
    editorRef,
    mentions,
    scheduleRestoreCaret
  })

  const {
    slashOpen: composerSlashOpen,
    slashSections,
    hasCommandToken,
    skillPathsRef,
    handleSelect,
    onSlashOrMentionKeyDown,
    buildPromptParts,
    conversationContexts
  } = useChatComposer({
    value,
    setValue,
    editorRef,
    slashMenuRef,
    commands,
    // Slash-menu config / mode rows set options on the live agent — hidden
    // while the agent-backed controls are off.
    configOptions: controlsDisabled ? NO_CONFIG_OPTIONS : configOptions,
    modes: controlsDisabled ? null : modes,
    skills: availableSkills,
    disabled,
    onSetConfig,
    onSetMode,
    onSetModel,
    mentions,
    scheduleRestoreCaret
  })
  const slashOpen = composerSlashOpen && !sending
  const mentionMenuOpen = mentions.menuOpen && !disabled && !sending && !slashOpen

  const { handleValueChange, handleComposerPaste } = useComposerDraftStart({
    draftEmpty: value.length === 0 && attachments.length === 0,
    onDraftStart,
    setValue,
    handlePaste
  })

  const canSend = !disabled && !sending && (value.trim().length > 0 || attachments.length > 0)
  const showStop = busy && !canSend

  const submit = useCallback(async () => {
    const hasAttachments = attachments.length > 0
    const hasText = value.trim().length > 0
    if ((!hasText && !hasAttachments) || disabled || sending) return

    await holdComposer(async () => {
      const contexts = conversationContexts()
      const parts = buildPromptParts(contexts ? await contexts : undefined)
      // A restart can begin while contexts resolve. The send callbacks swallow
      // the rejection, so leaving here is what keeps the unsent draft.
      if (useCodexRestartingStore.getState().ids.includes(session.id)) {
        throw new Error('This chat is switching Codex accounts')
      }
      const send = buildComposerSend(parts, attachments)
      if (!send) return
      const sent =
        send.kind === 'text'
          ? onSend(send.text)
          : send.display
            ? onSendBlocks(send.wire, send.display)
            : onSendBlocks(send.wire)
      if (sent === false) return
      // Register app-owned temp files (pasted screenshots) with the session so
      // they are deleted when the session closes; clearAttachments drops state
      // without deleting because the agent reads them by path during the turn.
      registerSessionTempFiles(session.id, appOwnedTempPaths(attachments))
      // A remap to another chat mid-await hydrates that chat's draft; keep it.
      setValue((current) => (current === value ? '' : current))
      skillPathsRef.current = {}
      clearAttachments(attachments)
      resetMentions()
    }).catch((err: unknown) => {
      // Skill path resolution throws a specific user-facing message — keep it.
      const msg = err instanceof Error ? err.message : ''
      toast.error(msg.includes('missing a path') ? msg : 'Could not send your message. Try again.')
    })
  }, [
    value,
    attachments,
    disabled,
    sending,
    clearAttachments,
    onSend,
    onSendBlocks,
    resetMentions,
    session.id,
    buildPromptParts,
    conversationContexts,
    skillPathsRef,
    setValue,
    holdComposer
  ])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean | undefined => {
      // Editor-first keymap: the slash/mention menu keys + Enter→submit /
      // Escape→cancel run BEFORE the editor's own keymap (Backspace-pill
      // removal is editor-owned). `onSlashOrMentionKeyDown` consumes the
      // slash/mention menu arrows/Tab/Enter/Escape when their menus are open;
      // Enter→submit + Ctrl/Cmd+Enter→submit + Escape→cancel are
      // surface-specific (the running chatbox cancels a busy turn on Escape
      // and morphs send/stop). Ctrl/Cmd+Enter is part of the frozen
      // accessibility baseline (parity with `AgentLauncher`).
      if (onSlashOrMentionKeyDown(event) === true) return true
      if (event.key === 'Escape' && busy) {
        event.preventDefault()
        onCancel()
        return true
      }
      // Phone: a soft keyboard has no Shift+Enter, so Enter adds a new line
      // (the editor's own paragraph split) and only the send button sends.
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.isComposing &&
        !event.metaKey &&
        !event.ctrlKey &&
        isMobileShell
      ) {
        return undefined
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        if (showStop) return true
        void submit()
        return true
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (showStop) return true
        void submit()
        return true
      }
      return undefined
    },
    [onSlashOrMentionKeyDown, busy, showStop, onCancel, submit, isMobileShell]
  )

  // Load externally-seeded text (edit a message, pick a starter prompt), then
  // focus and place the cursor at the end. Keyed on a nonce so re-picking the
  // same text still applies. The editor re-parses `value` on the next render
  // (its external-sync effect) — the rAF below lands the caret at the end.
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce is the intended trigger; `mentions` is read via a stable ref (`updateMentionsStable`) so it doesn't re-fire every render (which would loop via setValue).
  useEffect(() => {
    if (seedNonce === undefined) return
    const next = seedText ?? ''
    setValue(next)
    updateMentionsStable(next, next.length)
    // Shared rAF caret-restore (cancels pending frames, no-ops on destroyed
    // editor) — replaces the bare `requestAnimationFrame` that swallowed
    // throws against a destroyed editor.
    scheduleRestoreCaret(next.length)
  }, [seedNonce, scheduleRestoreCaret, updateMentionsStable, setValue])
  // Edit a queued prompt: its text goes back into the composer, after any
  // draft (the draft is kept), and the prompt leaves the queue.
  const editQueued = useCallback(
    (item: QueuedPrompt, text: string) => {
      const next = value.trim() ? `${value.replace(/\s+$/, '')}\n${text}` : text
      setValue(next)
      updateMentionsStable(next, next.length)
      scheduleRestoreCaret(next.length)
      onRemoveQueued?.(item.id)
    },
    [value, setValue, updateMentionsStable, scheduleRestoreCaret, onRemoveQueued]
  )
  useSelectionContextInsertRequest(editorRef, selectionContextInsert, disabled)

  useScrollEditorOnOsk(editorRef, isMobileShell)

  // Story 4 (spec-in-chat-agent-switch): the in-chat agent control joins the
  // right chip cluster (CAP-1). Reads the store itself (session.switching,
  // current-agent resolution, resolved entries); only the busy/disabled
  // gates flow from the composer's props. The launcher places its agent
  // picker left-most in the equivalent cluster — mirror that placement.
  // Narrow-mode row 1 gates on a CHEAP session-derived boolean (the live
  // agent id OR the chat's config id), NOT the picker's presence callback:
  // `agentSwitchChip` renders inside row 1, so keying row 1 on a value only
  // the mounted picker can set true is circular — a mode-less/model-less
  // session would never mount it. The config id covers a launch placeholder
  // before its agent spawns and the reopen window where openHistorySession
  // installs the restored session before its agent reconnects.
  const agentControlMounted = Boolean(session.agentId) || Boolean(currentAgentConfigId)
  const selectorMounted =
    agentControlMounted ||
    Boolean(modelOption) ||
    Boolean(thoughtLevel) ||
    Boolean(fastMode) ||
    modelConfig.length > 0 ||
    nonFastGenericOptions.length > 0 ||
    (sessionUsage != null && Number.isFinite(sessionUsage.size) && sessionUsage.size > 0)
  const modelSelector = selectorMounted ? (
    <AgentModelSelector
      sessionId={session.id}
      busy={busy}
      disabled={controlsDisabled}
      modelOption={modelOption}
      modelSource={modelSource}
      thoughtLevel={thoughtLevel}
      fastMode={fastMode}
      genericOptions={[...modelConfig, ...nonFastGenericOptions]}
      usage={sessionUsage}
      messages={messages}
      agentTemplateId={agentTemplateId}
      agentIcon={agentIcon}
      onSetConfig={onSetConfig}
      onSetModel={onSetModel}
      phone={
        isMobileShell
          ? {
              modes: session.modes,
              onSetMode,
              compact: { onCompact, signals: compactSignals }
            }
          : undefined
      }
    />
  ) : null

  const agentModeChip = (
    <ModeChip
      session={session}
      disabled={controlsDisabled}
      onSelect={onSetMode}
      label="Agent"
      agentName={modeAgentName}
    />
  )
  const composerAddHandle = useMemo(
    () => ({
      canPick,
      canPickImages,
      pickFiles,
      insertTrigger: (trigger: '@' | '/') => insertComposerTrigger(editorRef.current, trigger),
      blurEditor: () => blurComposerEditor(editorRef.current),
      focusEditor: () => editorRef.current?.commands.focus(undefined, { scrollIntoView: false }),
      insertTool: (id: TermulToolId) => insertComposerTool(editorRef.current, id)
    }),
    [canPick, canPickImages, pickFiles]
  )
  const sendButton = (
    <ComposerSendButton
      showStop={showStop}
      canSend={canSend}
      busy={busy}
      reduced={reduced}
      onCancel={onCancel}
      onSubmit={submit}
      size={isMobileShell ? 'phone' : 'default'}
    />
  )
  return (
    <div
      ref={rootRef}
      className={cn(
        isMobileShell ? COMPOSER_PHONE_GUTTER_X : CHAT_GUTTER_X,
        !(startScreen && !isMobileShell) && 'pt-3',
        // Phone: keep the composer clear of the home indicator. While the
        // keyboard is open it covers the inset, so the keyboard height is
        // taken off and the plain 24px floor wins (no double space).
        isMobileShell
          ? 'pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)-var(--termul-keyboard-height,0px)))]'
          : !startScreen && 'pb-6',
        // The slash/mention menu overflows upward into the message list; lift
        // it above the list's jump-to-latest button (z-20).
        (slashOpen || mentionMenuOpen) && 'relative z-30'
      )}
    >
      <div
        className={cn(
          'relative mx-auto w-full',
          startScreen ? CHAT_START_COLUMN_CLASS : 'max-w-3xl'
        )}
      >
        {slashOpen && (
          <SlashCommandMenu
            ref={slashMenuRef}
            sections={slashSections}
            onSelect={handleSelect}
            inputRef={composerInputRef}
          />
        )}
        {mentionMenuOpen && (
          <FileMentionMenu
            ref={mentionMenuRef}
            menu={mentions.view}
            onSelect={onMentionSelect}
            onBack={mentions.back}
            inputRef={composerInputRef}
          />
        )}
        <motion.div data-composer-morph="frame" className="relative z-10 w-full" {...morph.frame}>
          <ComposerBeamShell busy={busy} reduced={reduced} radius={20}>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone for attachments; the file picker button is the accessible path */}
            <div
              data-chat-composer="true"
              // Mobile: a programmatic focus target so focus returns here, not to
              // the editor (and the OSK), after an approval prompt resolves.
              tabIndex={isMobileShell ? -1 : undefined}
              className={cn(
                'relative',
                // Desktop: Composer V2 tray (raised card + foot row). Phone:
                // the compact card (Paper "2.6b"), no tray and no foot row.
                isMobileShell ? COMPOSER_PHONE_CARD_CLASS : COMPOSER_TRAY_CLASS,
                dragActive && 'border-primary/70',
                isMobileShell && 'outline-none'
              )}
              onDragEnter={dropProps.onDragEnter}
              onDragLeave={dropProps.onDragLeave}
              onDragOver={dropProps.onDragOver}
              onDrop={dropProps.onDrop}
            >
              {dragActive && canDropPaste && <ComposerDropOverlay className="rounded-[20px]" />}
              <ComposerRaised raised={!isMobileShell}>
                {notice}
                {queue.length > 0 && onRemoveQueued && onSendQueuedNow && (
                  <PromptQueuePanel
                    items={queue}
                    onRemove={onRemoveQueued}
                    onSendNow={onSendQueuedNow}
                    onMove={onMoveQueued}
                    onClear={onClearQueued}
                    onEdit={disabled || sending || !draftHydrated ? undefined : editQueued}
                    defaultOpen={!isMobileShell}
                  />
                )}
                {permission && <PermissionPrompt permission={permission} isVisible={isVisible} />}
                {!noticeShown && !controlsDisabled && (
                  <>
                    <ClaudeLimitWarning sessionId={session.id} />
                    <CodexLimitWarning sessionId={session.id} />
                  </>
                )}
                <AttachmentPreviewGroup
                  attachments={attachments}
                  onRemove={removeAttachment}
                  removeDisabled={disabled || sending}
                />
                {/* Pointer-only focus aid for the padding; the editor is the accessible target. */}
                <motion.div
                  data-composer-row
                  className={cn(
                    'flex items-start',
                    isMobileShell
                      ? COMPOSER_PHONE_INPUT_ROW_CLASS
                      : startScreen
                        ? CHAT_START_INPUT_ROW_CLASS
                        : 'gap-1 pb-2.5 pl-[18px] pr-2.5 pt-4'
                  )}
                  onMouseDown={(event) => focusComposerFromRowPress(event, editorRef.current)}
                  {...morph.content}
                >
                  {/* Tiptap rich-text editor — the skill "pill" is a real inline
                  DOM node (a Tiptap `NodeView`), so the caret sits flush
                  against the pill's right edge by construction. No transparent
                  textarea + mirror overlay, no canvas padding, no overlay
                  scroll-sync. The `value` string (sentinel-token format) is
                  the shared model the wire builder + draft persistence +
                  timeline consume (byte-identical wire payload). */}
                  <SkillFilesProvider projectRoot={projectRoot ?? session.cwd}>
                    <ChatComposerEditor
                      className="min-w-0 flex-1"
                      value={value}
                      onValueChange={handleValueChange}
                      onCaretChange={mentions.update}
                      onBeforeEditorKeyDown={handleKeyDown}
                      enterKeyHint={isMobileShell ? 'enter' : 'send'}
                      onPasteAttachments={handleComposerPaste}
                      getSkillPaths={() => skillPathsRef.current}
                      editorRef={editorRef}
                      inputRef={composerInputRef}
                      disabled={disabled || sending}
                      // Working chat: 1 line (16px × 1.625) up to 3 lines, then scroll.
                      minHeight={
                        isMobileShell
                          ? COMPOSER_PHONE_INPUT_MIN_HEIGHT
                          : startScreen
                            ? CHAT_START_INPUT_MIN_HEIGHT
                            : 26
                      }
                      maxHeight={
                        isMobileShell
                          ? COMPOSER_PHONE_INPUT_MAX_HEIGHT
                          : startScreen
                            ? CHAT_START_INPUT_MAX_HEIGHT
                            : 78
                      }
                      placeholder={
                        disabled
                          ? disabledPlaceholder
                          : hasCommandToken
                            ? 'Add a message (optional)…'
                            : isMobileShell
                              ? COMPOSER_PHONE_PLACEHOLDER
                              : 'Ask anything… (/ for commands, @ for files and chats)'
                      }
                    />
                  </SkillFilesProvider>
                  {/* Context usage ring: top right, centered on the first line.
                  The mobile row carries the ring in its toolbar instead. */}
                  {!isMobileShell && (
                    <ContextUsageIndicator
                      usage={sessionUsage}
                      messages={messages}
                      className="-mr-2 -my-[3px]"
                      onCompact={onCompact}
                      compactSignals={compactSignals}
                    />
                  )}
                </motion.div>
                {/* The toolbar's two groups move on their own (`position`), so the
                  right group keeps to the card's right edge while it grows. */}
                <div
                  className={cn(
                    'flex items-center justify-between',
                    // Phone (Paper "2.6b"): 4px left, 6px right, 6px bottom.
                    isMobileShell ? 'pb-1.5 pl-1 pr-1.5' : 'gap-3 px-2 pb-2'
                  )}
                  data-composer-toolbar={toolbarMode}
                >
                  {isMobileShell ? (
                    <div
                      className="flex min-w-0 flex-1 items-center gap-1"
                      data-composer-toolbar-row="mobile"
                    >
                      <ComposerAddSheet
                        handle={composerAddHandle}
                        disabled={disabled || sending}
                        termulTools={termulTools}
                        connectorsHost={connectorsHost}
                        {...connectors}
                      />
                      {modelSelector}
                      <div className="flex-1" />
                      <ContextUsageIndicator
                        usage={sessionUsage}
                        messages={messages}
                        onCompact={onCompact}
                        compactSignals={compactSignals}
                      />
                      {sendButton}
                    </div>
                  ) : (
                    <>
                      <motion.div className="flex min-w-0 items-center gap-1.5" {...morph.content}>
                        {/* While the composer is inert its rows are disabled, not
                    hidden. Composer V2: the mode chip sits right of `+`. */}
                        <ComposerAddMenu
                          handle={composerAddHandle}
                          disabled={disabled || sending}
                          termulTools={termulTools}
                        />
                        {agentModeChip}
                        <ClaudeAccountChip sessionId={session.id} />
                        <CodexAccountChip sessionId={session.id} />
                      </motion.div>
                      <motion.div
                        {...morph.content}
                        className={cn(
                          // #859: no wrap in narrow mode — the chip rows scroll
                          // horizontally instead of stacking to 3 lines.
                          'flex min-w-0 items-center justify-end gap-1',
                          toolbarMode === 'narrow' && 'flex-1'
                        )}
                      >
                        {/* #859: a narrow toolbar scrolls the model chip
                          horizontally instead of wrapping it. */}
                        {selectorMounted ? (
                          <div
                            className={cn(
                              'flex min-w-0 items-center justify-end',
                              toolbarMode === 'narrow'
                                ? 'max-w-full flex-1 gap-2 overflow-x-auto scrollbar-hide'
                                : 'flex-wrap gap-2.5'
                            )}
                            data-composer-toolbar-row={toolbarMode === 'narrow' ? '1' : 'single'}
                          >
                            {modelSelector}
                          </div>
                        ) : null}
                        {sendButton}
                      </motion.div>
                    </>
                  )}
                </div>
              </ComposerRaised>
              {isMobileShell ? null : (
                <ComposerFootRow
                  start={worktree}
                  end={
                    <ComposerConnectorsButton
                      connectors={connectors}
                      connectorsHost={connectorsHost}
                      onClosed={composerAddHandle.focusEditor}
                    />
                  }
                />
              )}
            </div>
          </ComposerBeamShell>
        </motion.div>
        {/* Phone, new chat only (Paper "2.6g"): the worktree strip under the
            compact composer. A running chat shows its worktree in the header. */}
        {isMobileShell && startScreen && worktree ? (
          <div data-composer-phone-strip="true">{worktree}</div>
        ) : null}
      </div>
    </div>
  )
}

/** Shown over the composer card while files are dragged over it. */
function ComposerDropOverlay({ className }: { className: string }): React.JSX.Element {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-primary/60 bg-background/80 text-sm font-medium text-foreground backdrop-blur-sm',
        className
      )}
    >
      <span className="flex items-center gap-2">
        <Paperclip size={16} /> Drop files to attach
      </span>
    </div>
  )
}
