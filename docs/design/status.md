# Status

Status colour is a role, not a hue. Always pair it with a word or an icon. Colour alone fails for colour-blind users and in screenshots.

| Role | Ink | Tint (badge, banner) | Meaning |
|---|---|---|---|
| `success` | `text-success` | `bg-success/10` | Connected lamp, completed, added (outside a diff) |
| `warning` | `text-warning` | `bg-warning/10` | Needs you, in progress, conflict, caution |
| `destructive` | `text-destructive` | `bg-destructive/10` | Failed, delete, error, removed diff line |
| `connection` | `text-connection` | `bg-connection/15` | Remote access and agent connection (lamp, banner) — never "success" |
| `muted` | `text-muted-foreground` | `bg-muted-foreground/50` (lamp) | Idle, offline, disconnected |

Tints are `/10` (`/15` for `connection`). A banner adds a `border-{role}/20` to `/30` edge. Do not use `/20` or stronger fills: they read as a button.

`diff-modified` marks a changed file in a git list. Do not use `warning` for "this file changed". Diff lines: additions `diff-added` (`diff-added-foreground`, `diff-added-border` for the line chrome), deletions `destructive`.

```
What is the status?
 ├── Git diff paint → addition diff-added · deletion destructive · changed file diff-modified
 ├── A live connection (remote access, agent link) → connection
 ├── Needs the user, or in progress, or a conflict → warning
 ├── Failed, deleted, error → destructive
 ├── Connected / completed → success (lamp or icon), word stays muted
 └── Idle, offline → muted
```

## SSH hosts

`components/ssh/ssh-host-status.tsx` (`HOST_STATE`) is the one source for the word, its ink and the lamp. Copy it, not a hue:

| State | Word ink | Lamp |
|---|---|---|
| idle, disconnected | `text-muted-foreground` | `bg-muted-foreground/50` |
| connecting | `text-muted-foreground` | none: a 9px warning spinner |
| attention ("Needs input") | `text-warning` | `bg-warning` |
| connected | `text-muted-foreground` | `bg-success` |
| failed | `text-destructive` | `bg-destructive` |

Do not split reconnecting onto `project-orange`.

## Shell

The desktop shell has no status bar (Sidebar V2). Its tools sit in the tool strip at the right edge (`components/shell/tool-strip/`): Terminal, Browser and Remote access in the bottom group.

- Remote access on: the `Monitor` icon in `text-connection` on the strip button. The web client shows its connection lamp there in a status tone (`connection` / `warning` / `destructive`).
- Git change count: the blue `CountBadge` on the strip's Changes button. Blue badges are the only status use of `primary`.
- A chat or project that needs you: a `bg-warning/10 text-warning` pill with a 6px `bg-warning` dot and the word "Needs you" or a count (`sidebar/project-chat-row.tsx`, `sidebar/indicators.tsx`).
- `components/status-bar-hit.ts` is a leftover hit-area helper used only by `ConnectionStatusIndicator`. Do not copy its class strings into new UI.

## Toasts

Sonner and the Radix toaster use the theme card: `bg-card`, `border-border`, `text-foreground`, description `text-muted-foreground`. Do not enable Sonner `richColors`. Info and default icons use `muted-foreground`; success, warning and error icons use their role. The card stays the same for every type. Never toast a successful copy: change the icon in place.

## Correct

```tsx
// sidebar/project-chat-row.tsx — a word plus a dot, on the /10 tint
<span className="flex shrink-0 items-center gap-1 rounded-md bg-warning/10 px-1.5 text-3xs font-medium text-warning">
  <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
  Needs you
</span>

// RemoteAccessPopover.tsx — a warning banner
<div className="flex items-start gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-md px-3 py-2">
```

## Incorrect

```tsx
// Palette hues, a heavy fill, and no word
<span className="bg-green-500/20 text-green-600" />
<span className="size-2 rounded-full bg-warning" title="Needs input" />
// There is no Alert component in ui/; a banner is a div with the tint above
<Alert variant="warning">Workspace changed</Alert>
```
