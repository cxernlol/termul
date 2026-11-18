import { AnimatePresence, motion } from 'framer-motion'
import { type KeyboardEvent, useCallback, useEffect, useId, useRef } from 'react'
import { Trash2, X } from '@/components/icons'
import {
  PHONE_MODAL_BODY_CLASS,
  PHONE_MODAL_BUTTON_CLASS,
  PHONE_MODAL_CARD_CLASS,
  PHONE_MODAL_FOOTER_CLASS,
  PHONE_MODAL_OVERLAY_CLASS,
  TOUCH_HIT_AREA_CLASS
} from '@/components/phone-modal-classes'
import { useModalFocus } from '@/components/use-modal-focus'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'
import type { Snapshot } from '@/types/project'

interface DeleteSnapshotModalProps {
  isOpen: boolean
  snapshot: Snapshot | null
  onClose: () => void
  onDelete: () => Promise<void> | void
  isDeleting: boolean
}

export function DeleteSnapshotModal({
  isOpen,
  snapshot,
  onClose,
  onDelete,
  isDeleting
}: DeleteSnapshotModalProps): React.JSX.Element {
  // Mobile web shell: system back closes this modal through the page's own
  // close, which vetoes while a delete is in flight (inert on desktop).
  const dialogId = useId()
  const overlayId = `delete-snapshot-modal:${dialogId}`
  useOverlayRegistration(overlayId, isOpen && snapshot !== null, onClose, {
    mobileShellOnly: true
  })
  // A destructive confirm: focus lands on Cancel, so a stray Enter on the
  // button does not delete.
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useModalFocus(isOpen && snapshot !== null, dialogRef, cancelRef)

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, isDeleting, onClose])

  const handleDelete = useCallback(async () => {
    if (!isDeleting) {
      await onDelete()
    }
  }, [isDeleting, onDelete])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // A focused button handles its own Enter (Enter on Cancel must not delete).
      if (e.key === 'Enter' && !isDeleting && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        handleDelete()
      } else if (e.key === 'Escape' && !isDeleting) {
        e.preventDefault()
        onClose()
      }
    },
    [isDeleting, handleDelete, onClose]
  )

  return (
    <AnimatePresence>
      {isOpen && snapshot && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 bg-overlay/60 backdrop-blur-sm z-50 flex items-center justify-center ${PHONE_MODAL_OVERLAY_CLASS}`}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15 }}
            className={`bg-card rounded-lg shadow-2xl max-w-[480px] border border-border overflow-hidden outline-none ${PHONE_MODAL_CARD_CLASS}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            ref={dialogRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-secondary/50 shrink-0">
              <h3
                id={`${dialogId}-title`}
                className="text-sm font-semibold text-foreground flex items-center gap-2"
              >
                <Trash2 size={14} className="text-destructive" />
                Delete Snapshot
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                aria-label="Close"
                className={`text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 ${TOUCH_HIT_AREA_CLASS}`}
              >
                <X size={14} />
              </button>
            </div>

            {/* Content */}
            <div className={`p-4 space-y-4 ${PHONE_MODAL_BODY_CLASS}`}>
              <p className="text-sm text-foreground">
                Are you sure you want to delete the snapshot{' '}
                <span className="font-semibold">&quot;{snapshot.name}&quot;</span>?
              </p>

              <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            </div>

            {/* Footer */}
            <div
              className={`px-4 py-3 bg-secondary/50 flex justify-end gap-2 border-t border-border ${PHONE_MODAL_FOOTER_CLASS}`}
            >
              <button
                ref={cancelRef}
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className={`px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground active:text-foreground transition-colors disabled:opacity-50 flex items-center justify-center ${PHONE_MODAL_BUTTON_CLASS}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className={`px-3 py-1.5 text-xs font-medium bg-destructive-fill text-destructive-foreground rounded hover:bg-destructive-fill/90 active:bg-destructive-fill/90 shadow-md transition-[background-color,opacity] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${PHONE_MODAL_BUTTON_CLASS}`}
              >
                <Trash2 size={12} />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
