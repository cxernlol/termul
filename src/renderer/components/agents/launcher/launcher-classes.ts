/**
 * Context-row menu colors (launcher only — the shared Select primitive is
 * untouched). Neutral fills with a wider L gap: hover/open/checked use the
 * muted surface with foreground text.
 */
export const STRIP_MENU_ITEM_CLASS =
  'focus:bg-muted focus:text-foreground data-[state=checked]:bg-muted data-[state=checked]:text-foreground'

/**
 * Launcher context row under the composer (Paper "2.2 New chat"): 24px ghost
 * buttons, 12px medium secondary-foreground text, 12px icons and a muted
 * 12px chevron. The pseudo hit-extension grows only vertically (24 + 2×8 =
 * the 40px desktop floor), so neighbours 2px apart do not overlap.
 */
export const ROW_TRIGGER_CLASS =
  'relative h-6 min-h-6 w-auto shrink-0 gap-1.5 rounded-md border-0 bg-transparent px-2 py-0 text-xs font-medium text-secondary-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 data-[state=open]:bg-muted data-[state=open]:text-foreground after:absolute after:inset-x-0 after:-inset-y-2 after:content-[""] [&>svg]:size-3 [&>svg]:shrink-0 [&>svg:last-child]:text-muted-foreground [&>svg:last-child]:opacity-100'

/**
 * The context row itself (Paper "2.2 New chat"): left-aligned under the
 * composer, pt 6px, pl 2px, gap 2px. Shared by the launcher and an empty chat.
 */
export const CONTEXT_ROW_CLASS = 'flex min-w-0 max-w-full items-center gap-0.5 pl-0.5 pt-1.5'

/** A read-only item in the context row, same box as a trigger. */
export const ROW_ITEM_CLASS =
  'inline-flex h-6 min-w-0 items-center gap-1.5 px-2 text-xs text-muted-foreground'
