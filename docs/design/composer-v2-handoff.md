# Composer V2 and the new chat layout: handoff spec

Status: design only (2026-11-16). Not in code yet. Dark theme only.
Design source: Paper file "Termul Design System", page **Composer V2 · States**.

Scope: the chat composer (desktop and phone), its menus and sheets, the working chat layout around it (status rail, tool rows, subagent card), and the rules for long text. The sidebar is in `sidebar-v2-handoff.md`. The browser client renders the same composer, so check it too (`AGENTS.md`).

## Frames

| Frame | What it shows |
|---|---|
| `1.1`–`8.1` (top-left grid) | Composer states on a plain board: idle, typing, two lines, mode menu, model menu, worktree menu, connectors, + menu, voice, stop |
| `9.1 Motion / Spec` | Motion values |
| `2.2 New chat / ASCII glow`, `2.3 New chat / Collapsed sidebar` | Composer V2 on the new chat screen |
| `2.3a`–`2.3g` | Desktop composer states on the collapsed-sidebar screen |
| `2.4 Launcher / No tab open` | Launcher with Composer V2 |
| `2.5 Working chat / Agent working` | Docked composer, Stop, beam, status rail top-right |
| `2.6b`–`2.6n` | Phone: compact composer, queue, sheets (Add, Select model, Provider loading and failed, Providers, Effort, Mode, Agent, Connectors), voice, new chat, update banner |
| `2.6o Mobile / Worst-case data` | Long titles, long branch, long model name, 2–3 digit counts, long URL, long MCP tool name |

## Decisions

| Topic | Decision |
|---|---|
| Layout | Tray → raised card → foot row (desktop). The phone has no tray and no foot row. |
| Mode | The mode chip in the card. Default label "Ask first". Bypass = warning pill + shield. |
| Worktree | Desktop: the foot row (`ChatStartContextRow`). Phone: the header subtitle; a strip under the composer only on a new chat. |
| Connectors | MCP connectors. Desktop: the foot row. Phone: a row in the Add sheet that opens the Connectors sub-sheet. Not in the + menu on desktop. |
| Primary | Send and Stop use the blue emboss (`primary-fill` + emboss shadow). One primary per surface. Voice "Use" takes the send slot, also blue emboss. |
| Agent update | A banner above the composer, not a toolbar chip. |
| Status rail | Desktop: top-right of the chat pane. Phone: top-right under the header; the message list keeps a 124px top reserve (`scroll-padding-top`). |
| Hover / chosen | Hover 4%, chosen 10% `foreground` mix. No opacity on readable text. |
| Motion | Never animate the width, padding or height of bars. |

## Phone composer (2.6b)

| Part | Value |
|---|---|
| Card | 358 wide in a 20px gutter (16 + card inset), one input row + one toolbar row |
| Input | 16px text (iOS zoom floor), placeholder "Ask anything…" |
| Toolbar | Add, Model chip (agent icon, model name, mode shield, chevron), spacer, context ring, Voice, Send/Stop |
| Buttons | 36px visual, 44px hit area (`after:-inset-1`) |
| Model chip | Grows with the name; the spacer gives way first. The name never truncates at realistic lengths ("Sonnet 4.5 (1M context)" fits). |

## Phone sheets

| Rule | Value |
|---|---|
| Close | Root sheets have a grab handle and no ✕. A tap or a swipe on the handle closes the sheet. Sub-sheets keep ← back. |
| Height | A sub-sheet keeps the root sheet height, so the stack does not jump (decided 2026-11-16). Short content leaves empty space below it. |
| Groups | Grouped cards: `muted` fill, `0 0 0 0.5px #38393A, 0 1px 2px #00000080`, radius 12. Rows 60 (two lines) or 48 (one line). Dividers 0.5px `#38393A`, inset to the text column. |
| Text | Row title 15/20, subtitle 14/18, section labels 14/18 `muted-foreground`. Search field 44 tall, 16px text. |
| Switches | iOS size, 51×31. |
| Logos | The real logo when one exists, else a letter tile (18px, radius 5, first letter). Providers: `AgentIcon` (bundled SVG in `assets/agent-icons`, letter fallback). MCP connectors: the catalog icon (`mcpCatalogApi.icon`), letter fallback when it is unavailable. Frame 2.6j shows Claude, Codex and Cursor logos; Devin, Cline, Amp and Autohand Code have no bundled icon, so they keep the letter. |
| Loading (2.6i) | Skeleton keeps the sheet height. Timeout 10s. |
| Load failed (2.6i·2) | Same layout as loading: Options and search stay, dimmed. Only the list area changes. No icon before the title. Actions: "Try again" and "Use Claude Agent". |
| Connectors (2.6n) | "Needs attention" rows show only Reconnect or Sign in; no switch until the connector works. Rows show the tool count ("8 tools"). Summary: "6 of 11 on. Fix a connector to turn it on. Changes apply to the next chat." |

## Long text: truncate, wrap or fade

One rule for every one-line row. Use the existing `fade-end` utility (`src/renderer/index.css`). Do not use `truncate` or a typed "…" in these rows.

| Text | Treatment |
|---|---|
| Chat title in the header (phone) | `fade-end`, max width = title block. Never covers the header buttons. |
| Header subtitle (project · branch) | `min-w-0 shrink` + `fade-end`. The chevron stays (`shrink-0`). |
| Subagent card title and subtitle (phone) | `fade-end`, text box fills the column. |
| Subagent card title (desktop) | The title sits next to the agent-type chip, so its box hugs the text. Add the fade only when the title overflows (measure `scrollWidth > clientWidth`), else the last letters of a short title fade. |
| Tool rows (Read, MCP, Running…) | `min-w-0 flex-1` + `fade-end`. The trailing time and actions are `shrink-0`. |
| Sheet rows (model, provider, agent, connector names and subtitles) | `fade-end`, text box fills the row. |
| User message | Wraps. Long URLs break with `overflow-wrap: anywhere`. |
| Numbers (counts, diff stats, times) | Never fade or truncate. `tabular-nums`, `whitespace-nowrap`, `shrink-0`. |

A "…" that means "in progress" ("Running bunx tsc…") is copy, not truncation. Keep it.

## Status rail counts

| Part | Value |
|---|---|
| Rail width | Hugs the counts (`w-fit`), min 60. |
| Count | `tabular-nums`, `whitespace-nowrap`, `shrink-0`, min width 10. Segment padding-right 8 when the count has 2+ digits. |
| Cap | A count over 99 shows "99+". The full number is in the popover. |
| Worst case | 12 / 10 / 99+ fits (frame 2.6o). |

## Checklist

- [ ] Desktop Composer V2 card, tray and foot row (`ChatInputBar.tsx`, `ChatStartContextRow.tsx`, `composer-menu.tsx`)
- [ ] Mode chip with "Ask first" default and the Bypass pill
- [ ] Connectors in the foot row (desktop) and in the Add sheet (phone)
- [ ] Phone compact composer (2.6b) with 44px hit areas
- [ ] Phone sheets: grab handle without ✕, sub-sheets with ←, fixed stack height (`mobile-sheet.tsx`)
- [ ] Provider loading and failed states with the same layout
- [ ] Connectors "Needs attention" rows without a switch
- [ ] Voice "Use" in the send slot, blue emboss
- [ ] Agent update banner above the composer
- [ ] Status rail top-right; counts hug, use `tabular-nums`, cap at "99+"
- [ ] Real provider and MCP logos with the letter-tile fallback
- [ ] `fade-end` on every one-line row in the table above; no `truncate` there
- [ ] Worst-case data from frame 2.6o checked in the app at 320px and 390px
- [ ] Browser client checked
- [ ] Light theme checked (design is dark only)

## Open items

- MCP connector rows in the design still show letter tiles (no logo assets in the design file). In code they use the catalog icon first.
