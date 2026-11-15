# Buttons

Use `Button` from `src/renderer/components/ui/button.tsx` for actions. Navigation styled as a button is a link (`variant="link"`) or a router target, not a fake button.

Icon-only in chat/streamdown chrome uses `IconActionButton` (`label` required). Icon-only in toolbars uses `Button` `size="icon"` / `icon-sm` / `icon-xs`.

Variants (union in `buttonVariants`): `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `composer`. `primary` is not a variant. `default` and `composer` share one filled primary chrome: `bg-primary-fill`, the per-theme emboss (`shadow-emboss` / `shadow-emboss-hover`), per-theme hover and pressed fills (`bg-primary-fill-hover` / `bg-primary-fill-active`), and a muted disabled fill. `secondary` and `outline` share one raised secondary recipe (decided 2026-11-15): the per-theme control fill (`bg-control-fill`, hover `bg-control-fill-hover`), `text-foreground`, `font-medium`, `shadow-control` (dark: a 0.5px `popover-edge` outline and a black 1px drop; Troupe Light: a 1px ink ring at 8% and a 1px drop at 12%), no border, press `scale(.97)`, disabled at 60%. Use it for every secondary action; do not hand-roll a `bg-secondary` button. `ghost` hovers to `bg-secondary text-ghost-hover-foreground`. Composer send, stop, and launch use `variant="composer"`. Other primary actions use `default`. Send and stop share that chrome; only the glyph changes (arrow vs square). They do not show at the same time, so the view still has one primary.

Sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`, `touch`. `touch` is the 44px mobile floor (`WorkspaceSnapshots`). Default size is `default` (h-10).

```
Is it composer send, stop, or launch (ChatInputBar / AgentLauncher)?
 ├── Yes → variant="composer", size icon-sm | icon | touch
 └── No
      ├── Single most important action on the screen? → variant="default"
      ├── Destructive or hard to undo → variant="destructive" (bg-destructive-fill)
      ├── Cancel / dismiss next to a default button → variant="outline" or ghost
      ├── Quiet toolbar / icon in a list → variant="ghost"
      ├── Text navigation → variant="link"
      └── Secondary action in a group → variant="secondary"
```

One `default` per view. Two filled primary buttons means the screen has no hierarchy.

A primary action is a `Button`. Do not paint `bg-primary-fill` on a raw `<button>`. Text primary actions use `size="sm"` (h-9), including modal footers and empty states. A control beside a `text-xs` field uses `size="xs"`. Do not use `lg` for these actions. Mobile floors stay on `touch`.

Only main buttons press: `default`, `composer`, `secondary`, `outline` and `destructive` squeeze to `scale(0.97)` over `150ms` on `cubic-bezier(0.23, 1, 0.32, 1)` (the `PRESS` constant in `button.tsx`), with no squeeze under reduced motion. Ghost and link buttons, icon buttons, rows, menu items, chips and tabs do not scale; they answer with their fill. There is no document-wide press rule.

## Icon buttons and row actions

None of these press-scale: they answer with a colour or fill change.

```
Where does the icon-only control sit?
 ├── Chat messages, code blocks, tool calls (streamdown chrome) → IconActionButton (label required; size="sm" in dense chrome)
 ├── A panel header or the Rail footer → PANEL_ICON_BUTTON_CLASS (28px) / railButtonClass (rail-button.tsx, 32px, keycap when active)
 ├── At the end of a list row (…, settings, +) → a 20px quiet button (size-5, 12px glyph), shown on hover or focus
 ├── A pill in the composer toolbar (model, mode) → ComposerPill
 └── A toolbar elsewhere → Button size="icon-sm" or "icon-xs" variant="ghost"
```

- Every icon-only control has an `aria-label` and a tooltip (`RailTooltip` in the Rail, `Tooltip` elsewhere).
- Row actions (the "…" or "+") are siblings of the row's own button, never nested in it. "…" opens the row's context menu (`openContextMenuFrom` in `lib/context-menu-key.ts`), so right-click, Shift+F10 and "…" show the same menu.
- Bordered on/off pills use `pressedToggleClass` (`ui/panel-styles.ts`); a segmented track uses `SEGMENTED_TRACK_CLASS` with `segmentClass` (active = keycap).

## Correct

```tsx
// CustomAgentDialog.tsx
<Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
  Cancel
</Button>
<Button size="sm" onClick={() => void handleSave()} disabled={saving}>
  {saving ? 'Saving…' : 'Create Agent'}
</Button>
```

## Incorrect

```tsx
<Button variant="primary">Save</Button>
<Button className="bg-blue-600 text-white">Save</Button>
```
