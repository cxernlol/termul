import { type ReactNode, useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Camera, FileText, ImageIcon, Plus, Server, Wrench } from '@/components/icons'
import {
  MobileSheetContent,
  SheetGroup,
  SheetIconWell,
  SheetRow,
  useSheetStack
} from '@/components/ui/mobile-sheet'
import { Sheet, SheetTrigger } from '@/components/ui/sheet'
import type { TermulToolId } from '@/lib/composer/termul-tools'
import type { BrowserPickOptions } from '@/lib/composer-attachments-io'
import { logFrontendError } from '@/lib/log-api'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'
import type { McpServerListProps } from '../McpServerList'
import { TERMUL_TOOL_ICONS } from '../ToolChip'
import { ConnectorsSheetView, connectorsNeedingAttention } from './ConnectorsSheetView'
import { type ConnectorsHost, connectorsMenuModel } from './connectors-menu-model'
import type { TermulToolRow } from './use-termul-tools'

/**
 * What the + sheet and the desktop + menu can ask of the composer. The host
 * (`ChatInputBar`, `AgentLauncher`) owns the attachments hook and the editor,
 * so it hands these capabilities down instead of the menus reaching into either.
 */
export interface ComposerAddHandle {
  /** Whether attaching is allowed (false while the session is closed). */
  canPick: boolean
  canPickImages: boolean
  /** Open the file picker. Must be called synchronously from the tap handler. */
  pickFiles: (options?: BrowserPickOptions) => Promise<void>
  /** Append `@` / `/` to the draft; false when the editor is unavailable. */
  insertTrigger: (trigger: '@' | '/') => boolean
  /** Blur the editor synchronously (dismisses the on-screen keyboard). */
  blurEditor: () => void
  /** Return focus to the editor (the desktop menu's close). */
  focusEditor: () => void
  /** Insert a Troupe tool pill at the caret; false when the editor is unavailable. */
  insertTool: (id: TermulToolId) => boolean
}

interface ComposerAddSheetProps extends McpServerListProps {
  handle: ComposerAddHandle
  /** Session closed: the editor is unavailable. */
  disabled: boolean
  termulTools: TermulToolRow[]
  connectorsHost: ConnectorsHost
}

const LOG_SOURCE = 'composer-add-sheet'

type AddSheetView = 'connectors' | 'tools'

const SHEET_TITLE: Record<AddSheetView, string> = {
  tools: 'Troupe tools',
  connectors: 'Connectors'
}

/** Attach tiles (Paper "2.6d"): grouped-card surface, an 18px icon over a 15px label. */
const TILE =
  'flex h-[76px] flex-col items-center justify-center gap-2 rounded-xl bg-muted text-[15px] leading-5 text-foreground shadow-control transition-colors duration-150 ease-out enabled:active:bg-[color-mix(in_oklab,oklch(var(--muted)),oklch(var(--foreground))_10%)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:text-disabled-foreground'

function AttachTile({
  icon,
  label,
  disabled,
  onClick
}: {
  icon: ReactNode
  label: string
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button type="button" className={TILE} disabled={disabled} onClick={onClick}>
      <SheetIconWell>{icon}</SheetIconWell>
      {label}
    </button>
  )
}

/** The Connectors row subtitle (Paper "2.6d"): "6 of 11 on · 2 need attention". */
function connectorsSummary(
  servers: McpServerListProps['servers'],
  probeStatus: McpServerListProps['probeStatus']
): ReactNode {
  if (servers.length === 0) return 'None added'
  const { onCount } = connectorsMenuModel(servers, undefined, 'launcher')
  const attention = connectorsNeedingAttention(servers, probeStatus)
  return (
    <>
      {`${onCount} of ${servers.length} on`}
      {attention > 0 ? (
        <>
          {' · '}
          <span className="text-destructive">
            {attention === 1 ? '1 needs attention' : `${attention} need attention`}
          </span>
        </>
      ) : null}
    </>
  )
}

export function ComposerAddSheet({
  handle,
  disabled,
  termulTools,
  connectorsHost,
  ...mcp
}: ComposerAddSheetProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // Set while a Mention/Commands tap hands focus to the editor, so the sheet's
  // own focus restore (back to +) does not steal it again.
  const keepEditorFocusRef = useRef(false)
  const close = useCallback(() => setOpen(false), [])
  useOverlayRegistration('composer-add-sheet', open, close)
  const nav = useSheetStack<AddSheetView>('composer-add-sheet', open, (view) => view)
  const onOpenChange = useCallback((next: boolean) => {
    // A fresh open never inherits a stale "keep focus in the editor" flag, so a
    // later Escape, ✕ or system-back dismissal always restores focus to +.
    if (next) keepEditorFocusRef.current = false
    setOpen(next)
  }, [])

  // Radix's FocusScope pulls focus back into the sheet while it is open, so
  // focusing the editor first would bounce straight back. Close synchronously to
  // release the trap, then focus the editor in the same tap so iOS raises the
  // keyboard.
  //
  // A closed sheet stays mounted until its exit animation ends, so a second tap
  // (a double-tap) can still reach these rows: `open` is already false then, and
  // the guards below make that tap a no-op instead of a second insert or picker.
  const intoEditor = (insert: () => boolean): void => {
    if (!open) return
    keepEditorFocusRef.current = true
    flushSync(() => setOpen(false))
    if (!insert()) keepEditorFocusRef.current = false
  }
  const onTrigger = (trigger: '@' | '/'): void => intoEditor(() => handle.insertTrigger(trigger))

  // The picker has to open from this tap (browsers require user activation), so
  // call it before closing the sheet. Focus then returns to +.
  const onAttach = (options?: BrowserPickOptions): void => {
    if (!open) return
    Promise.resolve(handle.pickFiles(options)).catch((err: unknown) => {
      void logFrontendError({
        level: 'warn',
        source: LOG_SOURCE,
        message: `Attach files failed: ${err instanceof Error ? err.name : 'unknown error'}`
      })
    })
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Add to chat"
          // Composer V2 phone (Paper "2.6b"): a 36px ghost button, 20px icon,
          // 44px hit area.
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors duration-150 ease-out after:absolute after:-inset-1 after:content-[''] hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring active:bg-foreground/[0.06]"
          onClick={handle.blurEditor}
        >
          <Plus size={20} />
        </button>
      </SheetTrigger>
      <MobileSheetContent
        title={nav.top ? SHEET_TITLE[nav.top] : 'Add to chat'}
        nav={nav}
        aria-describedby={undefined}
        onEscapeKeyDown={nav.onEscapeKeyDown}
        onCloseAutoFocus={(event) => {
          if (!keepEditorFocusRef.current) return
          event.preventDefault()
          keepEditorFocusRef.current = false
        }}
      >
        {nav.top === 'tools' ? (
          <SheetGroup>
            {termulTools.map(({ tool, state }) => {
              const Icon = TERMUL_TOOL_ICONS[tool.id]
              return (
                <SheetRow
                  key={tool.id}
                  icon={
                    <SheetIconWell>
                      <Icon size={16} />
                    </SheetIconWell>
                  }
                  title={tool.label}
                  subtitle={state === 'closed' ? `${tool.description} · Closed` : tool.description}
                  disabled={disabled}
                  onSelect={() => intoEditor(() => handle.insertTool(tool.id))}
                />
              )
            })}
          </SheetGroup>
        ) : nav.top === 'connectors' ? (
          <ConnectorsSheetView {...mcp} host={connectorsHost} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <AttachTile
                icon={<Camera size={18} />}
                label="Camera"
                disabled={!handle.canPickImages}
                onClick={() => onAttach({ accept: 'image/*', capture: 'environment' })}
              />
              <AttachTile
                icon={<ImageIcon size={18} />}
                label="Photos"
                disabled={!handle.canPickImages}
                onClick={() => onAttach({ accept: 'image/*' })}
              />
              <AttachTile
                icon={<FileText size={18} />}
                label="Files"
                disabled={!handle.canPick}
                onClick={() => onAttach()}
              />
            </div>
            <SheetGroup>
              <SheetRow
                icon={<SheetIconWell>@</SheetIconWell>}
                title="Mention a file or conversation"
                subtitle="Attach project files or another chat as context"
                disabled={disabled}
                onSelect={() => onTrigger('@')}
              />
              <SheetRow
                icon={<SheetIconWell>/</SheetIconWell>}
                title="Commands"
                subtitle="Agent commands and skills"
                disabled={disabled}
                onSelect={() => onTrigger('/')}
              />
            </SheetGroup>
            <SheetGroup>
              <SheetRow
                icon={
                  <SheetIconWell>
                    <Wrench size={16} />
                  </SheetIconWell>
                }
                title="Troupe tools"
                subtitle="Browser, canvas and automations"
                accessory="chevron"
                subview="tools"
                disabled={disabled}
                onSelect={() => nav.push('tools')}
              />
              <SheetRow
                icon={
                  <SheetIconWell>
                    <Server size={16} />
                  </SheetIconWell>
                }
                title="Connectors"
                subtitle={connectorsSummary(mcp.servers, mcp.probeStatus)}
                accessory="chevron"
                subview="connectors"
                onSelect={() => nav.push('connectors')}
              />
            </SheetGroup>
          </>
        )}
      </MobileSheetContent>
    </Sheet>
  )
}
