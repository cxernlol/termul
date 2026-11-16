# Motion

Motion answers a question (what changed, where did it go, did my press land) or it does not ship. The more often a thing is seen, the less it moves. Tokens live in `src/renderer/index.css` (`--ease-*`, `--duration-*`, `--scale-*`); framer curves in `lib/motion.ts` and `chat/chat-motion.ts`.

## Should it move?

```
What happened?
 ├── Keyboard navigation, typing, scrolling, resize, drag → no animation
 ├── Hover or focus → colour or fill only: transition-colors duration-150 ease-out
 ├── A press on a main button → the Button PRESS (below). Nothing else scales on press.
 ├── Something opens or closes (menu, popover, dialog, sheet) → the overlay timings below
 ├── A list or section collapses or expands → grid rows 0fr ↔ 1fr, never `height`
 ├── One element moves to a new place (the first-send composer) → a shared-element spring
 └── A value changes in a figure → no animation
```

## Curves and durations

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Anything the user caused: press, collapse, dialog |
| `--ease-smooth-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Menus and popovers |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets and the picker's Edit slide |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Something already on screen moving |
| `--duration-quick` | 150ms | Hover, press, colour, closes |
| `--duration-fast` | 250ms | Menu and popover opens |

Never `ease-in` on UI (it delays the response), never `transition: all`, and never a bounce outside a celebration. Exits run faster than entrances: the user has already moved on.

## Patterns

| What | Open / in | Close / out | Where |
|---|---|---|---|
| Press (main buttons only) | `scale(0.97)`, 150ms, `--ease-out` | back to 1 | `PRESS` in `ui/button.tsx` |
| Menu, popover | 250ms, fade + `scale(0.97 → 1)`, `--ease-smooth-out` | 150ms, fade only | `index.css` popper rules, `MENU_MOTION_CLASS`, `AnimatedMenuContent` |
| Dialog, AlertDialog | 200ms, `--ease-out` | 140ms | `index.css` |
| Sheet | 300ms, `--ease-drawer` | 200ms | `index.css`, `ui/sheet.tsx` |
| Collapse (Rail chat list) | 200ms rows + fade + 4px lift, `--ease-out` | 150ms | `RailChatCollapse` (`RailProjectChats.tsx`) |
| Collapse (framer) | 150ms `easeInOut`; chat 250ms smooth-out | same | `ui/collapse-expand-motion.tsx` |
| Chevron that turns | `rotate` 150ms, `--ease-out` | same | `project-item.tsx` |
| Subagent panel open | header avatar grows out of the clicked row's avatar: FLIP `translate` + `scale`, 340ms, `--ease-out`; the docked panel fades in with a 12px slide from the right, 200ms | 150ms fade + 12px slide to the right, `--ease-out`, held at the end; the chat takes the width back at once. The panel stays mounted through it (no second morph, scroll kept). Only a pointer close (Close, Back to chat, Back from the last subagent); Esc and Enter/Space close at once | `chat/SubagentPanel.tsx` (`useAvatarMorph`), `chat/SubagentSurface.tsx` (`DockedAside`) |
| First-send composer morph | spring `{ visualDuration: 0.35, bounce: 0 }`; the hero exits in 160ms; the transcript enters in 320ms after 80ms | — | `chat/chat-start-morph.tsx` |
| Status rail entrance | 150ms, fade + `scale(0.97 → 1)`, origin top right, `--ease-smooth-out` | 120ms, fade only | `chat/ChatStatusChips.tsx` |
| Status rail segment add, remove | 150ms fade in | 120ms fade out, out of layout at once. The rail height does not animate | `chat/ChatStatusChips.tsx` |
| Status mark crossfade (spinner, red dot, none) | 150ms, fade + `scale(0.9 → 1)`, `--ease-out` | same | `chat/StatusChip.tsx` |
| Blue dot pop | 250ms, `scale(0.6 → 1)`, `--ease-bounce`, once on mount | none | `chat/StatusChip.tsx` |

A press is `scale(0.97)`: never below 0.95, never on a full-width row, a menu item, a chip, a tab or an icon button. A row that shrinks reads as the layout jumping. The status rail segments follow this rule: a press changes the fill only, with no scale.

The blue dot pop is the one bounce outside a celebration. It plays once, when the dot mounts, and never loops. The rail uses opacity and `scale` only, and its reduced path is opacity only.

Tailwind v4's `scale-*` and `rotate-*` set the CSS `scale` and `rotate` properties, not `transform`. `transition-transform` covers them; a hand-written list must name them, or the change snaps: `transition-[scale,background-color]`, never `transition-[transform,…]` for an `active:scale-*`.

## Reduced motion

Every motion has a reduced path, written next to it:

- CSS: `motion-reduce:transition-none`, `motion-reduce:animate-none!`, `motion-reduce:active:scale-100`.
- Framer: `useReducedMotion()`, then `{ duration: 0 }` (`INSTANT`) or a fade.
- Menus and popovers fall back to a 150ms fade (`index.css`). The composer morph switches at once.

## Correct

```tsx
// ui/button.tsx — one press for every main button
const PRESS =
  'active:scale-[0.97] motion-reduce:active:scale-100 transition-[scale,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]'
```

## Incorrect

```tsx
// A row that shrinks, a curve that waits, and a transition that never animates scale
<button className="w-full active:scale-[0.96] transition-[transform] ease-in">Opus 5.5</button>
```
