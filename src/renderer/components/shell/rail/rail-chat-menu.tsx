import type { ReactNode } from 'react'
import { ReloadChatMenuItem } from '@/components/chat/ReloadChatMenuItem'
import { Columns2, Copy, Edit, FolderOpen, Hash, Terminal, Trash2 } from '@/components/icons'
import type { ProjectChatEntry } from '@/components/sidebar/project-chat-row'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import type { ChatRowMenuActions } from '../use-chat-row-menu-actions'

const ICON = 'mr-2 size-3.5'

interface RailChatMenuProps {
  entry: ProjectChatEntry
  actions: Omit<ChatRowMenuActions, 'onDelete'>
  /** Opens the delete confirm. The menu never deletes by itself. */
  onRequestDelete: (entry: ProjectChatEntry) => void
  /** Quick chats only: store a local alias. */
  onRename?: (entry: ProjectChatEntry) => void
  onOpenChange?: (open: boolean) => void
  /** The row's `RailChatRowFrame` (`asChild` trigger). */
  children: ReactNode
}

/**
 * The right-click menu of a Rail chat row (Paper "Chat row menu"): reload and
 * split, then the chat's folder (terminal, file manager, path), then its
 * reference and id, then Delete chat behind a confirm. A chat with no cwd
 * keeps the folder items, disabled.
 */
export function RailChatMenu({
  entry,
  actions,
  onRequestDelete,
  onRename,
  onOpenChange,
  children
}: RailChatMenuProps): React.JSX.Element {
  const { cwd } = entry
  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56" data-testid="rail-chat-menu">
        <ReloadChatMenuItem sessionId={entry.id} iconClassName="size-3.5" />
        <ContextMenuItem onSelect={() => actions.onOpenInSplit(entry)}>
          <Columns2 className={ICON} /> Open in split
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!cwd} onSelect={() => void actions.onOpenTerminal(entry)}>
          <Terminal className={ICON} /> Open terminal here
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!cwd}
          onSelect={() => {
            if (cwd) void actions.onOpenInFileExplorer(cwd)
          }}
        >
          <FolderOpen className={ICON} /> Open in file explorer
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!cwd}
          onSelect={() => {
            if (cwd) void actions.onCopyPath(cwd)
          }}
        >
          <Copy className={ICON} /> Copy path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void actions.onCopyChatReference(entry)}>
          <Copy className={ICON} /> Copy chat reference
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void actions.onCopyChatId(entry)}>
          <Hash className={ICON} /> Copy chat ID
        </ContextMenuItem>
        <ContextMenuSeparator />
        {onRename && (
          <ContextMenuItem onSelect={() => onRename(entry)}>
            <Edit className={ICON} /> Rename
          </ContextMenuItem>
        )}
        <ContextMenuItem variant="destructive" onSelect={() => onRequestDelete(entry)}>
          <Trash2 className={ICON} /> Delete chat
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
