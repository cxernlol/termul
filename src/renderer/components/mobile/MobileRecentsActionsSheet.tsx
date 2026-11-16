import { useEffect, useRef, useState } from 'react'
import { Copy, Edit, Trash2, X } from '@/components/icons'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'
import { SHEET_DESTRUCTIVE_DIVIDER_CLASS_NAME, SHEET_ROW_CLASS_NAME } from './mobile-sheet-rows'

export const MOBILE_RECENTS_ACTIONS_SHEET_ID = 'mobile-recents-actions-sheet'

interface MobileRecentsActionsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The chat's title, so the sheet makes sense on its own. */
  title: string
  /** Every chat: copies the reference another chat's agent can follow. */
  onCopyReference: () => void
  /** Quick chats only: stores the new title. Not called for a blank title. */
  onRename?: (title: string) => void
  /** Open chats only: closes the chat through its guarded close. */
  onCloseChat?: () => void
  /** History chats only: requests the existing delete confirm. */
  onDeleteChat?: () => void
  /** Places focus once the sheet has closed (back on its row). */
  onCloseAutoFocus: (event: Event) => void
}

/**
 * The Recents row actions, opened by a long-press (`contextmenu`) or the row's
 * keyboard-reachable actions button: Rename for a quick chat, Copy chat
 * reference for every chat, Close for an open chat, Delete for a history
 * chat. Recents rows carry no trailing icons of their own.
 */
export function MobileRecentsActionsSheet({
  open,
  onOpenChange,
  title,
  onCopyReference,
  onRename,
  onCloseChat,
  onDeleteChat,
  onCloseAutoFocus
}: MobileRecentsActionsSheetProps): React.JSX.Element {
  // System back closes this sheet before the drawer under it.
  useOverlayRegistration(MOBILE_RECENTS_ACTIONS_SHEET_ID, open, () => onOpenChange(false))
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
    setDraft(title)
    setRenaming(true)
  }

  /** Ends the edit and stores a real new title. Returns whether it stored one. */
  const commitRename = (): boolean => {
    if (settledRef.current) return false
    settledRef.current = true
    setRenaming(false)
    const next = draft.trim()
    if (!next || !onRename) return false
    onRename(next)
    return true
  }

  const choose = (run: () => void) => (): void => {
    onOpenChange(false)
    run()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        id={MOBILE_RECENTS_ACTIONS_SHEET_ID}
        onCloseAutoFocus={onCloseAutoFocus}
        className="flex max-h-[85dvh] flex-col gap-0 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="space-y-0 px-2 py-2 pr-10 text-left">
          <SheetTitle className="truncate text-base">{title}</SheetTitle>
          <SheetDescription className="sr-only">Chat actions</SheetDescription>
        </SheetHeader>
        {onRename &&
          (renaming ? (
            // The edit row is as tall as the action rows, so ending the edit
            // does not move the rows below (as in the terminal sheet).
            <div className="px-2">
              <Input
                autoFocus
                value={draft}
                aria-label={`Rename ${title}`}
                className="min-h-11 text-base md:text-base"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Enter that confirms an IME composition is not a commit.
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return
                    if (commitRename()) onOpenChange(false)
                  } else if (event.key === 'Escape') {
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
            <button
              type="button"
              className={`${SHEET_ROW_CLASS_NAME} hover:bg-accent`}
              onClick={startRename}
            >
              <Edit size={16} />
              Rename chat
            </button>
          ))}
        <button
          type="button"
          className={`${SHEET_ROW_CLASS_NAME} hover:bg-accent`}
          onClick={choose(onCopyReference)}
        >
          <Copy size={16} />
          Copy chat reference
        </button>
        {onCloseChat && (
          <button
            type="button"
            className={`${SHEET_ROW_CLASS_NAME} hover:bg-accent`}
            onClick={choose(onCloseChat)}
          >
            <X size={16} />
            Close chat
          </button>
        )}
        {onDeleteChat && (
          <div className={SHEET_DESTRUCTIVE_DIVIDER_CLASS_NAME}>
            <button
              type="button"
              className={`${SHEET_ROW_CLASS_NAME} text-destructive hover:bg-destructive/10`}
              onClick={choose(onDeleteChat)}
            >
              <Trash2 size={16} />
              Delete chat
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
