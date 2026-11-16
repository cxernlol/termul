import { useMemo } from 'react'
import { ChatEntryIcon } from '@/components/chat/ChatHistoryEntryRow'
import { logShellEvent } from '@/components/shell/shell-log'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { quickSessions, UNTITLED_HOST_TITLE } from '@/lib/acp-history-persistence'
import { openNoProjectHistoryChat } from '@/lib/no-project-chat'
import { useAcpStore } from '@/stores/acp-store'

/** At most this many quick chats in the palette. The Rail lists all of them. */
export const PALETTE_QUICK_CHATS_LIMIT = 5

interface CommandPaletteQuickChatsProps {
  /** The palette query; a quick chat matches it as a case-insensitive title substring. */
  query: string
  /** Closes the palette before the chat opens. */
  onDone: () => void
}

/**
 * Command palette "Quick chats" group: quick chats (no project) whose title
 * contains the query, newest first. A quick chat belongs to no project, so the
 * group does not depend on the active project, unlike "Chats". Picking one
 * opens it in the quick view. The palette shows the group only while there is
 * a query.
 */
export function CommandPaletteQuickChats({
  query,
  onDone
}: CommandPaletteQuickChatsProps): React.JSX.Element | null {
  const sessionIndex = useAcpStore((state) => state.sessionIndex)
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return quickSessions(sessionIndex)
      .filter((entry) => (entry.title || UNTITLED_HOST_TITLE).toLowerCase().includes(needle))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, PALETTE_QUICK_CHATS_LIMIT)
  }, [sessionIndex, query])

  if (matches.length === 0) return null
  return (
    <CommandGroup heading="Quick chats">
      {matches.map((entry) => {
        const title = entry.title || UNTITLED_HOST_TITLE
        return (
          <CommandItem
            key={entry.id}
            // cmdk ranks items and groups by how well the value matches, from
            // its start: the title comes first, so a close title match ranks
            // above loose command matches. The id keeps two chats with one
            // title apart.
            value={`${title} quick-chat:${entry.id}`}
            keywords={[title, 'quick chat']}
            onSelect={() => {
              logShellEvent(`palette open quick chat ${entry.id}`)
              onDone()
              openNoProjectHistoryChat(entry.id, 'quick', 'palette.quick-chats')
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 data-[selected='true']:bg-foreground/[0.06] data-[selected=true]:text-foreground"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-foreground/[0.03] text-muted-foreground">
              <ChatEntryIcon
                agentId={entry.agentId}
                agentConfigId={entry.agentConfigId}
                agents={entry.agents}
              />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium leading-5">{title}</span>
              <span className="truncate text-2xs leading-4 text-muted-foreground">Quick chat</span>
            </span>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
