# Typography

`body` is `font-sans` (**Inter Variable**, then `sans-serif`). Code, the editor, and the terminal are `font-mono` (**Paper Mono**, then **Termul Symbols**, then `monospace`). All three faces are bundled. There is no font picker. A saved `terminalFontFamily` is ignored.

Paper Mono ships 659 glyphs and has no Powerline or Nerd Font glyphs, so prompt icons (Powerlevel10k, Starship, Oh My Posh) fell through to `monospace` and rendered as tofu. **Termul Symbols** fills that gap: a Nerd Fonts Symbols-only subset scaled to Paper Mono's metrics (1000 upm, 606/1000 advance), so the terminal keeps one cell width per icon. It is declared only in `index.css`; never reference the symbol face from UI chrome.

Troupe is a dense tool with two text densities. Long-form markdown stays at `1rem`. Touch text fields stay at 16px.

- **Dense chrome is 12/16 (`text-xs`, `leading-4`).** Every list row and menu item: menus (`MENU_ITEM_CLASS`), the model picker and mode menu (`PICKER_ROW`), the Rail and its hover panels, settings rows, composer pills, tool-strip and panel headers. A row's name and its description are both 12px; the description is `text-muted-foreground`. Hierarchy in a row comes from ink, never from a size step.
- **Controls and reading text are 14px (`text-sm`).** `Input`, `Select`, `Textarea`, the default `Button`, dialog body copy, command palette items, and the composer editor on a fine pointer.

Never `text-[Npx]`. Use the scale below. `tabular-nums` on every value that changes (counts, times, revisions).

## Size tokens

| Token | Size | Use |
|---|---|---|
| `text-hero` | 22px | The start screen's one display line only (Paper 2.2). Registered in `cn` (`lib/utils.ts`) so it is not read as a colour. |
| `text-base` | 16px | Every text field on a coarse pointer, through `pointer-coarse:text-base` (`Input` is `text-base md:text-sm pointer-coarse:text-base`) |
| `text-sm` | 14px | Fields, default `Button`, dialog body, command palette items |
| `text-xs` | 12px | Rows and menu items (12/16), captions, helper lines, `Button size="xs"` |
| `text-2xs` | 12px | Path chips, compact mono labels, SSH status words (`SSHHostStateWord`) |
| `text-3xs` | 12px | Status badges, settings footnotes |
| `text-4xs` | 12px | Git ref chips (`GitHistoryPanel` `RefChip`) |

Never go below 12px. `text-2xs`, `text-3xs`, and `text-4xs` share that size. Weight and color carry the difference. Paper Mono has no italic, so comments and emphasis stay upright.

## Text fields are 16px on touch

iOS Safari zooms the page when a text field with a computed font size under 16px takes focus. Every text field (`input`, `textarea`, `select`) is 16px on a coarse pointer, whatever its size on a fine pointer. The rule is keyed on pointer type, not width, so a landscape phone (768px or wider) is covered. `Input`, `Textarea`, `CommandInput`, `PopoverSearchBand` and `PANEL_FIELD_CLASS` carry `pointer-coarse:text-base` already. A raw field adds it next to its size (`text-xs pointer-coarse:text-base`), and `cn` keeps it when a caller passes `text-xs` or `text-sm`. Never `text-[16px]`, a global `input` rule, or `maximum-scale` in the viewport meta (it blocks pinch zoom). `ui/text-field-font-size.test.tsx` fails on a raw field that has neither the token nor an allowlist entry.

```
What text is it?
 ├── A row or menu item (name, description, label, value) → text-xs leading-4
 ├── A field, a default Button, or a dialog's body copy → text-sm
 ├── Helper under a label → text-xs text-muted-foreground
 ├── Badge / chip in a 16–20px row → text-3xs (12px)
 └── Git ref / micro chip → text-4xs (12px)
```


## Incorrect

```tsx
<span className="text-[10px] text-gray-400">Connecting</span>
```

## Correct

```tsx
// SSHHostStateWord (ssh-host-status.tsx) — text-2xs + semantic status
<span className="text-2xs tabular-nums text-warning">Needs input</span>
```
