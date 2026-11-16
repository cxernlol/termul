import { TermulMark } from '@/components/TermulMark'
import { cn } from '@/lib/utils'

/*
 * The start block's layout rule: the block (hero, composer, context row) is
 * centred in the free height, the same space above and below (decided with
 * the design owner, 2026-11-15; Paper 2.2 sat it 42px above the middle).
 * Both surfaces build it from the same three parts, top to bottom:
 *
 * 1. CHAT_START_TOP_CLASS: the region above the composer. Its basis is its
 *    content (the hero), and it takes half of the free space.
 * 2. The composer (card + context row), no padding above or below.
 * 3. ChatStartBottomSpacer: a zero basis that takes the other half.
 *
 * Equal growth from both bases centres the block, so the hero and the
 * composer sit at the same y in the launcher and in an empty chat. Desktop
 * only: on the mobile web shell the composer stays at the bottom.
 */
export const CHAT_START_TOP_CLASS =
  'flex w-full min-w-0 flex-[1_1_auto] flex-col items-center justify-end'

/** Bottom part of the start block (see CHAT_START_TOP_CLASS). */
export function ChatStartBottomSpacer(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      data-chat-start-spacer="true"
      className="min-h-0 w-full flex-[1_1_0px]"
    />
  )
}

/** Start-screen composer column (Paper: 680px wide). */
export const CHAT_START_COLUMN_CLASS = 'max-w-[680px]'

/**
 * Start-screen composer input area (Paper: pt 12, pr 8, pb 4, pl 14, gap 4)
 * and its text area height: 40px min, then it grows to 160px and scrolls.
 */
export const CHAT_START_INPUT_ROW_CLASS = 'gap-1 pb-1 pl-3.5 pr-2 pt-3'
export const CHAT_START_INPUT_MIN_HEIGHT = 40
export const CHAT_START_INPUT_MAX_HEIGHT = 160

/**
 * The chat start screen ("Empty chat · V1 Composer in the middle"), shared by
 * the agent launcher (before a session exists) and an empty chat (a session
 * with no messages yet): the Troupe mark, one project question and the
 * composer under it (each surface keeps its own composer). One source of
 * truth for this copy and this spacing (Paper "2.2 New chat / ASCII glow":
 * 56px mark, 20px to a 22/28 heading, 24px to the composer). A quick chat
 * asks the same question without a project name.
 *
 * The mark + project question. On the mobile web shell it shrinks so the
 * bottom-anchored composer stays above the fold; during a launcher exit it
 * dissolves upward.
 */
export function ChatStartHero({
  projectLabel,
  headingLevel = 1,
  isMobileShell = false,
  isExiting = false,
  reducedMotion = false,
  quick = false
}: {
  projectLabel: string
  /** 1 in the launcher (the pane's main heading); 2 inside a chat tab. */
  headingLevel?: 1 | 2
  isMobileShell?: boolean
  isExiting?: boolean
  reducedMotion?: boolean
  /** A chat with no project. The question does not name a folder. */
  quick?: boolean
}): React.JSX.Element {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <div
      className={cn(
        'mb-6 flex w-full flex-col items-center gap-5 text-center transition-[opacity,translate,filter] duration-200 ease-out motion-reduce:transition-none',
        isMobileShell && 'mb-4 gap-2',
        isExiting && !reducedMotion && '-translate-y-2 opacity-0 blur-[2px]'
      )}
    >
      <TermulMark size={isMobileShell ? 32 : 56} className="text-secondary-foreground" />
      <Heading
        className={cn(
          'break-words text-hero font-normal leading-7 tracking-[-0.015em] text-foreground',
          isMobileShell && 'text-xl'
        )}
      >
        {quick ? 'What should we do?' : `What should we do in ${projectLabel}?`}
      </Heading>
    </div>
  )
}
