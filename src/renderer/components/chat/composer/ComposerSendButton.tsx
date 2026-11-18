import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Square } from '@/components/icons'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { iconPop } from '../chat-motion'

interface ComposerSendButtonProps {
  /** A turn is running and there is nothing to send: show Stop. */
  showStop: boolean
  canSend: boolean
  /** A turn is running: a send is queued instead of dispatched. */
  busy: boolean
  reduced: boolean
  onCancel: () => void
  onSubmit: () => void | Promise<void>
  /** Label of the send state (the launcher reads "Start agent chat"). */
  sendLabel?: string
  /**
   * `phone`: the compact phone composer's 36px button, radius 10, with a 44px
   * hit area (Paper "2.6b"). Default: 32px.
   */
  size?: 'default' | 'phone'
}

/**
 * The composer's send / queue / stop morph: 32px, with a 44px (narrow pane)
 * or 40px hit area; 36px with a 44px hit area on the phone (`size="phone"`). One source for the chat composer (desktop and mobile
 * toolbars) and the agent launcher.
 */
export function ComposerSendButton({
  showStop,
  canSend,
  busy,
  reduced,
  onCancel,
  onSubmit,
  sendLabel,
  size = 'default'
}: ComposerSendButtonProps): React.JSX.Element {
  const iconMotion = iconPop(reduced)
  const phone = size === 'phone'
  // Phone: 36px, radius 10, a 4px hit extension on every side (44px).
  const sizeClass = phone
    ? "size-9 rounded-[10px] after:absolute after:-inset-1 after:content-['']"
    : "after:absolute after:-inset-1.5 after:content-[''] @[400px]:pointer-fine:after:-inset-1"
  return (
    <div className={cn('relative size-8 shrink-0 overflow-visible', phone && 'size-9')}>
      <AnimatePresence initial={false} mode="popLayout">
        {showStop ? (
          <motion.button
            key="stop"
            type="button"
            onClick={onCancel}
            title="Cancel turn"
            aria-label="Cancel turn"
            initial={iconMotion.initial}
            animate={iconMotion.animate}
            exit={iconMotion.exit}
            transition={iconMotion.transition}
            className={cn(
              buttonVariants({ variant: 'composer', size: 'icon-sm' }),
              'absolute inset-0 [&_svg]:size-3.5',
              sizeClass
            )}
          >
            <Square fill="currentColor" strokeWidth={0} />
          </motion.button>
        ) : (
          <motion.button
            key="send"
            type="button"
            onClick={() => void onSubmit()}
            disabled={!canSend}
            title={busy ? 'Queue message' : (sendLabel ?? 'Send')}
            aria-label={busy ? 'Queue message' : (sendLabel ?? 'Send message')}
            initial={iconMotion.initial}
            animate={iconMotion.animate}
            exit={iconMotion.exit}
            transition={iconMotion.transition}
            className={cn(
              buttonVariants({ variant: 'composer', size: 'icon-sm' }),
              'absolute inset-0 [&_svg]:size-[18px]',
              sizeClass
            )}
          >
            <ArrowUp />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
