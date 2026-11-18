import { useEffect } from 'react'
import { useOverlayRegistration } from '@/stores/overlay-stack-store'

interface MessageSelectHintProps {
  /** The message id; the overlay entry is unique per message. */
  overlayId: string
  /** Leave select mode. */
  onDone: () => void
}

/**
 * Paper "10.3": the line under a message in select-text mode. Done (44px),
 * Escape and system back all leave the mode.
 */
export function MessageSelectHint({
  overlayId,
  onDone
}: MessageSelectHintProps): React.JSX.Element {
  useOverlayRegistration(`message-select:${overlayId}`, true, onDone)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onDone()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDone])

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="min-w-0 text-sm text-muted-foreground">
        Press and drag to select. Tap Done to go back.
      </p>
      <button
        type="button"
        onClick={onDone}
        className="-mr-3 inline-flex h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-primary transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring active:bg-primary/10"
      >
        Done
      </button>
    </div>
  )
}
