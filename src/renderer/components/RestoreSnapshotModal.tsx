import { AnimatePresence, motion } from 'framer-motion'
import { type KeyboardEvent, useCallback, useEffect, useId, useRef } from 'react'
import { AlertTriangle, RotateCcw, X } from '@/components/icons'
import {
  PHONE_MODAL_BODY_CLASS,
  PHONE_MODAL_BUTTON_CLASS,
  PHONE_MODAL_CARD_CLASS,
  PHONE_MODAL_FOOTER_CLASS,
  PHONE_MODAL_OVERLAY_CLASS,
  TOUCH_HIT_AREA_CLASS
} from '@/components/phone-modal-classes'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useModalFocus } from '@/components/use-modal-focus'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'
import type { Snapshot } from '@/types/project'

interface RestoreSnapshotModalProps {
  isOpen: boolean
  snapshot: Snapshot | null
  hasRunningProcesses: boolean
  onClose: () => void
  onRestore: () => Promise<void> | void
  isRestoring: boolean
}

export function RestoreSnapshotModal({
  isOpen,
  snapshot,
  hasRunningProcesses,
  onClose,
  onRestore,
  isRestoring
}: RestoreSnapshotModalProps): React.JSX.Element {
  // Mobile web shell: system back closes this modal through the page's own
  // close, which vetoes while a restore is in flight (inert on desktop).
  const dialogId = useId()
  const overlayId = `restore-snapshot-modal:${dialogId}`
  useOverlayRegistration(overlayId, isOpen && snapshot !== null, onClose, {
    mobileShellOnly: true
  })
  // Restore closes every terminal: focus lands on Cancel, so a stray Enter on
  // the button does not restore.
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useModalFocus(isOpen && snapshot !== null, dialogRef, cancelRef)

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape' && !isRestoring) {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, isRestoring, onClose])

  const handleRestore = useCallback(async () => {
    if (!isRestoring) {
      await onRestore()
    }
  }, [isRestoring, onRestore])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // A focused button handles its own Enter (Enter on Cancel must not restore).
      if (e.key === 'Enter' && !isRestoring && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        handleRestore()
      } else if (e.key === 'Escape' && !isRestoring) {
        e.preventDefault()
        onClose()
      }
    },
    [isRestoring, handleRestore, onClose]
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
                <RotateCcw size={14} />
                Restore Snapshot
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={isRestoring}
                aria-label="Close"
                className={`text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 ${TOUCH_HIT_AREA_CLASS}`}
              >
                <X size={14} />
              </button>
            </div>

            {/* Content */}
            <div className={`p-4 space-y-4 ${PHONE_MODAL_BODY_CLASS}`}>
              <p className="text-sm text-foreground">
                Are you sure you want to restore the snapshot{' '}
                <span className="font-semibold">&quot;{snapshot.name}&quot;</span>?
              </p>

              <p className="text-sm text-muted-foreground">
                This will close all current terminals and recreate {snapshot.paneCount} terminal
                {snapshot.paneCount !== 1 ? 's' : ''} from the snapshot.
              </p>

              {hasRunningProcesses && (
                <div className="bg-warning/10 border border-warning/50 rounded p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-warning mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-warning">
                    <span className="font-medium">Warning:</span> You have terminals with running
                    processes. Restoring will terminate these processes.
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className={`px-4 py-3 bg-secondary/50 flex justify-end gap-2 border-t border-border ${PHONE_MODAL_FOOTER_CLASS}`}
            >
              <Button
                ref={cancelRef}
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isRestoring}
                className={PHONE_MODAL_BUTTON_CLASS}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleRestore}
                disabled={isRestoring}
                className={PHONE_MODAL_BUTTON_CLASS}
              >
                {isRestoring ? <Spinner size={12} decorative /> : <RotateCcw />}
                {isRestoring ? 'Restoring...' : 'Restore'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
