import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Edit, MoreHorizontal, RotateCcw, Type } from '@/components/icons'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { IconActionButton } from '@/components/ui/icon-action-button'
import { IconSwap } from '@/components/ui/icon-swap'
import {
  MobileSheetContent,
  SheetGroup,
  SheetIconWell,
  SheetRow
} from '@/components/ui/mobile-sheet'
import { Sheet } from '@/components/ui/sheet'
import { copyText } from '@/lib/copy-text'
import { logFrontendError } from '@/lib/log-api'
import { cn } from '@/lib/utils'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'

/**
 * How a message's actions are exposed.
 * - `desktop`: today's behaviour (the row, hover-revealed on fine pointers).
 * - `focus-reveal`: mobile shell. The row is hidden at rest and shown on
 *   keyboard focus; a long-press / context-menu key opens `MessageActionsContextMenu`.
 * - `visible-fallback`: mobile shell where long-press cannot work; the row
 *   renders as it does on desktop/touch today so the actions stay reachable.
 */
export type MessageActionsMode = 'desktop' | 'focus-reveal' | 'visible-fallback'

/**
 * Feature-detect the one capability Radix's long-press depends on and that we
 * can observe: Pointer Events. Without it the 700ms touch timer never arms.
 */
export function supportsLongPressMenu(): boolean {
  return typeof window !== 'undefined' && typeof window.PointerEvent === 'function'
}

/** Pick the actions mode from the shell and the long-press capability. */
export function resolveMessageActionsMode(
  isMobileShell: boolean,
  longPressSupported: boolean
): MessageActionsMode {
  if (!isMobileShell) return 'desktop'
  return longPressSupported ? 'focus-reveal' : 'visible-fallback'
}

let longPressFallbackLogged = false

/**
 * Log once per page load that the mobile shell fell back to the always-visible
 * `MessageActions` row. Never carries message text.
 */
export function logLongPressFallbackOnce(): void {
  if (longPressFallbackLogged) return
  longPressFallbackLogged = true
  void logFrontendError({
    level: 'info',
    source: 'MessageActions.fallback',
    message: 'long-press unsupported, MessageActions shown'
  })
}

/** Test-only: re-arm the once-per-page-load fallback log. */
export function resetLongPressFallbackLogForTests(): void {
  longPressFallbackLogged = false
}

/**
 * Clipboard copy shared by the action row and the context menu.
 *
 * Empty text is a silent no-op (resolves `true`: there was nothing to fail).
 * A clipboard failure shows the "Failed to copy" toast and resolves `false`.
 * `copied` is true for 1.5s after a successful copy.
 */
export function useMessageCopy(text: string): {
  copied: boolean
  copy: () => Promise<boolean>
} {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (): Promise<boolean> => {
    if (!text) return true
    const ok = await copyText(text)
    if (!ok) {
      toast.error('Failed to copy')
      return false
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    return true
  }, [text])

  return { copied, copy }
}

interface MessageActionsProps {
  /** Plain text to place on the clipboard for the copy action. */
  text: string
  align: 'start' | 'end'
  /** Keep actions visible without hover (e.g. last message in thread). */
  pinned?: boolean
  /**
   * `hover` (default): today's behaviour. `focus`: hidden at rest on touch and
   * shown while the message or the row has keyboard focus (ignores `pinned`).
   */
  reveal?: 'hover' | 'focus'
  /** Edit the message (e.g. seed the composer with this text). */
  onEdit?: () => void
  /** Re-run the turn (regenerate the response). */
  onRetry?: () => void
  /**
   * Phone shell: a trailing ⋯ that opens the message's actions sheet
   * (Paper "10.1"). Omitted on desktop.
   */
  onMore?: () => void
  /**
   * Phone shell: on a coarse pointer each action is a 44px slot with an 18px
   * glyph, flush with the text edge (Paper "10.1").
   */
  touchSlots?: boolean
  className?: string
}

/** Paper "10.1": 44px slots with 18px glyphs on a coarse pointer, no gap. */
const TOUCH_SLOT_CLASS =
  'pointer-coarse:size-11 pointer-coarse:after:inset-0 pointer-coarse:[&_svg]:size-[18px]'

/**
 * Toolbar for a chat message — copy, plus optional edit (user turns) and
 * retry (assistant turns). Fine-pointer: hover-revealed (pinned stays visible).
 * Coarse pointer / touch: always soft-visible so actions stay discoverable,
 * unless `reveal="focus"` (mobile shell), where the row stays mounted but is
 * transparent and inert at rest and appears on keyboard focus.
 * No action pill: icons flush with prose left edge (assistant) / bubble (user).
 */
export function MessageActions({
  text,
  align,
  pinned = false,
  reveal = 'hover',
  onEdit,
  onRetry,
  onMore,
  touchSlots = false,
  className
}: MessageActionsProps): React.JSX.Element {
  const { copied, copy } = useMessageCopy(text)
  const slot = touchSlots ? TOUCH_SLOT_CLASS : undefined

  return (
    <div
      className={cn(
        // Compact icon row; the gap keeps the ~44px pseudo-element hit
        // areas (#859) close to tiling without dead space.
        'flex items-center gap-2.5 transition-opacity duration-150 focus-within:opacity-100',
        // 44px slots tile with no gap; the first glyph lines up with the text.
        touchSlots && 'pointer-coarse:gap-0',
        reveal === 'focus'
          ? // Hidden and inert at rest so a tap cannot land on an invisible
            // action. Keyboard focus (message or inside the row) reveals it.
            'pointer-events-none opacity-0 focus-within:pointer-events-auto group-focus-visible/message:pointer-events-auto group-focus-visible/message:opacity-100 pointer-fine:group-hover/message:pointer-events-auto pointer-fine:group-hover/message:opacity-100'
          : // Touch / coarse: always visible. Fine pointer: hover-reveal unless pinned.
            pinned
            ? 'opacity-100'
            : 'opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/message:opacity-100',
        align === 'start' && (touchSlots ? '-ml-1 pointer-coarse:-ml-[13px]' : '-ml-1'),
        align === 'end' &&
          (touchSlots ? 'justify-end -mr-1 pointer-coarse:-mr-[13px]' : 'justify-end -mr-1'),
        className
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2.5',
          touchSlots && 'pointer-coarse:gap-0',
          align === 'end' && 'flex-row-reverse'
        )}
      >
        <IconActionButton
          size="sm"
          label={copied ? 'Copied' : 'Copy'}
          onClick={() => void copy()}
          className={cn('rounded-md hover:bg-secondary/60 transition-colors duration-150', slot)}
        >
          <IconSwap iconKey={copied}>
            {copied ? <Check className="text-success" /> : <Copy />}
          </IconSwap>
        </IconActionButton>
        {onEdit && (
          <IconActionButton
            size="sm"
            label="Edit"
            onClick={onEdit}
            className={cn('rounded-md hover:bg-secondary/60 transition-colors duration-150', slot)}
          >
            <Edit />
          </IconActionButton>
        )}
        {onRetry && (
          <IconActionButton
            size="sm"
            label="Retry"
            onClick={onRetry}
            className={cn('rounded-md hover:bg-secondary/60 transition-colors duration-150', slot)}
          >
            <RotateCcw />
          </IconActionButton>
        )}
        {onMore && (
          <IconActionButton
            size="sm"
            label="More actions"
            onClick={onMore}
            className={cn('rounded-md hover:bg-secondary/60 transition-colors duration-150', slot)}
          >
            <MoreHorizontal />
          </IconActionButton>
        )}
      </div>
    </div>
  )
}

interface MessageActionsContextMenuProps {
  /** Overlay-stack id, unique per message, so system back closes the menu. */
  overlayId: string
  /** Copy text — the same string the `MessageActions` row copies. */
  text: string
  /** Present only when the row shows Edit; receives no arguments (the row's callback). */
  onEdit?: () => void
  /** Present only when the row shows Retry. */
  onRetry?: () => void
  /** "Select text" row (Paper "10.2"): start select mode on this message. */
  onSelectText?: () => void
  /** Sheet title: "Reply" for an agent message, "Message" for a user message. */
  title?: string
  /** Controlled open state, so the row's ⋯ can open the same sheet. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Keep the wrapper mounted but inert: no sheet, no long-press, and the native
   * / app-level context menu keeps working. Lets a message gain or lose actions
   * (its stream settles, the turn tail moves) without remounting its subtree.
   */
  disabled?: boolean
  /** The message element. It becomes the long-press trigger (`asChild`). */
  children: React.ReactElement
}

/** How long the Copy row shows its tick before the sheet closes. */
export const SHEET_COPY_TICK_MS = 400

/**
 * Props that strip everything Radix's trigger adds to its child when disabled
 * (`data-state`, `data-disabled`, `-webkit-touch-callout: none`), so an inert
 * wrapper leaves the message DOM as it was without one.
 */
const INERT_TRIGGER_PROPS = {
  'data-state': undefined,
  'data-disabled': undefined,
  style: { WebkitTouchCallout: undefined }
}

/**
 * Long-press / right-click / context-menu-key actions for a message on the
 * mobile shell. Paper "10.2": a bottom sheet (the Composer V2 sheet: grab
 * handle, drag to close) with Copy, Select text, then Edit or Retry. Radix's
 * `ContextMenu` stays only as the long-press detector; it never renders a menu.
 *
 * Accepted trade-offs of making the whole message the trigger:
 * - No native long-press text selection on touch until the user picks
 *   "Select text", which turns the trigger off for that message.
 * - Radix sets `-webkit-touch-callout: none` on the trigger, so the iOS link
 *   preview and "save image" long-press callouts are unavailable inside a
 *   message that has actions.
 * - The trigger also owns right-click. The mobile shell is chosen by viewport
 *   size (narrow, or a short landscape viewport; never under Tauri), not
 *   pointer type, so with a mouse in such a window a right-click on such a
 *   message opens this menu instead of the app-level Copy / Cut / Paste /
 *   Select All menu.
 *
 * Pointer and contextmenu events that reach the trigger from a React portal
 * (the link-safety dialog, the image lightbox, a fullscreen table) are ignored:
 * they bubble through React but are not on the message, so they never open the
 * menu. Radix's trigger still cancels the default of a right-click from such a
 * source, so neither the native nor the app-level menu shows inside the portal.
 *
 * The sheet is registered with the overlay stack, so system back closes it.
 * Focus returns to the previously focused element on close (Radix default),
 * except after Edit, where the composer seed owns focus.
 */
export function MessageActionsContextMenu({
  overlayId,
  text,
  onEdit,
  onRetry,
  onSelectText,
  title = 'Message',
  open: openProp,
  onOpenChange,
  disabled = false,
  children
}: MessageActionsContextMenuProps): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const controlled = openProp !== undefined
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next)
      onOpenChangeRef.current?.(next)
    },
    [controlled]
  )
  const { copied, copy } = useMessageCopy(text)
  const closedByEditRef = useRef(false)
  const fromPortalRef = useRef(false)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const close = useCallback(() => setOpen(false), [setOpen])
  useOverlayRegistration(overlayId, open, close)

  // The sheet has no Radix trigger, so remember what had focus when it opened
  // (the message, or the row's ⋯) and give focus back to it on close. Read
  // during the render that opens it, before the sheet moves focus inside.
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  if (open && !wasOpenRef.current && typeof document !== 'undefined') {
    const active = document.activeElement
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null
  }
  wasOpenRef.current = open

  useEffect(
    () => () => {
      if (tickTimer.current) clearTimeout(tickTimer.current)
    },
    []
  )

  // The message stopped owning actions while its sheet was open: close it.
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    if (disabled && openRef.current) setOpen(false)
  }, [disabled, setOpen])

  // Radix arms its long-press timer from the trigger's `pointerdown`, which also
  // receives portaled descendants' events. Record where the latest one came
  // from and refuse to open for a portaled source.
  const markEventOrigin = useCallback((event: React.SyntheticEvent<HTMLElement>) => {
    fromPortalRef.current = !event.currentTarget.contains(event.target as Node)
  }, [])

  // Radix's trigger asks to open on a long-press, right-click or the
  // context-menu key; the menu itself never mounts (`open` stays false).
  const handleTriggerOpen = useCallback(
    (next: boolean) => {
      if (!next) return
      if (fromPortalRef.current || disabledRef.current) return
      // A stale flag (Edit that never reached `onCloseAutoFocus`) must not
      // suppress the focus return of a later close.
      closedByEditRef.current = false
      setOpen(true)
    },
    [setOpen]
  )

  const handleCopy = useCallback(async () => {
    const ok = await copy()
    if (ok) {
      // The row's tick shows first, then the sheet closes (no toast).
      if (tickTimer.current) clearTimeout(tickTimer.current)
      tickTimer.current = setTimeout(close, SHEET_COPY_TICK_MS)
      return
    }
    close()
    // The toast is shown by useMessageCopy. Log without the message text.
    void logFrontendError({
      level: 'warn',
      source: 'MessageActions.contextMenu',
      message: 'Failed to copy message text from the actions menu'
    })
  }, [copy, close])

  return (
    <>
      <ContextMenu open={false} onOpenChange={handleTriggerOpen}>
        <ContextMenuTrigger
          asChild
          disabled={disabled}
          onPointerDownCapture={markEventOrigin}
          onContextMenuCapture={markEventOrigin}
          {...(disabled ? INERT_TRIGGER_PROPS : undefined)}
        >
          {children}
        </ContextMenuTrigger>
      </ContextMenu>
      <Sheet open={open} onOpenChange={setOpen}>
        <MobileSheetContent
          title={title}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = returnFocusRef.current
            returnFocusRef.current = null
            // After Edit the composer seed focuses the editor; a focus return
            // would steal it back.
            if (closedByEditRef.current) {
              closedByEditRef.current = false
              return
            }
            if (target?.isConnected) target.focus()
          }}
        >
          <SheetGroup>
            <SheetRow
              title={copied ? 'Copied' : 'Copy'}
              icon={
                <SheetIconWell>
                  <IconSwap iconKey={copied}>
                    {copied ? <Check className="text-success" /> : <Copy />}
                  </IconSwap>
                </SheetIconWell>
              }
              onSelect={() => void handleCopy()}
            />
            {onSelectText && (
              <SheetRow
                title="Select text"
                icon={
                  <SheetIconWell>
                    <Type />
                  </SheetIconWell>
                }
                onSelect={() => {
                  close()
                  onSelectText()
                }}
              />
            )}
            {onEdit && (
              <SheetRow
                title="Edit"
                icon={
                  <SheetIconWell>
                    <Edit />
                  </SheetIconWell>
                }
                onSelect={() => {
                  closedByEditRef.current = true
                  close()
                  onEdit()
                }}
              />
            )}
            {onRetry && (
              <SheetRow
                title="Retry"
                icon={
                  <SheetIconWell>
                    <RotateCcw />
                  </SheetIconWell>
                }
                onSelect={() => {
                  close()
                  onRetry()
                }}
              />
            )}
          </SheetGroup>
        </MobileSheetContent>
      </Sheet>
    </>
  )
}
