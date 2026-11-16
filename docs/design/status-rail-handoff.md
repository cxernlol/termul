# Status rail: implementation plan

Status: design approved (2026-11-16). Implemented on branch `feat/status-rail` (2026-11-17). One PR.
Design source: Paper file "Termul Design System", page **Subagent Pill · Explorations**, board **B2 · Status rail, top-right (refined)**. Board **I · Changes list · one file row** sets the file row. Board **F** sets the diff tab that a file click opens.

Scope: the session status pills move from a row above the composer to a vertical rail at the top right of the chat. The Changes pill gets a new popover with a file list and "Discard all". Running state changes from amber to a spinner in the whole subagent UI. `AGENTS.md` asks to check every surface: the browser client and the phone shell render the same chat, so the rail ships on all of them.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Placement | The rail replaces the row above the composer in every chat, project chats and quick chats. No flag, no setting. |
| 2 | Phone | The rail stays at the top right. Each segment has a 44px hit area. A tap opens a bottom sheet, as the pills do now. |
| 3 | Gutter | When the chat root is narrower than 892px (748 column + 2 × 72) and the rail shows, the message column, the plan panel and the restore banners get a 72px right gutter. Wide panes do not change. The gutter applies at once, with no animation. |
| 4 | Running state | A neutral spinner, not amber, in the rail, `SubagentRow` and the subagent card. Amber stays for "Needs you" and conflicts. |
| 5 | Light mode | Taken from the tokens and the tactile rules: white surface, 1px ring, 1px drop. No Paper mockup. Check both themes at 4–8× zoom. |
| 6 | Blue dot | Ships in v1. It shows when the chat's changed files differ from what the user last saw. Opening the Changes popover or the Git tab clears it. Stored per chat in local storage. |
| 7 | Plan file | This file. |
| 8 | Changes scope | Use the data that exists: the uncommitted files this chat touched (session-wide). Header copy says so: "This chat · N files, not committed". Last-turn scope is a follow-up. |
| 9 | Destructive action | "Revert turn" becomes **Discard all**, built on the existing `discardFiles`. |
| 10 | Rail anchor | Absolute in the chat root, 12px from the top and right. It does not move when the plan panel or banners change height. |
| 11 | Segment add / remove | Fade only, 150ms. The rail height changes at once. CSS only, no framer-motion. |
| 12 | Counts and marks | Counts change at once. A status mark crossfades in 150ms. The blue dot pops once. Nothing loops except the spinner. |
| 13 | Popover motion | Reuse the existing menu motion: 250ms in, 150ms out, origin from the trigger. |
| 14 | Blue dot clear | The first of: the Changes popover opens, or the Git tab shows for this folder (desktop side panel or phone Git sheet). |
| 15 | Delivery | One PR. |
| 16 | Discard scope and copy | Only the files the popover lists. Confirm in place: "Discard changes in N files? New files are deleted, and your own edits in these files go too. You can't undo this." Cancel (focused) and **Discard N files** (solid `destructive-fill`). |
| 17 | Discard guards | Disabled while a turn is active (tooltip "Stop the turn to discard"). Hidden for read-only viewers (the Git write gate). |
| 18 | Plan panel and banners | Covered by decision 3. Nothing sits under the rail in a narrow pane. |
| 19 | After discard | No toast. The panel shows "No uncommitted changes from this chat". A failure shows the panel error state with "Try again". |
| 20 | Order after discard | The Changes segment stays in the rail with count 0 while its popover is open. When the popover closes, the segment leaves with the 150ms fade. |

### Notes from the build

- Press: the code follows `docs/design/motion.md` (a chip never scales). A press changes the fill only, two steps up. The B2 "Pressed" cell shows `scale(0.97)`; update it to match.
- File icons in the Changes panel are the monochrome `File` icon in `muted-foreground` (board I: hue means added or removed lines only).
- Deleted files stay static rows: `openChangedFile` reads the file from disk, so a deleted file has nothing to open.
- Not built, no data for it: "from <old name>" for renames, "Binary", a conflict mark, a failed mark for Background (no exit code), and the muted count while Git status reloads (no refetch flag).
- Popover open time: every Radix popover in the app opens in 150ms, not the 250ms that `index.css` and `motion.md` describe. Tailwind's `animate-in` utility sets `animation-duration` and wins over the layered `[data-radix-popper-content-wrapper] > *` rule. This is app-wide and is not changed here.
- Design canvas: `design-system/src/previews/status-rail.tsx` shows the rail in a chat frame and the segment states.

## What exists today

| Area | Code now |
|---|---|
| Mount | `renderStatusChips()` in `AgentChatPanel.tsx:791-812`, used as `statusRow` on `ChatInputBar` (`:1124`, rendered at `ChatInputBar.tsx:580`) and above the question card (`:1076`). |
| Pills | `StatusChip.tsx`: `StatusChipRow`, `StatusChip` (Popover, or Sheet on the phone), `StatusChipLabel`, `StatusChipCount`, `StatusChipDot`, panel header and note. Popover `side="top" align="start"`. |
| Pills logic | `ChatStatusChips.tsx`: Subagent, Background, Changes chips; one panel open at a time (`useOpenChip`); phone sheets register `'chat-status-sheet'` for Back. |
| Changes data | `use-chat-changed-files.ts`: `ChatChangedFiles { files, rowBase, source: 'git' \| 'session', totalAdded, totalRemoved }`, session-wide. `ChangedFilesList.tsx` renders rows; deleted rows are struck through. |
| Discard | `useGitStatusStore.discardFiles(cwd, paths)` → `git_discard_file` (Rust): untracked files are deleted, other files run `git checkout -- <path>` (staged changes stay). `assertWritable(cwd)` guards it. |
| Git tab | `openChangesTab(projectId, cwd)` (`shell/column-tab-focus.ts:28`); phone: `useGitSheetStore().openGitSheet(cwd, opener)`. Open state: `useLastColumnTab(projectId) === 'changes'` and `useSidePanelVisible()`. |
| Top right of the chat root | Reconnect pill `absolute right-2 top-2 z-20` (pills are hidden while it shows); plan panel in flow at the top; restore banners; list top fade `z-10`. |
| Spinner | `ui/spinner.tsx` (`Spinner`, comet ring, pauses under reduced motion). `SubagentRow.tsx:26,33` maps `running` to `text-warning` / `bg-warning`. |
| Motion tokens | `index.css:215-243`: `--ease-out`, `--ease-smooth-out`, `--ease-bounce`, `--duration-quick` 150, `--duration-fast` 250, `--scale-medium` .97, `--scale-tiny` .99. Popper motion and its reduced-motion fade: `index.css:615-645`, `:762-773`. |

## Build steps

### 1. Rail primitives (`chat/StatusChip.tsx`)

Keep the file and the popover / sheet logic. Replace the row parts:

- `StatusRail` replaces `StatusChipRow`. `role="group"`, `aria-label="Session status"`. Absolute `top-3 right-3 z-20`, `flex flex-col p-0.5 w-[60px] rounded-2xl`. Dark: `bg-muted`, `border-[0.5px]` three steps above the fill, drop `0 1px 2px rgb(0 0 0 / .5)`. Light: `bg-card` (white), 1px ring `rgb(ink / .08)`, drop `0 1px 2px rgb(ink / .12)`. Add a semantic token for the rail edge (for example `--rail-edge`) in `index.css` for both themes. The Paper board uses a fixed `oklch(33% …)` only because Paper cannot mix two tokens.
- `StatusRailSegment` replaces the chip button. `h-7 rounded-[14px] pl-2.5 gap-1` (icon 14, count, mark slot 10). The icon and the count keep fixed lanes so they line up across segments. A 44px hit area through `after:` (as now). States:
  - rest: icon `muted-foreground`, count `foreground`, `tabular-nums`.
  - hover: fill one step up, icon `foreground`, `transition-colors duration-150 ease-out`.
  - pressed: fill two steps up, no scale (see Open item).
  - open (`data-state=open`): fill two steps up, inset 0.5px edge, icon `foreground`.
  - focus-visible: `ring-2 ring-focus-ring`.
- `StatusRailDivider`: 0.5px line, 40px wide, centred, rail edge colour. It goes with its segment: both leave together.
- `StatusMark`: one 10px slot with two stacked layers, so a change of mark crossfades without a layout change. Kinds: `spinner` (`Spinner`, 10px), `dot` with tone `failed` (`bg-destructive`) or `new` (`bg-primary-fill`), or none.
- Labels: no visible word. Each segment keeps a full `aria-label` ("Subagents: 2 working, 1 queued, 2 done") and a `Tooltip` with the same words. The Changes tooltip: "4 changed files · Open list".
- Popover: `side="left" align="start" sideOffset={8}`, so its top lines up with the segment. Keep the existing classes and menu motion. Phone: no change (bottom sheet).
- Count over 99 shows `99+`. The aria-label and tooltip keep the real number.

### 2. Rail behaviour (`chat/ChatStatusChips.tsx`)

- Segment order: Subagents, Background, Changes. A segment shows when its count is above 0. Decision 20 keeps Changes at 0 while its popover is open.
- Marks:
  - Subagents: `spinner` while any runs; `dot failed` when one failed and none runs; none when all are done.
  - Background: `spinner` while any runs; `dot failed` when one exited non-zero and none runs.
  - Changes: `dot failed` on a Git error or a conflict; `dot new` from step 5; never a spinner. While Git status reloads, the count drops one ink step (`muted-foreground`) and nothing else changes. Below 400ms nothing changes at all.
- Remove the `:1076` mount above the question card. The rail has one mount (step 4).
- Keep `hidden` (phone keyboard open, reconnect pill) and `isVisible`.

### 3. Changes popover (new `chat/ChangesPanel.tsx`)

- Header: "Changes" (13/20, `foreground`, medium) and, at the right, "This chat · N files, not committed" with `+A −R` (git source), or "This chat · N files edited" (session source).
- Rows: the board I recipe at 32px height: file icon 14, name (`secondary-foreground`), folder or "from old-name" (`muted-foreground`, truncates first), fixed 64px right lane (`+A −R` in `diff-added-foreground` / `destructive`, `tabular-nums`, or the word Renamed / Binary). Deleted files: name one ink step down, no strikethrough, count `−N`. Hover: solid row-hover fill. Click: `openChangedFile` (diff in a workspace tab), then close the popover.
- At most 4 rows, then "Show N more", which calls `onOpenGitChanges` (desktop Changes tab or phone Git sheet). The popover never scrolls.
- Footer (git source and writable only): "Discard all" (red text button) at the left, "Open in Git" (raised secondary `Button`) at the right. Quick chats keep `hideChanges`: no segment.
- Discard confirm: the footer turns into the question from decision 16 and moves focus to Cancel. Esc or Cancel returns to the normal footer. "Discard N files" calls `discardFiles(cwd, paths)` with the listed paths. While it runs, the button shows a spinner and "Discarding…" in place.
- States: loading (4 skeleton rows when the fetch takes over 400ms, no footer), empty ("No uncommitted changes from this chat" + Open in Git), Git error ("Could not read Git status." + the real error text + "Try again"), discard failure (same error state).

### 4. Placement and gutter (`AgentChatPanel.tsx`, `ChatInputBar.tsx`)

- Drop `statusRow` from `ChatInputBar` and from `renderStatusChips`. Mount the rail once, as a direct child of the chat root (`AgentChatPanel.tsx:950`, `@container relative isolate`).
- Set `data-status-rail="shown"` on the chat root while the rail renders. With the container query `@max-[892px]`, add `pr-[72px]` to the message list content, the plan panel wrapper (`:1009-1014`) and the restore banners (`:967-992`). Write it once as a shared class constant.
- z-order: rail `z-20`, above the top fade (`z-10`), below popovers (`z-50`).

### 5. Blue dot (new `stores/changes-seen-store.ts`)

- A zustand store with `persist` (local storage), keyed by session id: `{ fingerprint: string }`. The fingerprint is the sorted list of `path:added:removed:status` of the chat's changed files.
- `hasNew = files.length > 0 && fingerprint !== seen`.
- Mark seen when the Changes popover opens, or when the Git tab shows for this folder (`useLastColumnTab(projectId) === 'changes' && useSidePanelVisible()`), or when the phone Git sheet opens for this `cwd`.
- Drop entries for deleted sessions with the existing session cleanup, or cap the map (for example the latest 200 sessions).

### 6. Running state outside the rail

- `SubagentRow.tsx`: `running` maps to `text-muted-foreground` and `SubagentStatusIcon` uses `Spinner`. Remove `text-warning` / `bg-warning` for running.
- Subagent card in the transcript ("Working"): the same spinner and muted word.
- Keep warning for "Needs you" and conflicts.

## Motion

Every value below uses the existing tokens. CSS transitions only; framer-motion is not used for the rail.

### Event: the first subagent starts (rail appears)

| Element | Role | Starts | Duration | Motion | Relationship |
|---|---|---|---|---|---|
| Rail | Lead | 0ms | 150ms in, 120ms out | opacity 0 → 1, `scale` 0.97 → 1, origin top right, `--ease-smooth-out` | — |
| Segments, dividers | Static | — | — | carried by the rail | One entrance per container |
| Spinner | Decoration | 0ms | linear loop | rotation (existing `Spinner`) | Together with the rail |
| Gutter (narrow panes) | Static | — | — | padding changes at once | Layout change, never animated |

### Event: a second kind starts (segment added to a visible rail)

| Element | Role | Starts | Duration | Motion | Relationship |
|---|---|---|---|---|---|
| New segment + its divider | Lead | 0ms | 150ms | opacity 0 → 1 (`@starting-style`) | — |
| Rail height | Static | — | — | changes at once | — |

Segment removed: it leaves the layout at once (absolute at its last position) and fades out in 120ms while the rail height changes. Keep it mounted for the fade with a small `data-exiting` flag and a 120ms timer; cancel the timer if the count goes above 0 again.

### Event: click a segment (popover opens)

| Element | Role | Starts | Duration | Motion | Relationship |
|---|---|---|---|---|---|
| Popover | Lead | 0ms | 250ms in, 150ms out | existing menu motion: fade + `scale` 0.97 → 1 from the trigger | — |
| Segment fill | Support | 0ms | 150ms | `background-color` to the open fill | Together with the popover |
| Rows | Static | — | — | inside the popover | No stagger: opened many times a day |

### Marks

- Mark change (spinner ↔ red dot ↔ none): both layers in the 10px slot cross at once, 150ms, opacity + `scale` 0.9 → 1, `--ease-out`.
- Blue dot appears: one keyframe, `scale` 0.6 → 1 with opacity, 250ms, `--ease-bounce`. It plays only on mount, so a keyframe is safe.
- Counts: no animation (a figure).

### Inside the Changes popover

- Skeleton → rows: the rows replace the skeleton with one 150ms fade for the whole list, no stagger.
- Footer → confirm: changes at once (it can be reached by keyboard). Focus moves to Cancel.
- After discard: the list changes at once to the empty state.

### Reduced motion

- Rail, segments, marks: opacity only, no `scale` (`motion-reduce:` variants). The blue dot pop: `motion-reduce:animate-none`, it just shows.
- Popover: the existing 150ms fade fallback in `index.css`.
- Spinner: `Spinner` already pauses into a static ring.

### Performance

- Only `opacity`, `scale` and `background-color` animate. All are composite-tier.
- The rail sits outside the scroll viewport, so scrolling does not repaint it.
- No CSS variable on a parent drives a child's transform. No React state changes per frame.
- No `will-change` unless a 1px shift is seen at the start or end of the rail entrance.
- Hover styles use Tailwind v4 `hover:` (gated to fine pointers).

## Tests

Update, do not delete, the behaviour they cover:

- `ChatStatusChips.test.tsx`: the "Session status" group, segment order (Subagents, Background, Changes), `[data-tone]` / mark kind, and `data-side="left"` (was `top`) on the Subagents dialog. Esc, second click and the phone sheet stay.
- `ChatStatusChips.files.test.tsx`: the new Changes panel. Header copy for git and session sources; 4 rows then "Show N more" calls `onOpenGitChanges`; row click calls `openChangedFile`; no strikethrough on deleted rows.
- `ChatStatusChips.subagents.test.tsx`, `ChatStatusChips.background.test.tsx`: labels and panels stay; the mark is a spinner while running.
- New: rail is not in the composer; rail is a child of the chat root; `data-status-rail` toggles; gutter class only under 892px (container query class present).
- New: Changes count 0 keeps the segment while the popover is open, removes it after close.
- New: discard flow. Confirm copy, focus on Cancel, `discardFiles` called with the listed paths, disabled while `turnActive`, hidden without write access, empty state after success, error state after failure.
- New: blue dot. Shows on a new fingerprint, clears on popover open and on Git tab open, survives reload (persist).
- `SubagentRow` / subagent card: running uses `Spinner`, no `text-warning`.

## Docs

- `docs/design/status.md`: "in progress" moves from `warning` to the neutral spinner. Add the rail marks (spinner, red dot, blue dot) to the decision tree. Add a "Status rail" section that points to this file.
- `docs/design/motion.md`: add rows for the rail entrance, segment add / remove and the mark crossfade.
- Paper B2: change the notes to the 250 / 150 popover timing, "This chat" header copy, "Discard all" in place of "Revert turn", and the press rule.

## Verify

- `bun run typecheck` (or the repo's typecheck scripts), `bun run check`, `bun run test`.
- Run the app and check, in both themes at 4–8× zoom: wide pane, narrow pane with the Changes side panel open, plan panel open, restore banner, reconnect pill, phone shell with the keyboard open, quick chat (no Changes segment), read-only browser viewer (no Discard).
- Record the rail entrance and the popover open and step through them frame by frame. Check that the popover grows from the segment and that a removed segment does not leave a gap.

## Follow-ups (not in this PR)

- Last-turn scope for Changes (needs a turn checkpoint).
- A real "Revert turn".
- A design-system preview for the rail.
