import { useMemo } from 'react'
import { ChatEntryIcon } from '@/components/chat/ChatHistoryEntryRow'
import { filterChatCards, modelLineOf } from '@/components/shell/chat-cards'
import { logShellEvent } from '@/components/shell/shell-log'
import { useChatCardActions } from '@/components/shell/use-chat-card-actions'
import { useProjectChatCards } from '@/components/shell/use-project-chats'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import type { Project } from '@/types/project'

interface CommandPaletteChatsProps {
  project: Project
  /** The palette query; the chats match it as a case-insensitive substring. */
  query: string
  /** Closes the palette before the chat opens. */
  onDone: () => void
}

/**
 * Command palette "Chats" group (Sidebar V2): every chat of the active
 * project, whatever the worktree pick, matched by title, agent, branch or
 * model (`filterChatCards`). Picking one opens or focuses its tab. The
 * palette shows the group only while there is a query.
 */
export function CommandPaletteChats({
  project,
  query,
  onDone
}: CommandPaletteChatsProps): React.JSX.Element | null {
  const { onOpen } = useChatCardActions()
  const cards = useProjectChatCards(project, null)

  const matches = useMemo(() => filterChatCards(cards, query), [cards, query])

  if (matches.length === 0) return null
  return (
    <CommandGroup heading="Chats">
      {matches.map((card) => {
        const { entry, agentName, branch } = card
        return (
          <CommandItem
            key={entry.id}
            // cmdk identifies an item by its value: the id keeps two chats with
            // one title apart. The keywords hold the matched fields, so cmdk
            // keeps every chat `filterChatCards` let through.
            value={`chat:${entry.id}`}
            keywords={[entry.title, agentName ?? '', branch, modelLineOf(card)].filter(Boolean)}
            onSelect={() => {
              logShellEvent(`palette open chat ${entry.id}`)
              onDone()
              onOpen(entry)
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
              <span className="truncate text-xs font-medium leading-5">{entry.title}</span>
              {(agentName || branch || entry.startedByLabel) && (
                <span className="truncate text-2xs leading-4 text-muted-foreground">
                  {[agentName, branch, entry.startedByLabel].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
