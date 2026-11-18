import { useEffect, useRef, useState } from 'react'
import { Edit, History, RotateCcw, X } from '@/components/icons'
import { Input } from '@/components/ui/input'
import { MobileSheetContent } from '@/components/ui/mobile-sheet'
import { Sheet, SheetDescription } from '@/components/ui/sheet'
import {
  focusFirstSheetAction,
  SHEET_BODY_CLASS_NAME,
  SHEET_DESTRUCTIVE_DIVIDER_CLASS_NAME,
  SHEET_DESTRUCTIVE_ROW_CLASS_NAME,
  SHEET_ROW_CLASS_NAME,
  SHEET_SUBTITLE_CLASS_NAME,
  type ShellNavigationActions,
  visibleNavigationRows
} from './mobile-sheet-rows'

export const MOBILE_TERMINAL_ACTIONS_SHEET_ID = 'mobile-terminal-actions-sheet'

// No New terminal row: in a terminal the header ✎ already is New terminal.
interface MobileTerminalActionsSheetProps extends Omit<ShellNavigationActions, 'onNewTerminal'> {
  open: boolean
  onOpenChange: (open: boolean) => void
  terminalId: string
  tabId: string
  /** The terminal name, shown as the sheet title and the rename starting value. */
  name: string
  /** Exit code of the last command; the description shows only when it is a number. */
  lastExitCode?: number | null
  /** Returns focus per the shell's registry (`sheetCloseAutoFocus`, `lib/sheet-focus-return.ts`). */
  onCloseAutoFocus: (event: Event) => void
  /** Called when a row was chosen: the shell sets the destination title as the focus target. */
  onItemChosen: () => void
  /** Each row renders only when its callback is given. */
  onRenameTerminal?: (terminalId: string, name: string) => void
  onRestartTerminal?: (terminalId: string) => void
  onOpenCommandHistory?: () => void
  onCloseTerminal?: (terminalId: string, tabId: string) => void
}

/**
 * Terminal ⋯ bottom sheet: rename (the inline input moved here), restart,
 * command history, the shell navigation rows the header ⋯ sheet offers (Git
 * changes, Files, Command palette, Project settings) and close. The drawer
 * keeps its own rename pencil. Rows use the `MobileFileExplorer` action-row
 * pattern at 44px.
 */
export function MobileTerminalActionsSheet({
  open,
  onOpenChange,
  terminalId,
  tabId,
  name,
  lastExitCode,
  onCloseAutoFocus,
  onItemChosen,
  onRenameTerminal,
  onRestartTerminal,
  onOpenCommandHistory,
  onCloseTerminal,
  ...navigation
}: MobileTerminalActionsSheetProps): React.JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  // Set once an edit is committed or cancelled, so the blur that follows (the
  // sheet closing, or Escape) cannot commit a second time or revive a cancel.
  const settledRef = useRef(true)

  useEffect(() => {
    if (!open) setRenaming(false)
  }, [open])

  const startRename = (): void => {
    settledRef.current = false
    setDraft(name)
    setRenaming(true)
  }

  /** Ends the edit; returns the new name when there is one to apply. */
  const settleRename = (): string | null => {
    if (settledRef.current) return null
    settledRef.current = true
    setRenaming(false)
    const next = draft.trim()
    return next.length > 0 ? next : null
  }

  const commitRename = (): boolean => {
    const next = settleRename()
    if (next === null || !onRenameTerminal) return false
    onRenameTerminal(terminalId, next)
    return true
  }

  const choose = (run: () => void) => (): void => {
    onItemChosen()
    onOpenChange(false)
    run()
  }

  const hasExitCode = typeof lastExitCode === 'number'
  // The same rows, gates and order as the header ⋯ sheet; each renders only
  // when its callback is given.
  const navigationRows = visibleNavigationRows(navigation)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <MobileSheetContent
        id={MOBILE_TERMINAL_ACTIONS_SHEET_ID}
        title={name}
        // No description to point at before a command has exited.
        {...(hasExitCode ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={focusFirstSheetAction}
        onCloseAutoFocus={onCloseAutoFocus}
        bodyClassName={SHEET_BODY_CLASS_NAME}
      >
        {hasExitCode && (
          <SheetDescription className={`${SHEET_SUBTITLE_CLASS_NAME} tabular-nums`}>
            Last exit code {lastExitCode}
          </SheetDescription>
        )}
        {onRenameTerminal &&
          (renaming ? (
            // No vertical padding: the edit row is exactly as tall as the
            // action rows, so ending the edit (a tap on another row blurs the
            // input) does not shift the rows below out from under the finger.
            <div className="px-2">
              <Input
                autoFocus
                value={draft}
                aria-label={`Rename ${name}`}
                className="min-h-11 text-base md:text-base"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Enter that confirms an IME or predictive-text composition
                    // is not a commit. Safari fires compositionend before the
                    // keydown, so `isComposing` is already false there and only
                    // the legacy keyCode 229 marks it.
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return
                    // Blank keeps the sheet open; a real rename closes it.
                    if (commitRename()) onOpenChange(false)
                  } else if (event.key === 'Escape') {
                    // Radix closes the sheet on Escape; just drop the edit.
                    settledRef.current = true
                    setRenaming(false)
                  }
                }}
                onBlur={() => {
                  commitRename()
                }}
              />
            </div>
          ) : (
            <button type="button" className={SHEET_ROW_CLASS_NAME} onClick={startRename}>
              <Edit size={16} />
              Rename terminal
            </button>
          ))}
        {onRestartTerminal && (
          <button
            type="button"
            className={SHEET_ROW_CLASS_NAME}
            onClick={choose(() => onRestartTerminal(terminalId))}
          >
            <RotateCcw size={16} />
            Restart terminal
          </button>
        )}
        {onOpenCommandHistory && (
          <button
            type="button"
            className={SHEET_ROW_CLASS_NAME}
            onClick={choose(onOpenCommandHistory)}
          >
            <History size={16} />
            Command history
          </button>
        )}
        {navigationRows.map(({ label, Icon, run }) => (
          <button key={label} type="button" className={SHEET_ROW_CLASS_NAME} onClick={choose(run)}>
            <Icon size={16} />
            {label}
          </button>
        ))}
        {onCloseTerminal && (
          <div
            className={navigationRows.length > 0 ? SHEET_DESTRUCTIVE_DIVIDER_CLASS_NAME : undefined}
          >
            <button
              type="button"
              className={SHEET_DESTRUCTIVE_ROW_CLASS_NAME}
              onClick={choose(() => onCloseTerminal(terminalId, tabId))}
            >
              <X size={16} />
              Close terminal
            </button>
          </div>
        )}
      </MobileSheetContent>
    </Sheet>
  )
}
