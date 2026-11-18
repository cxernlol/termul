import { useId } from 'react'
import { RefreshCw, X } from '@/components/icons'
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

export const MOBILE_HEADER_MORE_SHEET_ID = 'mobile-header-more-sheet'

interface MobileHeaderMoreSheetProps extends ShellNavigationActions {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The header title, so the sheet makes sense on its own. */
  title: string
  /** The header subtitle text (project, branch, Local or Worktree). */
  subtitle: string
  /** Returns focus per the shell's registry (`sheetCloseAutoFocus`, `lib/sheet-focus-return.ts`). */
  onCloseAutoFocus: (event: Event) => void
  /** Called when a row was chosen: the shell sets the destination title as the focus target. */
  onItemChosen: () => void
  /** Agent-chat tabs only. */
  onCloseChat?: () => void
  /** Agent-chat tabs only. Reload this chat onto a new agent process. */
  onReloadChat?: () => void
  reloadChatDisabled?: boolean
  reloadChatReason?: string | null
  /**
   * Other non-terminal tabs (Git History, editors, Git Changes, browser):
   * closes the active tab through its guarded close.
   */
  onCloseTab?: () => void
}

/**
 * Header ⋯ bottom sheet for a chat or tab: the actions the old header spread
 * across six icons. Each row calls its callback and closes the sheet. Rows use
 * the `MobileFileExplorer` action-row pattern at 44px.
 */
export function MobileHeaderMoreSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  onCloseAutoFocus,
  onItemChosen,
  onCloseChat,
  onReloadChat,
  reloadChatDisabled = false,
  reloadChatReason,
  onCloseTab,
  ...navigation
}: MobileHeaderMoreSheetProps): React.JSX.Element {
  const choose = (run: () => void) => (): void => {
    onItemChosen()
    onOpenChange(false)
    run()
  }

  // Each row renders only when its callback is given.
  const visibleRows = visibleNavigationRows(navigation)
  const reloadReasonId = useId()
  const showReloadReason = reloadChatDisabled && Boolean(reloadChatReason)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <MobileSheetContent
        id={MOBILE_HEADER_MORE_SHEET_ID}
        title={title}
        onOpenAutoFocus={focusFirstSheetAction}
        onCloseAutoFocus={onCloseAutoFocus}
        bodyClassName={SHEET_BODY_CLASS_NAME}
      >
        <SheetDescription className={SHEET_SUBTITLE_CLASS_NAME}>{subtitle}</SheetDescription>
        {visibleRows.map(({ label, Icon, run }) => (
          <button key={label} type="button" className={SHEET_ROW_CLASS_NAME} onClick={choose(run)}>
            <Icon size={16} />
            {label}
          </button>
        ))}
        {onReloadChat && (
          <button
            type="button"
            className={`${SHEET_ROW_CLASS_NAME} py-2 disabled:opacity-70`}
            onClick={choose(onReloadChat)}
            disabled={reloadChatDisabled}
            // The name is the label alone; the visible reason is its description.
            aria-label="Reload this chat"
            aria-describedby={showReloadReason ? reloadReasonId : undefined}
          >
            <RefreshCw size={16} className="shrink-0" />
            {/* A touch has no hover, so the reason the row is disabled shows as
                text under its label instead of in a `title` tooltip. */}
            <span className="flex min-w-0 flex-col text-left">
              <span>Reload this chat</span>
              {showReloadReason && (
                <span id={reloadReasonId} className="text-xs text-muted-foreground">
                  {reloadChatReason}
                </span>
              )}
            </span>
          </button>
        )}
        {onCloseChat && (
          <div
            className={visibleRows.length > 0 ? SHEET_DESTRUCTIVE_DIVIDER_CLASS_NAME : undefined}
          >
            <button
              type="button"
              className={SHEET_DESTRUCTIVE_ROW_CLASS_NAME}
              onClick={choose(onCloseChat)}
            >
              <X size={16} />
              Close chat
            </button>
          </div>
        )}
        {onCloseTab && !onCloseChat && (
          <div
            className={visibleRows.length > 0 ? SHEET_DESTRUCTIVE_DIVIDER_CLASS_NAME : undefined}
          >
            <button
              type="button"
              className={SHEET_DESTRUCTIVE_ROW_CLASS_NAME}
              onClick={choose(onCloseTab)}
            >
              <X size={16} />
              Close tab
            </button>
          </div>
        )}
      </MobileSheetContent>
    </Sheet>
  )
}
