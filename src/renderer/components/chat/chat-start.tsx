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
 * 3. ChatStartBottomSpacer: a 44px basis (the tab bar height) that takes
 *    the other half.
 *
 * Equal growth from both bases centres the block, so the hero and the
 * composer sit at the same y in the launcher and in an empty chat. The
 * spacer's 44px basis moves the block 22px up: the pane starts under the
 * 44px tab bar, so this centres the block in the app window, not in the
 * pane (decided with the design owner, 2026-11-16). When the height is
 * tight the spacer shrinks first, down to 0. Desktop only: on the mobile
 * web shell the composer stays at the bottom.
 */
export const CHAT_START_TOP_CLASS =
  'flex w-full min-w-0 flex-[1_1_auto] flex-col items-center justify-end'

/** Bottom part of the start block (see CHAT_START_TOP_CLASS). */
export function ChatStartBottomSpacer(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      data-chat-start-spacer="true"
      className="min-h-0 w-full flex-[1_1_44px]"
    />
  )
}

/**
 * Phone empty chat and launcher (Paper "2.6g"): the hero sits in the middle of
 * the space between the header and the composer, 28px of that space kept
 * under it. The space scrolls if the keyboard leaves too little room.
 */
export const CHAT_START_PHONE_HERO_CLASS =
  'flex min-h-0 w-full flex-1 flex-col items-center justify-center px-5 pb-7'

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
 * The mark + project question. On the mobile web shell it keeps the same
 * size (Paper "2.6g": 56px mark, 22/28 question, 20px apart) and its host
 * centres it in the space above the composer (`CHAT_START_PHONE_HERO_CLASS`);
 * during a launcher exit it dissolves upward.
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
        'flex w-full flex-col items-center gap-5 text-center transition-[opacity,translate,filter] duration-200 ease-out motion-reduce:transition-none',
        // Desktop: 24px to the composer under it. Phone: the host centres it.
        !isMobileShell && 'mb-6',
        isExiting && !reducedMotion && '-translate-y-2 opacity-0 blur-[2px]'
      )}
    >
      <TermulMark size={56} className="text-secondary-foreground" />
      <Heading className="break-words text-hero font-normal leading-7 tracking-[-0.015em] text-foreground">
        {quick ? 'What should we do?' : `What should we do in ${projectLabel}?`}
      </Heading>
    </div>
  )
}
