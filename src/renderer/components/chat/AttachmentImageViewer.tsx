import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useRef } from 'react'
import { X } from '@/components/icons'
import { NativeWebviewOccluder } from '@/hooks/use-native-webview-occlusion'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'

export interface AttachmentImageViewerItem {
  id: string
  name: string
  src: string
  /** Bytes, when known; shown in the footer. */
  size?: number
}

interface AttachmentImageViewerProps {
  /** The staged image to show; null keeps the viewer closed. */
  item: AttachmentImageViewerItem | null
  /** 1-based position among the staged attachments, and their count. */
  position: number
  count: number
  /** The chip that opened the viewer; it gets focus back on close. */
  opener: HTMLElement | null
  onClose: () => void
  /** Remove the staged attachment; the viewer closes after. */
  onRemove: () => void
  removeDisabled?: boolean
}

/** Approximate size for the footer: whole KB under 1 MB, one decimal above. */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const BAR_BUTTON =
  'inline-flex h-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring active:bg-foreground/10'

/**
 * Paper "10.5": a staged image opens full screen on a tap (touch has no hover
 * card). Close at the top left, the file name in the middle, Remove at the top
 * right; the footer shows "n of m · size". System back closes it.
 */
export function AttachmentImageViewer({
  item,
  position,
  count,
  opener,
  onClose,
  onRemove,
  removeDisabled = false
}: AttachmentImageViewerProps): React.JSX.Element {
  const open = item !== null
  useOverlayRegistration('composer-attachment-viewer', open, onClose)
  // The caller clears `opener` as it closes, before the close focus runs.
  const openerRef = useRef<HTMLElement | null>(null)
  if (opener) openerRef.current = opener

  const footer = item
    ? [`${position} of ${count}`, item.size !== undefined ? formatAttachmentSize(item.size) : null]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-overlay pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none!"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const target = openerRef.current
            openerRef.current = null
            if (target?.isConnected) target.focus()
          }}
        >
          <NativeWebviewOccluder />
          <div className="grid h-14 shrink-0 grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)_minmax(4.5rem,auto)] items-center px-2 mt-[env(safe-area-inset-top)]">
            <DialogPrimitive.Close
              aria-label="Close preview"
              className={`${BAR_BUTTON} size-11 text-foreground`}
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="truncate text-center text-sm font-medium text-foreground">
              {item?.name ?? 'Image'}
            </DialogPrimitive.Title>
            <button
              type="button"
              disabled={removeDisabled}
              aria-label={item ? `Remove ${item.name}` : 'Remove'}
              onClick={onRemove}
              className={`${BAR_BUTTON} justify-self-end px-3 text-sm font-medium text-destructive disabled:opacity-50`}
            >
              Remove
            </button>
          </div>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: a tap on the backdrop is a pointer shortcut; Escape and Close are the keyboard ways out */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: same backdrop shortcut */}
          <div
            className="flex min-h-0 flex-1 items-center justify-center"
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose()
            }}
          >
            {item && (
              <img
                src={item.src}
                alt={item.name}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
              />
            )}
          </div>
          <div className="flex h-14 shrink-0 items-center justify-center pb-[env(safe-area-inset-bottom)] text-sm tabular-nums text-muted-foreground">
            {footer}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
