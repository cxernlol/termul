# Menus, pickers and rows

Two surfaces and four row kinds cover every list in the app. Class strings live in `ui/menu-styles.ts` (Radix menus) and `chat/agent-model-selector/selector-tokens.ts` (pickers). Do not restyle rows at the call site: a hand-written row drifts from its siblings on the first edit.

## Which surface

```
What opens?
 ├── Actions on one thing (right-click, "…", a toolbar menu) → ContextMenu / DropdownMenu (menu surface)
 ├── A pick-one from a known list inside a form → Select (menu surface)
 ├── A composer picker that sets a value (model, mode, a flyout) → AnimatedMenuContent surface="panel"
 ├── A hover peek from the collapsed Rail → RailHoverPanel (panel surface)
 └── Search across everything → the command palette (CommandDialog)
```

| Surface | Class | Look |
|---|---|---|
| Menu | `MENU_CONTENT_CLASS` | `rounded-xl border bg-popover p-1 shadow-md`, min 128px |
| Panel (V2) | `OVERLAY_PANEL_SURFACE_CLASS` | radius 10, 0.5px `outline-popover-edge`, `shadow-rail-hover-panel` |

The model picker and the mode menu are both 300px panels (`w-75 p-1`; the picker is 341px when its agent tabs sit in a left rail). A new composer picker uses the same surface and width, so the pickers read as one family.

## Rows

| Row | Height | Text | Radius | Source |
|---|---|---|---|---|
| Menu item | 32 (`min-h-8`) | 12/16 | `rounded-lg` | `MENU_ITEM_CLASS` |
| Picker row | 28 (`h-7`) | 12/16 | `rounded-md` | `PICKER_ROW` |
| Two-line picker row (name + description) | 44 (`py-1.5`) | 12/16 + 12/16 muted | `rounded-md` | `mode-menu.tsx` |
| Rail chat row | 30 (`h-7.5`) | 12/16 | `rounded-lg` | `RailChatRow` (`rail-chats.tsx`) |
| Rail nav row | 28 (`h-7`) | 12/16 medium | `rounded-lg` | `rail-nav.tsx` |
| Any row on touch | 44 (`min-h-11`) | 16 in fields | as above | `menuOptionRowClass(touch)`, `PICKER_ROW.heightTouch` |

Fills follow [colors.md](colors.md) → State:

- Hover and keyboard focus on a popover: `bg-foreground/[0.06]`. On the Rail: `bg-row-hover` (3%).
- The picked row: `bg-foreground/10` (`PICKER_ROW_SELECTED_BOX`, `MENU_PICKED_CLASS`), kept under hover. **No tick.** The fill says it; a tick next to a fill says it twice.
- A checkbox item (several rows can be on) keeps its `Check` (`DropdownMenuCheckboxItem`, `ContextMenuCheckboxItem`).
- The open chat in the Rail: `.keycap`.
- Never `bg-secondary` on a row: in Troupe Dark it equals `bg-popover`, so the highlight disappears.

## How a picker behaves

- A pick applies on click and closes the picker (model picker, mode menu). There is no Apply or Cancel footer on a picker panel, so it has no primary button of its own. A choice that needs confirming is a form in a `Dialog`, not a picker.
- Picked rows are buttons with `aria-pressed`; Up and Down move focus between rows, Enter or Space picks, Escape closes (`mode-menu.tsx`). Radix menus get this from Radix.
- Build rows from the constants (`PICKER_ROW`, `PICKER_LABEL`, `PICKER_ROW_SELECTED_BOX`, `MENU_ITEM_CLASS`), or copy the nearest existing row (`mode-menu.tsx` for name + description). A hand-written row is the first one to drift.

## Inside a row

- Icons: 14px (`size-3.5`, `mr-2`) in menu items; 16px glyphs in picker rows (agent glyph, mode icon) on a 16px lane; 12px glyphs in 20px row actions. Every row in one list has the icon lane, or none does: a lane with gaps breaks the left edge.
- Labels: sentence case, a real "…" (one character). Never Title Case.
- Group labels: `MENU_LABEL_CLASS` (`.label-panel`, 12px medium muted) in menus; `PICKER_LABEL` (12/16 regular muted, a 28px block) in panels.
- Separators are 0.5px everywhere: `MENU_SEPARATOR_CLASS` and `CommandSeparator` (`h-[0.5px]`) in menus, `border-t-[0.5px]` / `h-[0.5px]` in panels.
- Long names fade at the end (`fade-end`) instead of an ellipsis, so two similar names stay readable.
- A value on the picked row (`Medium ›`) uses `PICKER_ROW_VALUE`; it never shrinks, the name truncates first.
- Destructive means it deletes or discards something the user cannot get back (delete, remove, discard changes). Resetting a single value is not destructive: a plain row. A reset of all settings is a `ConfirmDialog` with `variant="danger"`.
- A destructive item is the last item, after a separator. `ContextMenuItem variant="destructive"`. `DropdownMenuItem` has no `variant`: use `className="text-destructive focus:bg-destructive/10 focus:text-destructive"` (`StashMenu.tsx`).

## Row actions and long lists

- Right-click, Shift+F10 and the hover "…" open the same `ContextMenu` (`isContextMenuKey`, `openContextMenuFrom` in `lib/context-menu-key.ts`). WebKit sends no `contextmenu` for Shift+F10, so the row handles the key itself.
- Row actions ("…", "+", a gear, an info button) are 20px quiet buttons (`size-5`, 12px glyph), siblings of the row's own button, 8px from the row's right edge. Their hover is the surface's hover: `bg-foreground/[0.06]` on a popover, `bg-foreground/[0.03]` on the page. "…" shows on hover or focus in place of the row's trail; "+" on a project row is always shown. A row action that only shows on hover must also show on focus, and its job must be reachable another way on touch (the context menu).
- A list under a heading shows 5 rows, then "Show N more" (`RailShowMore`). The open item always shows, even past 5.

## Correct

```tsx
// shell/rail/rail-chat-menu.tsx (ICON = 'mr-2 size-3.5')
<ContextMenuItem onSelect={() => actions.onOpenInSplit(entry)}>
  <Columns2 className={ICON} /> Open in split
</ContextMenuItem>
<ContextMenuSeparator />
<ContextMenuItem variant="destructive" onSelect={() => onRequestDelete(entry)}>
  <Trash2 className={ICON} /> Delete chat
</ContextMenuItem>
```

## Incorrect

```tsx
// Title Case, a tick on a pick-one row, and a highlight that vanishes on popover
<DropdownMenuItem className="hover:bg-secondary">
  Open In Split {picked && <Check className="ml-auto h-4 w-4" />}
</DropdownMenuItem>
```
