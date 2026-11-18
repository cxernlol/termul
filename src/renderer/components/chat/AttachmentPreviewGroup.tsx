import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useCallback, useState } from 'react'
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments
} from '@/components/ai-elements/attachments'
import { logFrontendError } from '@/lib/log-api'
import { cn } from '@/lib/utils'
import { AttachmentImageViewer } from './AttachmentImageViewer'
import {
  attachmentAriaLabel,
  type PendingAttachment,
  pendingToAttachmentData
} from './chat-attachments'

/** Touch has no hover card: a tap on an image chip opens the viewer. */
function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches)
}

/** Decoded byte size of a base64 payload (for the viewer footer). */
function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

interface AttachmentPreviewGroupProps {
  attachments: PendingAttachment[]
  onRemove: (id: string) => void
  className?: string
  /**
   * Optional per-attachment action rendered inside each badge, before the
   * remove control. The Report a Bug dialog uses it for the copy-image
   * button; composers leave it unset.
   */
  attachmentActions?: (attachment: PendingAttachment) => React.ReactNode
  /**
   * When the owning `useComposerAttachments` is disabled, removal is frozen —
   * show the remove control disabled instead of live-but-inert.
   */
  removeDisabled?: boolean
}

/** Staged-attachment badges shown in a composer above the textarea. */
export function AttachmentPreviewGroup({
  attachments,
  onRemove,
  className,
  attachmentActions,
  removeDisabled = false
}: AttachmentPreviewGroupProps): React.JSX.Element | null {
  const reduced = useReducedMotion() ?? false
  const [viewer, setViewer] = useState<{ id: string; opener: HTMLElement } | null>(null)
  const closeViewer = useCallback(() => setViewer(null), [])

  const viewerIndex = viewer ? attachments.findIndex((a) => a.id === viewer.id) : -1
  const viewerAttachment = viewerIndex >= 0 ? attachments[viewerIndex] : undefined
  const viewerSrc =
    viewerAttachment && viewerAttachment.kind !== 'file-embed'
      ? viewerAttachment.previewUrl
      : undefined
  const viewerItem =
    viewerAttachment && viewerSrc
      ? {
          id: viewerAttachment.id,
          // The same display-safe name the chip uses (no raw temp names).
          name: attachmentAriaLabel(viewerAttachment.name),
          src: viewerSrc,
          size: viewerAttachment.kind === 'image' ? base64Bytes(viewerAttachment.base64) : undefined
        }
      : null

  const removeFromViewer = useCallback(() => {
    if (!viewer) return
    // Boundary log: no file name or content.
    void logFrontendError({
      level: 'info',
      source: 'AttachmentPreviewGroup.viewer',
      message: 'staged attachment removed from the image preview'
    })
    onRemove(viewer.id)
    setViewer(null)
  }, [viewer, onRemove])

  if (attachments.length === 0) return null
  return (
    <>
      <AttachmentImageViewer
        item={viewerItem}
        position={viewerIndex + 1}
        count={attachments.length}
        opener={viewer?.opener ?? null}
        onClose={closeViewer}
        onRemove={removeFromViewer}
        removeDisabled={removeDisabled}
      />
      <Attachments variant="inline" className={cn('overflow-y-visible px-3 pb-1 pt-3', className)}>
        <AnimatePresence initial={false}>
          {attachments.map((a) => {
            const data = pendingToAttachmentData(a)
            const ariaLabel = attachmentAriaLabel(a.name)
            const previewUrl = a.kind === 'file-embed' ? undefined : a.previewUrl
            const hasImagePreview = Boolean(previewUrl)
            // Images preview inline via a hover card; non-image files render as a
            // static badge. Nothing opens a backing path — temp/file paths can
            // live in sandboxed dirs the OS opener refuses, which would surface as
            // an error toast, so clicks are intentionally disabled.
            return (
              <motion.div
                key={a.id}
                className="shrink-0 snap-start"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <Attachment data={data} title={a.name} onRemove={() => onRemove(a.id)}>
                  {hasImagePreview ? (
                    <AttachmentHoverCard>
                      <AttachmentHoverCardTrigger asChild>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-1.5"
                          aria-label={ariaLabel}
                          onClick={(event) => {
                            // Paper "10.5": on touch a tap opens the full-screen
                            // preview; a mouse keeps the hover card.
                            if (!isCoarsePointer()) return
                            setViewer({ id: a.id, opener: event.currentTarget })
                          }}
                        >
                          <AttachmentPreview />
                          <AttachmentInfo />
                        </button>
                      </AttachmentHoverCardTrigger>
                      <AttachmentHoverCardContent>
                        <img
                          src={previewUrl}
                          alt={ariaLabel}
                          className="h-32 w-auto rounded object-cover"
                        />
                      </AttachmentHoverCardContent>
                    </AttachmentHoverCard>
                  ) : (
                    <>
                      <AttachmentPreview />
                      <AttachmentInfo />
                    </>
                  )}
                  {attachmentActions?.(a)}
                  <AttachmentRemove label={`Remove ${ariaLabel}`} disabled={removeDisabled} />
                </Attachment>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </Attachments>
    </>
  )
}
