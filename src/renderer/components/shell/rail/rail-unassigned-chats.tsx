import { useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Chat, ChevronDown, ChevronRight } from '@/components/icons'
import { ChatRowTrail, type ProjectChatEntry } from '@/components/sidebar/project-chat-row'
import { RailSectionHeader } from '@/components/sidebar/rail-section-header'
import { FIELD_FOCUS_CLASS, FOCUS_RING_CLASS } from '@/components/ui/panel-styles'
import { acpRenameQuickChat } from '@/lib/acp-api'
import type { SessionIndexEntry } from '@/lib/acp-history-persistence'
import { olderChats, quickSessions, UNTITLED_HOST_TITLE } from '@/lib/acp-history-persistence'
import { isContextMenuKey, openContextMenuFrom } from '@/lib/context-menu-key'
import { logFrontendError } from '@/lib/log-api'
import { cn } from '@/lib/utils'
import { useAcpStore } from '@/stores/acp-store'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { RAIL_ICON_BOX_CLASS, RAIL_ROW_INSET_CLASS } from '../rail-layout'
import { logRailEvent } from '../shell-log'
import { type ChatRowMenuActions, useChatRowMenuActions } from '../use-chat-row-menu-actions'
import { useChatLiveState } from '../use-project-chats'
import { RailChatMenu } from './rail-chat-menu'
import {
  RailChatGroup,
  RailChatItem,
  RailChatList,
  RailChatRow,
  RailChatRowFrame,
  RailChatRowMore,
  RailChatStatusDot,
  RailChatTitle,
  RailChatTrailSlot,
  RailShowMore
} from './rail-chats'
import { RailDensityProvider, useRailCollapsed } from './rail-density'
import {
  RailHoverPanel,
  RailHoverPanelContent,
  RailHoverPanelProjectRow,
  RailHoverPanelTrigger
} from './rail-hover-panel'

/** Newest first. A missing time sorts last. */
function newestFirst(entries: SessionIndexEntry[]): SessionIndexEntry[] {
  return entries.slice().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

function toEntry(chat: SessionIndexEntry): ProjectChatEntry {
  return {
    id: chat.id,
    title: chat.title || UNTITLED_HOST_TITLE,
    messageCount: chat.messageCount,
    status: chat.status,
    discovered: chat.discovered === true,
    agentId: chat.agentId,
    agentConfigId: chat.agentConfigId,
    agents: chat.agents,
    cwd: chat.cwd,
    lastActivityAt: chat.lastActivityAt,
    createdAt: chat.createdAt,
    canOpen: true
  }
}

interface ChatListProps {
  chats: SessionIndexEntry[]
  label: string
  openId: string | null
  peek?: boolean
  rename?: boolean
  editingId: string | null
  draft: string
  onDraft: (value: string) => void
  onOpen: (id: string) => void
  onRenameStart: (entry: ProjectChatEntry) => void
  onRenameSave: (id: string) => void
  onRenameCancel: () => void
  onRequestDelete: (entry: ProjectChatEntry) => void
}

/** The chat rows, shared by the Rail and its collapsed hover peek. */
function ChatList({
  chats,
  label,
  openId,
  peek = false,
  rename = false,
  editingId,
  draft,
  onDraft,
  onOpen,
  onRenameStart,
  onRenameSave,
  onRenameCancel,
  onRequestDelete
}: ChatListProps): React.JSX.Element {
  const collapsed = useRailCollapsed()
  const { onDelete: _deleteAfterConfirm, ...menuActions } = useChatRowMenuActions('')
  const entries = useMemo(() => chats.map(toEntry), [chats])
  const openIndex = entries.findIndex((entry) => entry.id === openId)
  const showRenameField = (id: string): boolean => editingId === id && (!collapsed || peek)

  return (
    <RailChatGroup
      total={entries.length}
      pinnedIndex={openIndex === -1 ? undefined : openIndex}
      data-testid={peek ? undefined : 'rail-unassigned-chats'}
    >
      <RailChatList aria-label={label}>
        {entries.map((entry, index) => (
          <RailChatItem key={entry.id} index={index}>
            {showRenameField(entry.id) ? (
              <input
                aria-label={`Rename ${entry.title}`}
                className={cn(
                  'mx-2 h-7.5 min-w-0 w-[calc(100%-1rem)] rounded-md border border-border bg-background px-2 text-xs text-foreground pointer-coarse:text-base',
                  FIELD_FOCUS_CLASS
                )}
                value={draft}
                ref={(node) => node?.focus()}
                onChange={(event) => onDraft(event.target.value)}
                onBlur={() => onRenameSave(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onRenameSave(entry.id)
                  if (event.key === 'Escape') onRenameCancel()
                }}
              />
            ) : (
              <UnassignedChatRow
                entry={entry}
                open={entry.id === openId}
                collapsed={collapsed}
                rename={rename}
                menuActions={menuActions}
                onOpen={onOpen}
                onRenameStart={onRenameStart}
                onRequestDelete={onRequestDelete}
              />
            )}
          </RailChatItem>
        ))}
      </RailChatList>
      <RailShowMore className={collapsed ? undefined : 'pl-9'} />
    </RailChatGroup>
  )
}

function UnassignedChatRow({
  entry,
  open,
  collapsed,
  rename,
  menuActions,
  onOpen,
  onRenameStart,
  onRequestDelete
}: {
  entry: ProjectChatEntry
  open: boolean
  collapsed: boolean
  rename: boolean
  menuActions: Omit<ChatRowMenuActions, 'onDelete'>
  onOpen: (id: string) => void
  onRenameStart: (entry: ProjectChatEntry) => void
  onRequestDelete: (entry: ProjectChatEntry) => void
}): React.JSX.Element {
  const { liveState, statusWord } = useChatLiveState(entry.id)
  return (
    <RailChatMenu
      entry={entry}
      actions={menuActions}
      onRename={rename ? onRenameStart : undefined}
      onRequestDelete={onRequestDelete}
    >
      <RailChatRowFrame>
        <RailChatRow
          open={open}
          title={collapsed ? undefined : entry.title}
          aria-label={statusWord ? `${entry.title}, ${statusWord}` : entry.title}
          className={collapsed ? undefined : RAIL_ROW_INSET_CLASS}
          onClick={() => onOpen(entry.id)}
          onKeyDown={(event) => {
            if (!isContextMenuKey(event)) return
            event.preventDefault()
            openContextMenuFrom(event.currentTarget)
          }}
        >
          <span
            data-rail-icon-column
            aria-hidden="true"
            className={cn(RAIL_ICON_BOX_CLASS, 'relative text-muted-foreground')}
          >
            <Chat size={16} />
            {collapsed && <RailChatStatusDot state={liveState} />}
          </span>
          <RailChatTitle>{entry.title}</RailChatTitle>
          {!collapsed && (
            <RailChatTrailSlot>
              <ChatRowTrail
                liveState={liveState}
                lastActivityAt={entry.lastActivityAt}
                closed={entry.status === 'closed'}
              />
            </RailChatTrailSlot>
          )}
        </RailChatRow>
        <RailChatRowMore
          aria-label={`More actions for ${entry.title}`}
          onClick={(event) => openContextMenuFrom(event.currentTarget)}
        />
      </RailChatRowFrame>
    </RailChatMenu>
  )
}

interface SectionProps {
  label: string
  chats: SessionIndexEntry[]
  /** Older chats start closed. Quick chats stay listed. */
  startClosed?: boolean
  readOnly?: boolean
  rename?: boolean
  testId: string
  /**
   * The section sits outside the project list's 8px inset. Add that inset
   * here so the row's `px-3` icon lands on the same column as a project row.
   */
  edgeInset?: boolean
  deleteTitle: string
  deleteMessage: (title: string) => string
}

/**
 * A Rail section of chats that have no project. Rows are the project chat
 * rows (fade, keycap, "…", show 5 then "Show N more"). Collapsed Rail: the
 * same icons, with a hover peek for the titles.
 */
function UnassignedSection({
  label,
  chats,
  startClosed = false,
  readOnly = false,
  rename = false,
  testId,
  edgeInset = false,
  deleteTitle,
  deleteMessage
}: SectionProps): React.JSX.Element | null {
  const collapsed = useRailCollapsed()
  const [open, setOpen] = useState(!startClosed)
  const [peekOpen, setPeekOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const openId = useQuickChatStore((state) => {
    if (state.view.mode !== 'chat') return null
    const older = state.view.readOnly === true
    if (readOnly !== older) return null
    return state.view.sessionId
  })
  const deleteTarget = chats.find((chat) => chat.id === deleteId) ?? null
  const listId = `${testId}-list`

  if (chats.length === 0) return null

  const onOpen = (id: string): void => {
    logRailEvent(`open ${readOnly ? 'older' : 'quick'} chat ${id}`)
    if (readOnly) useQuickChatStore.getState().openOlderChat(id)
    else useQuickChatStore.getState().openChat(id)
    void useAcpStore.getState().openHistorySession(id)
  }

  const saveRename = (sessionId: string): void => {
    const title = draft.trim()
    setEditingId(null)
    if (!title) return
    void acpRenameQuickChat(sessionId, title)
      .then(() => {
        useAcpStore.setState((state) => ({
          sessionIndex: state.sessionIndex.map((entry) =>
            entry.id === sessionId ? { ...entry, title } : entry
          ),
          sessions: state.sessions[sessionId]
            ? {
                ...state.sessions,
                [sessionId]: { ...state.sessions[sessionId], title }
              }
            : state.sessions
        }))
      })
      .catch((error: unknown) => {
        void logFrontendError({
          level: 'error',
          source: 'quick-chat.rename',
          message: `Could not rename quick chat ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
        })
      })
  }

  const listProps = {
    chats,
    label,
    openId,
    rename,
    editingId,
    draft,
    onDraft: setDraft,
    onOpen,
    onRenameStart: (entry: ProjectChatEntry) => {
      setEditingId(entry.id)
      setDraft(entry.title)
    },
    onRenameSave: saveRename,
    onRenameCancel: () => setEditingId(null),
    onRequestDelete: (entry: ProjectChatEntry) => setDeleteId(entry.id)
  }

  const rows = open ? <ChatList {...listProps} /> : null
  // A rename started from a collapsed icon has to stay in the expanded peek.
  const peek = open ? (
    <RailHoverPanel open={peekOpen || editingId !== null} onOpenChange={setPeekOpen}>
      <RailHoverPanelTrigger asChild>
        <div id={listId}>{rows}</div>
      </RailHoverPanelTrigger>
      <RailHoverPanelContent data-testid={`${testId}-peek`}>
        <RailDensityProvider density="expanded">
          <RailHoverPanelProjectRow icon={<Chat size={16} />} name={label} />
          <ChatList {...listProps} peek />
        </RailDensityProvider>
      </RailHoverPanelContent>
    </RailHoverPanel>
  ) : null

  return (
    <div className={cn('flex shrink-0 flex-col', edgeInset && 'px-2')} data-testid={testId}>
      {startClosed ? (
        <button
          type="button"
          className={cn(
            'flex h-10 w-full items-center gap-1 text-left',
            collapsed ? 'justify-center pt-3' : 'pt-3 pr-1.5 pl-2.5',
            FOCUS_RING_CLASS
          )}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={collapsed ? label : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {collapsed ? (
            <span aria-hidden="true" data-rail-section-divider className="h-px w-5 bg-border" />
          ) : (
            <>
              {open ? (
                <ChevronDown size={14} aria-hidden="true" />
              ) : (
                <ChevronRight size={14} aria-hidden="true" />
              )}
              <span className="label-panel min-w-0 truncate">{label}</span>
            </>
          )}
        </button>
      ) : (
        <RailSectionHeader label={label} />
      )}
      {/* A long "Show more" list scrolls inside the section, so the Rail keeps its rows. */}
      {collapsed ? (
        peek
      ) : (
        <div id={listId} className="min-h-0 overflow-y-auto max-h-80">
          {rows}
        </div>
      )}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title={deleteTitle}
        message={deleteTarget ? deleteMessage(deleteTarget.title || UNTITLED_HOST_TITLE) : ''}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (!deleteTarget) return
          const id = deleteTarget.id
          setDeleteId(null)
          void useAcpStore.getState().deleteHistorySession(id)
          const view = useQuickChatStore.getState().view
          if (view.mode === 'chat' && view.sessionId === id) {
            useQuickChatStore.getState().close()
          }
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

/** Quick chats under Projects. Hidden when there are none. */
export function QuickChatsGroup(): React.JSX.Element | null {
  const sessionIndex = useAcpStore((state) => state.sessionIndex)
  const chats = useMemo(() => newestFirst(quickSessions(sessionIndex)), [sessionIndex])
  return (
    <UnassignedSection
      label="Quick chats"
      chats={chats}
      rename
      testId="quick-chats-group"
      deleteTitle="Delete quick chat"
      deleteMessage={(title) =>
        `Delete “${title}”? Files the agent created in this chat’s folder are deleted too.`
      }
    />
  )
}

/** Legacy no-project chats, at the bottom of the Rail. Closed until opened. */
export function OlderChatsGroup(): React.JSX.Element | null {
  const sessionIndex = useAcpStore((state) => state.sessionIndex)
  const chats = useMemo(() => newestFirst(olderChats(sessionIndex)), [sessionIndex])
  return (
    <UnassignedSection
      label="Older chats"
      chats={chats}
      startClosed
      readOnly
      edgeInset
      testId="older-chats-group"
      deleteTitle="Delete older chat"
      deleteMessage={(title) =>
        `Delete “${title}”? This removes the chat record. Files in the original folder are kept.`
      }
    />
  )
}
