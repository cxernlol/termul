import { AnimatePresence, motion } from 'framer-motion'
import { type KeyboardEvent, type MouseEvent, useCallback, useEffect, useId, useMemo } from 'react'
import {
  handleExternalLinkClick,
  requestExternalLinkOpen
} from '@/components/external-link/ExternalLinkConfirm'
import { ExternalLink, Sparkles, X } from '@/components/icons'
import {
  PHONE_MODAL_BODY_CLASS,
  PHONE_MODAL_BUTTON_CLASS,
  PHONE_MODAL_CARD_CLASS,
  PHONE_MODAL_FOOTER_CLASS,
  PHONE_MODAL_OVERLAY_CLASS,
  TOUCH_HIT_AREA_CLASS
} from '@/components/phone-modal-classes'
import { Button } from '@/components/ui/button'
import { renderChatMarkdown } from '@/lib/chat-markdown'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'

interface WhatsNewModalProps {
  isOpen: boolean
  version: string
  notes?: string | null
  htmlUrl?: string | null
  onClose: () => void
}

export function WhatsNewModal({
  isOpen,
  version,
  notes,
  htmlUrl,
  onClose
}: WhatsNewModalProps): React.JSX.Element {
  // Mobile web shell: system back dismisses this modal (inert on desktop).
  const overlayId = `whats-new-modal:${useId()}`
  useOverlayRegistration(overlayId, isOpen, onClose, { mobileShellOnly: true })

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: globalThis.KeyboardEvent): void => {
      // Already handled by a dialog on top (e.g. the external-link confirm).
      if (e.defaultPrevented) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  // "View on GitHub" goes through the app-wide confirm, like the notes links.
  const handleViewOnGitHub = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      // Only hand http(s) URLs to the system opener; htmlUrl originates from a
      // network response, so guard against unexpected schemes.
      if (htmlUrl && /^https?:\/\//i.test(htmlUrl)) {
        requestExternalLinkOpen(htmlUrl, { returnFocusTo: event.currentTarget })
      }
    },
    [htmlUrl]
  )

  // Release notes are GitHub-flavored markdown; render to sanitized HTML
  // (DOMPurify via the shared chat-markdown renderer) so headings, lists, and
  // links display properly instead of as raw markup.
  const notesHtml = useMemo(() => (notes ? renderChatMarkdown(notes) : null), [notes])

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
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className={`bg-card rounded-lg shadow-2xl max-w-[500px] border border-border overflow-hidden ${PHONE_MODAL_CARD_CLASS}`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            tabIndex={-1}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex justify-between items-center bg-secondary/50 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-primary" />
                </div>
                <h3 id="whats-new-title" className="text-sm font-semibold text-foreground">
                  What's New
                </h3>
              </div>
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
              {/* Version Info */}
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Updated to version
                </span>
                <span className="text-sm font-semibold text-foreground">{version}</span>
              </div>

              {/* Release Notes */}
              <div>
                <span className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Release Notes
                </span>
                {/* Phone: the whole body scrolls, so the notes do not nest a second scroller. */}
                <div className="max-h-[320px] overflow-y-auto overscroll-contain pr-1 max-sm:max-h-none max-sm:overflow-visible">
                  {notesHtml ? (
                    // biome-ignore lint/a11y/noStaticElementInteractions: link clicks are delegated from sanitized HTML; Enter on a focused link fires click
                    // biome-ignore lint/a11y/useKeyWithClickEvents: link clicks are delegated from sanitized HTML; Enter on a focused link fires click
                    <div
                      className="chat-prose text-xs leading-relaxed text-foreground"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is sanitized via renderChatMarkdown (DOMPurify)
                      dangerouslySetInnerHTML={{ __html: notesHtml }}
                      data-external-link-scope=""
                      onClick={handleExternalLinkClick}
                      onAuxClick={handleExternalLinkClick}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Release notes aren't available for this version.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className={`px-4 py-3 bg-secondary/50 flex justify-end gap-2 border-t border-border flex-wrap ${PHONE_MODAL_FOOTER_CLASS}`}
            >
              {htmlUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleViewOnGitHub}
                  className={PHONE_MODAL_BUTTON_CLASS}
                >
                  <ExternalLink />
                  View on GitHub
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={onClose}
                className={PHONE_MODAL_BUTTON_CLASS}
              >
                Got it
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
