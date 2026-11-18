import {
  Bug,
  Folder2,
  GitBranch,
  Search,
  Settings,
  TerminalSquare,
  type TermulIcon
} from '@/components/icons'

/**
 * The layout every bottom-sheet action row shares: the 44px touch floor, and
 * a 12px inset that puts the label 20px from the screen edge inside the
 * sheet's 8px padding (the phone gutter).
 */
const SHEET_ROW_BASE_CLASS_NAME =
  'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-sm transition-colors duration-150 ease-out'

/**
 * A bottom-sheet action row: the `MobileFileExplorer` pattern at the 44px
 * touch floor. A touch has no hover, so the press (`active:`) shows the same
 * fill the pointer hover shows: the desktop chat list's neutral `row-hover`.
 * `bg-accent` is the blue brand colour, not a row fill.
 */
export const SHEET_ROW_CLASS_NAME = `${SHEET_ROW_BASE_CLASS_NAME} hover:bg-row-hover active:bg-row-hover`

/** The destructive row (Close chat, Delete): red label, red-tinted hover and press. */
export const SHEET_DESTRUCTIVE_ROW_CLASS_NAME = `${SHEET_ROW_BASE_CLASS_NAME} text-destructive hover:bg-destructive/10 active:bg-destructive/10`

/**
 * The body of a shell action sheet on `MobileSheetContent`: 8px padding round
 * the rows (rows then sit 20px from the screen edge) and the home-indicator
 * inset at the foot. The body already scrolls and contains overscroll.
 */
export const SHEET_BODY_CLASS_NAME = 'gap-0 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'

/**
 * `onOpenAutoFocus` for a shell action sheet: focus goes to the first action
 * row, not to the grab handle (the first focusable element). A row that
 * closes the sheet and focuses something outside it (Rename's inline input)
 * then keeps that focus: the closing sheet's focus trap only knows the row,
 * which is gone, so it has nothing to pull focus back to.
 */
export function focusFirstSheetAction(event: Event): void {
  const content = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const row = content?.querySelector<HTMLElement>(
    'button:not([aria-label="Close"]):not(:disabled), input'
  )
  if (!row) return
  event.preventDefault()
  row.focus()
}

/** The sheet's subtitle (project, branch, path) under the centred title. */
export const SHEET_SUBTITLE_CLASS_NAME =
  'truncate px-3 pb-2 text-center text-xs text-muted-foreground'

/** Wraps the destructive row (Close chat, Close terminal) to set it apart from the rows above. */
export const SHEET_DESTRUCTIVE_DIVIDER_CLASS_NAME = 'mt-1 border-t border-border/60 pt-1'

/**
 * The shell navigation actions both ⋯ sheets can offer. Each row renders only
 * when its callback is given, so the owner decides which apply (web-only gates,
 * a project with a path, and so on).
 */
export interface ShellNavigationActions {
  onOpenGitChanges?: () => void
  onOpenFiles?: () => void
  onOpenCommandPalette?: () => void
  onNewTerminal?: () => void
  onOpenProjectSettings?: () => void
  /** Opens the Report a Bug dialog (spec-bug-report-dialog). */
  onReportBug?: () => void
}

export interface ShellNavigationRow {
  label: string
  Icon: TermulIcon
  run: () => void
}

/**
 * The navigation rows whose callback is given, in the header ⋯ sheet's order:
 * Git changes, Files, Command palette, New terminal, Project settings,
 * Report a bug. The terminal ⋯ sheet passes no `onNewTerminal`, because the
 * header ✎ already is New terminal there.
 */
export function visibleNavigationRows(actions: ShellNavigationActions): ShellNavigationRow[] {
  const rows: Array<{ label: string; Icon: TermulIcon; run: (() => void) | undefined }> = [
    { label: 'Git changes', Icon: GitBranch, run: actions.onOpenGitChanges },
    { label: 'Files', Icon: Folder2, run: actions.onOpenFiles },
    { label: 'Command palette', Icon: Search, run: actions.onOpenCommandPalette },
    { label: 'New terminal', Icon: TerminalSquare, run: actions.onNewTerminal },
    { label: 'Project settings', Icon: Settings, run: actions.onOpenProjectSettings },
    { label: 'Report a bug', Icon: Bug, run: actions.onReportBug }
  ]
  return rows.flatMap(({ label, Icon, run }) => (run ? [{ label, Icon, run }] : []))
}
