# Sidebar V2: handoff checklist

Status: design final (2026-11-14). Implemented in steps P1 to P5 (2026-11-15). The checklist ticks what the code has; the "Code now" columns show the code before P1.
Design source: Paper file "Termul Design System", page **Troupe Design - V2** (rows 1 and 2), and the **Shell** page, board **Sidebar**.

Scope: the shell rail in its expanded and collapsed states, the hover panels of the collapsed rail, and the open workspace tab label. `AGENTS.md` asks to check every surface: the browser client renders the same rail, so check it too.

## Final frames

| Frame | What it shows |
|---|---|
| `2.2 New chat / ASCII glow (MAIN SCREEN)` | Expanded sidebar, final reference |
| `2.3 New chat / Collapsed sidebar` | Collapsed rail, 1:1 with the expanded sidebar |
| `2.4 New chat / Collapsed, hover chat` | Hover a chat icon: chat list peek |
| `2.5 New chat / Collapsed, hover project` | Hover a project icon: project card |
| `2.6 New chat / Collapsed, hover nav` | Hover a nav icon: tooltip with shortcut |
| `1.2 Shell / Collapsed sidebar` | Collapsed rail on a working chat |

All other V2 screens use the same expanded sidebar. The old icon-stack collapsed rail is archived ("Old · New chat, collapsed icon rail (not chosen)").

## Decisions

| Topic | Decision |
|---|---|
| Shortcut hints | Removed from the nav rows (no ⌘N, no ⌃K Kbd). The shortcut shows in the hover tooltip. |
| Text colour | Nav rows, project names and chat titles use `secondary-foreground`. Troupe logos stay `foreground`. |
| Open tab label | The open workspace tab label uses `secondary-foreground` (was `foreground`). |
| Collapsed rail | The expanded sidebar with the labels removed. Each icon keeps its y position. |
| Hover | Hover on a collapsed icon opens a panel next to the rail that shows what the icon stands for. |
| Change count badge | Blue `CountBadge` (`primary-fill`), as in code. |

## Spec: expanded sidebar (width 248)

| Part | Value | Code now |
|---|---|---|
| Nav section | padding 8 / 8 / 10, row gap 1 | — |
| Nav row | height 28, inset 12 / 12, icon–label gap 8, icon 14, text 12/16 `secondary-foreground` | `RailRow`: `h-8`, `RAIL_ROW_INSET_CLASS` `gap-2 px-2`, icon box `size-4`, Kbd chip |
| Section header ("Projects") | height 40, padding-top 12, label inset 18, `muted-foreground` 12/16 | `rail-section-header.tsx` |
| Project list | padding-top 2, inset 8, row gap 1 | `project-list.tsx` |
| Project row | height 30, inset 12 / 12, icon 16, gap 8 | `project-item.tsx`: `h-8 … text-xs` |
| Chats under a project | group padding-bottom 4, row gap 1 | — |
| Chat row | height 30, indent 35 (icon under the project name), right 12, gap 9 | `project-chat-row.tsx` |
| "Show N more" | height 28, indent 56 | — |
| Open chat row | keycap: `muted` fill + `inset 0 1px 0 #E5E5E614, 0 1px 2px #00000040` | — |
| Long titles | no "…": fade over the last 24px (`mask-image: linear-gradient(to right, black calc(100% - 24px), transparent)`), text box fills the row | `truncate` |
| Footer | 4 icon buttons, 32 box, icon 14 | `RailFooter.tsx` |

## Spec: collapsed rail (width 48, `COLLAPSED_WIDTH`)

| Part | Value |
|---|---|
| Structure | Same rows and the same vertical metrics as the expanded sidebar. Labels, meta and status hidden. Each row is a 28px wide fill at x = 14..42 (`RAIL_COLLAPSED_ROW_CLASS`), on the icon column: a 16px icon stays at x = 20, where the expanded row draws it, so icons do not move on a toggle. The section divider and the footer align to the same column. |
| Toggle motion | `rail/rail-motion.ts`, CSS only (collapsible-sidebar pattern). Width: 200ms `ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`) both ways. Collapse: the rows keep their expanded layout while labels and meta fade out (150ms, `opacity` + `display` with `allow-discrete`), then the collapsed parts fade in (150ms). Expand: the expanded rows mount at once and labels fade in from `@starting-style` (150ms). The phase is `data-rail-motion` on the Rail nav. No transition under reduced motion or during a resize drag. |
| Header row (44) | Only the macOS traffic lights. The open-sidebar toggle sits in the tab bar right of them (tab bar padding-left 24). |
| Nav icons | Same y as expanded: 65 / 94 / 123 / 152 (row centres, from the window top). |
| "Projects" header | A 20×1 divider in `border`, at the header y. |
| Projects and chats | Project icon and agent icon at the row y. The open chat stays raised (keycap). "Show N more" becomes "···". |
| SSH section | Hidden. |
| Footer | Icons stack upward from the bottom (column-reverse, gap 4). Settings keeps its place at the bottom. |

Code now: `RailCollapsed.tsx` draws a different stack (project stack card, Chats button, Actions, Pinned). It must change to the 1:1 layout above.

## Spec: hover panels (collapsed rail only)

| Panel | Trigger | Content | Position |
|---|---|---|---|
| Chat list peek | a chat icon | the project row + all its chat rows, with titles and status (spinner, New, Needs you); hovered row has the hover fill; open chat keycap | x = 52 (rail + 4); rows at the same y as the rail icons |
| Project card | a project icon | the project row: name + diff stat | x = 52, row at the icon y |
| Nav tooltip | a nav icon | label + shortcut Kbd (keycap) | x = 52, centred on the icon; height 28 |

Surface: `popover` fill, radius 10 (tooltip 8), 0.5px edge (`#38393A` until a token exists), shadow `0 1px 2px #00000099, 0 4px 8px -4px #00000080`, padding 4, row gap 1. Hovered rail icon: `color-mix(in oklab, var(--foreground) 6%, transparent)`, radius 6. Motion: use the existing tooltip motion; no new curve.

Code now: `RailRow` shows a `Tooltip` with label + hint. The chat peek and the project card are new.

## Open workspace tab

| Part | Value | Code |
|---|---|---|
| Open tab label | `secondary-foreground` | `WorkspaceTabBar.tsx` |

## Checklist

- [x] Expanded rail rows: heights, insets, 1px gaps, 14px nav icons, no Kbd chips
- [x] Text colours: `secondary-foreground` for nav, project and chat labels
- [x] Long titles fade instead of "…" (rows only; multi-line keeps line-clamp)
- [x] Collapsed rail rebuilt as 1:1 with the expanded rail (`RailBody.tsx` with `rail-density.tsx`; `RailCollapsed.tsx` is removed)
- [x] Open-sidebar toggle in the tab bar, right of the traffic lights, when collapsed
- [x] Hover chat peek, project card, nav tooltip with shortcut
- [x] Open tab label `secondary-foreground`
- [ ] Browser client checked in a real browser (code review and the parity checklist pass; P1 was checked in the browser, P2–P5 not yet)
- [x] Durable logs for new flows if any are added (`src/renderer/lib/log-api.ts`)
- [ ] Light theme checked (design is dark only)

### P4: what moved out of the removed panels

The Side panel Chats tab, its header Workspace switcher and the StatusBar are gone (P1 to P3). P4 gives their remaining jobs a place:

- [x] Worktree switch: the project row menu (right-click, Shift+F10 or the context-menu key, or the row "…" button on the expanded rail) has "Switch worktree…". It opens the working copies popover on the row (`shell/rail/worktree-switcher.tsx`: search, create, a terminal action per row). The pick stays in `shell-layout-store.worktreePickByProject`.
- [x] Worktree chip: a muted chip under the project name with the picked worktree, only when the pick is not the project folder. The collapsed rail keeps its line (18px) with a branch glyph, so the icons keep their y; the chat peek repeats the chip.
- [x] StatusBar information (git counts, cwd, exit code, needs-you pill) is dropped. The context bar settings (popover, store, loader) are removed; a stored `settings/context-bar` value is not read.
- [x] Shell picker: right-click, Shift+F10 or the context-menu key on the tool strip Terminal button lists the detected shells (default first); a pick opens a terminal tab with that shell. A click opens the default shell. The tooltip says "Right-click for other shells".
- [x] Windows and Linux window controls: in the window's top-right corner, above the tool strip (the strip starts 44px lower). The top row surface on their left (right panel header when the panel is open, else the tab bar, SSH header or fallback bar) ends with a 76px drag spacer. macOS is unchanged.
- [x] Chat search: the command palette has a "Chats" group while there is a query. It searches every chat of the open project (title, agent, branch, model) and opens the picked chat. The rail "Search" row opens the palette.
- [x] Import chats: an item in the Projects `+` menu, for the open project's working copy (disabled with the reason on a read-only server).
- [x] Every project lists its chats under its row, open or not, each with its own chevron (hover or focus the project icon) that collapses or expands the list. The state is kept per project (`chatsHiddenByProject`), so a project switch leaves every list as the user left it. A click on another project's row only opens that project; a click on the open project's row also toggles its list. Opening a chat of another project switches to that project first (`openAgentChatInOwnProject`), and so does its row menu's "Open terminal here" (`openProjectThen`, then the spawn). Only the open project's chat rows drag into a pane: a pane refuses another project's chat, so its drop zones do not light up for one.
- [x] Tab bar `+` menu (`workspace/NewTabMenu.tsx`), back after its removal in #1856: New chat, New terminal (the default shell), New terminal with › (the detected shells) and New browser tab (desktop only), each in that bar's pane. The openers come from `WorkspaceLayout` through `NewTabActionsProvider`. Plain New terminal uses the shell the submenu marks Default. Shells are detected once for every menu and the tool strip, on first use; a failed detection shows "Could not detect shells. Try again" and runs again on the next open. The shortcut hints show only in the active pane's menu (they act on the active pane). While a project switch is in flight (the selected project's tree is not on screen yet) the items are disabled, and every opener checks the pane against the committed project (`lib/pane-target.ts`), so a chat or terminal never lands in another project's pane; a terminal whose project was left during its start goes to that project's parked tree. The phone has no tab bar and is unchanged.
- [x] Durable logs: worktree switch from the rail, shell picked from the strip, chat import started, chat opened from the palette.
- [ ] Paper has no frame for the worktree chip, the row "…" button or the shell menu yet.

### P5: phone, browser parity, clean-up

- [x] Phone: the phone shell mounts no Rail, tool strip or right panel (`WorkspaceLayout.mobile.test.tsx`, e2e `mobile-drawer-home`).
- [x] Phone drawer chat rows use the Rail live state (`useChatLiveState`) and the Rail trail (`ChatRowTrail`): one status per chat (Needs you, then Running, then New), the same as the desktop Rail. The rows keep their layout and the created time. `AgentChatStatusGlyphs` and `agentChatStatusSlots` are removed.
- [x] Browser client (desktop width): the tool strip has no Remote access and no Browser button (browser tabs are native webviews; the palette command and the shortcut are gated the same way); it shows the connection lamp. Covered by `ShellToolStrip.test.tsx` and the parity checklist.
- [x] Parity checklist: tool strip gating, the palette Chats group and the Projects menu Import item.
- [x] E2E specs use the V2 UI: Rail chat rows (`rail-project-chats`), tool strip buttons, the command palette Chats group, Rail chat row drag for splits. Helpers in `tests/e2e/ui.ts`: `railChat`, `showAllRailChats`, `openRightPanelView`.
- [x] Orphans removed: the `icon` variant of `ImportChatsButton`, `ProjectSwitcher`, `sidebar-search-field`.
- [x] Chat drag: Rail chat rows (expanded rows, collapsed icons and the hover chat peek rows) drag onto a pane edge to split, or into a pane to open the chat there (`startChatDrag`, the same payload as the old Chats cards). The dragged row is 50% opacity and 98% scale, the same as a dragged tab (no scale and no transition with reduced motion). A click right after the drag does not open the chat. A drag from the peek closes the peek; the peek stays mounted (hidden) until the drag ends. Durable log: `[rail] drag chat <id>` (source `Rail`). Covered by `RailProjectChats.test.tsx` and the e2e Journey 1 split step.

### New chat: one way to start a chat

Decision (2026-11-15): a chat starts as a new EMPTY CHAT. The agent launcher overlay does not start chats from the entry points.

- [x] Every entry point calls `openNewChat` (`components/chat/new-chat/open-new-chat.ts`): the Rail New chat row, Ctrl+T (shortcut `newTerminal`), the tab bar `+` menu, the command palette "New chat", the phone header and drawer New chat, the stopped-chat New chat, the launcher's worktree failure and the GitHub hand-off with no agent.
- [x] The chat tab opens at once on a launch placeholder (`launchChat`, the launcher's path) on the last picked agent (`agents/last-selected`) with its saved model, mode and option values (`lastComposerOptions`). The working copy is the Workspace-switcher pick, else the project root. A message typed before the session is ready waits in the queue. A start failure shows in the chat with Retry.
- [x] When the active pane already shows an empty chat of the project, New chat focuses it.
- [x] Web (#840 / #907): only a configured agent starts. A catalog agent that nobody configured never spawns.
- [x] The empty chat's context row (frame 2.2, "New worktree ▾ · from dev ▾") is interactive in a git project: Current checkout, Existing worktree, New worktree and the base branch. Nothing moves while the user picks. The first send applies the pick (`sendFromChatStart`): Current checkout or an existing worktree starts the still-empty chat again in that folder; New worktree makes the worktree first, with the progress card in the timeline. The new chat keeps the tab, the message, the agent and the options. The pick is saved in `lastComposerOptions` (isolationMode, baseBranch) like the launcher saved it. A read-only server shows New worktree disabled with the reason.
- [x] The launcher stays only as a fallback for states a chat cannot show: no agent can start (none configured, none installed, the last pick needs an install), and a sign-in (an auth failure at start, the Codex "Sign in" action, the Codex CLI logout). A pane with no tabs still shows the launcher as its content.
- [x] Durable logs: source `chat.openNewChat` (each start with its reason, focus, fallback) and `chat.sendFromChatStart` (a pick applied on send).
- [ ] Phone: the context row is desktop only, so a phone chat starts in the switcher pick and has no worktree pick.

## Open items

- The collapsed rail shows a status dot on the agent icon (P2).
- The design shows a dark theme only. Light-theme values come from the same tokens.
