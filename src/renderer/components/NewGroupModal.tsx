import { AnimatePresence, motion } from 'framer-motion'
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { X } from '@/components/icons'
import {
  PHONE_MODAL_BODY_CLASS,
  PHONE_MODAL_BUTTON_CLASS,
  PHONE_MODAL_CARD_CLASS,
  PHONE_MODAL_FOOTER_CLASS,
  PHONE_MODAL_OVERLAY_CLASS,
  TOUCH_FIELD_CLASS,
  TOUCH_HIT_AREA_CLASS
} from '@/components/phone-modal-classes'
import { Button } from '@/components/ui/button'
import { FIELD_FOCUS_CLASS } from '@/components/ui/panel-styles'
import { useModalFocus } from '@/components/use-modal-focus'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'

interface NewGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string) => void
  title?: string
  submitLabel?: string
  initialValue?: string
  placeholder?: string
}

export function NewGroupModal({
  isOpen,
  onClose,
  onSubmit,
  title = 'Create New Group',
  submitLabel = 'Create',
  initialValue = '',
  placeholder = 'Enter group name...'
}: NewGroupModalProps) {
  const [name, setName] = useState(initialValue)
  const dialogId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Mobile web shell: system back closes this modal (inert on desktop).
  useOverlayRegistration(`new-group-modal:${dialogId}`, isOpen, onClose, {
    mobileShellOnly: true
  })
  useModalFocus(isOpen, dialogRef, inputRef)

  // Reset name when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(initialValue)
    }
  }, [isOpen, initialValue])

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim()
    if (trimmedName) {
      onSubmit(trimmedName)
      onClose()
    }
  }, [name, onSubmit, onClose])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // A focused button handles its own Enter (Enter on Cancel must not submit).
      if (e.key === 'Enter' && name.trim() && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [name, handleSubmit, onClose]
  )

  return (
    <AnimatePresence>
      {isOpen && (
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
            className={`bg-card rounded-lg shadow-2xl max-w-[400px] border border-border overflow-hidden outline-none ${PHONE_MODAL_CARD_CLASS}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-secondary/50 shrink-0">
              <h3 id={`${dialogId}-title`} className="text-sm font-semibold text-foreground">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={`text-muted-foreground hover:text-foreground transition-colors ${TOUCH_HIT_AREA_CLASS}`}
              >
                <X size={14} />
              </button>
            </div>

            {/* Content */}
            <div className={`p-4 space-y-4 ${PHONE_MODAL_BODY_CLASS}`}>
              <div>
                <label
                  htmlFor={`${dialogId}-name`}
                  className="block text-xs font-medium text-muted-foreground mb-1"
                >
                  Group Folder Name
                </label>
                <input
                  ref={inputRef}
                  id={`${dialogId}-name`}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={placeholder}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  className={`w-full bg-secondary border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground ${TOUCH_FIELD_CLASS} ${FIELD_FOCUS_CLASS}`}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              className={`px-4 py-3 bg-secondary/50 flex justify-end gap-2 border-t border-border ${PHONE_MODAL_FOOTER_CLASS}`}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className={PHONE_MODAL_BUTTON_CLASS}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={!name.trim()}
                className={PHONE_MODAL_BUTTON_CLASS}
              >
                {submitLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
