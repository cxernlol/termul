import { AnimatePresence, motion, type Transition, useIsPresent } from 'framer-motion'
import { forwardRef, type ReactNode, useState } from 'react'
import { EASE_OUT } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { AsciiGlow } from './ascii-glow/AsciiGlow'
import { CHAT_GUTTER_X } from './chat-layout'
import { CHAT_START_COLUMN_CLASS, CHAT_START_TOP_CLASS, ChatStartBottomSpacer } from './chat-start'

/*
 * First-send morph of an empty chat (shared-element morph). On the first send
 * the start screen becomes a working chat in one motion instead of a cut:
 *
 * - The composer is the shared element. It is the same ChatInputBar node in
 *   both states; Motion `layout` moves it from the middle (680px) to the
 *   bottom dock (768px) on a critically damped spring. Its rows use
 *   `layout="position"`, so the text moves and never stretches.
 * - The hero and the context row exit in place: out of the flow
 *   (`popLayout`), inert, opacity 1→0 and scale 1→0.98.
 * - The ASCII glow fades out.
 * - The transcript enters from the composer side, after the composer moved.
 *
 * Every part keys on the empty-chat flag, so the morph runs once per chat
 * (start screen → working chat). Reduced motion switches at once.
 */

/** Composer travel: critically damped, response 0.35s (`--duration-medium`), no bounce. */
const COMPOSER_MORPH_SPRING: Transition = { type: 'spring', visualDuration: 0.35, bounce: 0 }

/** Hero and context row exit: 160ms, `--ease-out`. */
const START_EXIT: Transition = { duration: 0.16, ease: EASE_OUT }

/** ASCII glow fade: 200ms, `--ease-out`. */
const GLOW_EXIT: Transition = { duration: 0.2, ease: EASE_OUT }

/** Transcript entrance: 320ms, `--ease-out`, after `--duration-micro` (80ms). */
const TIMELINE_ENTER: Transition = { duration: 0.32, ease: EASE_OUT, delay: 0.08 }

const INSTANT: Transition = { duration: 0 }

/** Motion props for the composer frame (`frame`) or one of its rows (`content`). */
interface ComposerMorphProps {
  layout: boolean | 'position'
  transition: Transition
  onLayoutAnimationComplete?: () => void
}

/**
 * Motion props for the composer frame and its rows. `layout` is on while the
 * start screen shows and through the first-send morph, with no
 * `layoutDependency`: Motion measures on every render, so the morph starts
 * from where the composer really was, whichever render moves it (the send,
 * the queued prompt, the session start). After the morph `layout` is off, so
 * typing, a new line or a notice in a working chat never animates the card.
 */
export function useComposerMorph(
  startScreen: boolean,
  reduced: boolean
): { frame: ComposerMorphProps; content: ComposerMorphProps } {
  const [wasStart, setWasStart] = useState(startScreen)
  const [morphing, setMorphing] = useState(false)
  // Derived state (set during render): the render that leaves the start
  // screen already has `layout` on, so Motion animates that very change.
  if (wasStart !== startScreen) {
    setWasStart(startScreen)
    setMorphing(wasStart && !startScreen && !reduced)
  }
  const on = !reduced && (startScreen || morphing)
  return {
    frame: {
      layout: on,
      transition: reduced ? INSTANT : COMPOSER_MORPH_SPRING,
      onLayoutAnimationComplete: morphing ? () => setMorphing(false) : undefined
    },
    content: {
      layout: on ? 'position' : false,
      transition: reduced ? INSTANT : COMPOSER_MORPH_SPRING
    }
  }
}

/**
 * An exiting start-screen part is inert, so focus and clicks never land in it.
 * It forwards its ref: `AnimatePresence mode="popLayout"` needs it to take the
 * exiting part out of the flow at once (else the transcript waits under the
 * exiting hero, then jumps up when it unmounts).
 */
const StartScreenPart = forwardRef<
  HTMLDivElement,
  { reduced: boolean; className?: string; children: ReactNode }
>(function StartScreenPart({ reduced, className, children }, ref) {
  const isPresent = useIsPresent()
  return (
    <motion.div
      ref={ref}
      data-chat-start-part={isPresent ? 'present' : 'exiting'}
      // React 18 has no boolean `inert`; an empty string sets the attribute.
      {...(isPresent ? {} : { inert: '' })}
      className={className}
      initial={false}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduced ? { opacity: 0, transition: INSTANT } : { opacity: 0, scale: 0.98 }}
      transition={START_EXIT}
    >
      {children}
    </motion.div>
  )
})

/** The ASCII glow under the start screen; it fades out on the first send. */
export function ChatStartGlow({
  show,
  reduced
}: {
  show: boolean
  reduced: boolean
}): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        // -z-10 inside the panel's isolated root keeps it under the hero and the composer.
        <motion.div
          key="chat-start-glow"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduced ? INSTANT : GLOW_EXIT}
        >
          <AsciiGlow />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * The region above the composer: the hero while the chat is empty, the
 * transcript after. On desktop the empty state is the top part of the start
 * block (CHAT_START_TOP_CLASS); the mobile shell keeps the hero above the
 * bottom-docked composer.
 */
export function ChatTimelineStage({
  isEmptyChat,
  isMobileShell,
  reduced,
  hero,
  children
}: {
  isEmptyChat: boolean
  isMobileShell: boolean
  reduced: boolean
  hero: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const startLayout = isEmptyChat && !isMobileShell
  return (
    <div
      data-chat-timeline-stage={isEmptyChat ? 'start' : 'timeline'}
      className={cn(
        'relative flex min-h-0 flex-col',
        startLayout ? CHAT_START_TOP_CLASS : 'flex-1'
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {isEmptyChat ? (
          <StartScreenPart
            key="chat-start-hero"
            reduced={reduced}
            className={startLayout ? 'w-full' : 'flex min-h-0 flex-1 flex-col'}
          >
            {hero}
          </StartScreenPart>
        ) : (
          <motion.div
            key="chat-timeline"
            className="relative flex min-h-0 flex-1 flex-col"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? INSTANT : TIMELINE_ENTER}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Under an empty chat's composer (desktop): the context row, then the bottom
 * part of the start block. The row exits in place on the first send.
 */
export function ChatStartFooter({
  show,
  reduced,
  row
}: {
  show: boolean
  reduced: boolean
  row: ReactNode
}): React.JSX.Element {
  return (
    <>
      <AnimatePresence initial={false} mode="popLayout">
        {show ? (
          <StartScreenPart
            key="chat-start-row"
            reduced={reduced}
            className={cn(CHAT_GUTTER_X, 'w-full')}
          >
            <div className={cn('mx-auto w-full', CHAT_START_COLUMN_CLASS)}>{row}</div>
          </StartScreenPart>
        ) : null}
      </AnimatePresence>
      {show ? <ChatStartBottomSpacer /> : null}
    </>
  )
}
