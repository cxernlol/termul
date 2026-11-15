# Colors

Tokens are OKLCH `"L C H"` on `:root`. Tailwind maps `oklch(var(--token) / <alpha-value>)`. `applyColorTheme` overwrites `:root` at startup. Fallbacks live in `src/renderer/index.css`.

## Allowed layers

1. Semantic roles: `background`, `foreground`, `card`, `popover`, `primary`, `primary-fill`, `secondary`, `muted`, `accent`, `destructive`, `destructive-fill`, `success`, `success-fill`, `warning`, `connection`, `border`, `input`, `field-border`, `ring`, `focus-ring`, `overlay`.
2. Product identity: `project-{blue,purple,green,yellow,red,cyan,pink,orange,gray}` — chips, graph lanes, pickers only.
3. Legacy: `status-bar` and `status-bar-{color}`. `applyColorTheme` still writes them, but no UI paints them since the status bar left (Sidebar V2). Never use them.
4. Diff: `diff-added` (with `diff-added-foreground` and `diff-added-border` for line chrome), `diff-modified` (a changed file, not a warning). Deletions use `destructive`.
5. Terminal grid: `terminal-bg` / `terminal-fg`. `terminal-bg` equals `background`. xterm `theme.background` must use the same hex. Do not leave the xterm viewport at `#000`.

Nothing else exists. `green-500`, `amber-400`, `white`, `black` are bugs.

The default dark theme (`termul`) paints neutrals from an explicit ramp. Other themes still derive surfaces from one neutral plus a 4% brand tint. Troupe uses the Interfere blue (`termul-brand.ts`): link and text `--primary` is `#3b9eff`; the solid fill `--primary-fill` (also `--accent` and `--sidebar-primary`) is pinned to `#0d74ce` through `chrome.brandFill`, with white `--primary-foreground` (4.77:1). Hover `#0e6abe` (5.49:1) and pressed `#0e60ae` (6.36:1) are shared with Troupe Light.

| Token | Role | Source |
| --- | --- | --- |
| `background`, `terminal-bg`, `surface-darker` | Page canvas | Void `#08090a` |
| `card`, `surface-dark` | Raised panel | Carbon `#0f1011` |
| `popover`, `secondary`, `sidebar-background` | Menu, hover, sidebar | Obsidian `#161718` |
| `muted` | Recessed well | Midpoint of Obsidian and the border, same hue |
| `border`, `input` | Hairline | Graphite lightness on the Void hue (`#23252a` drifts off that hue) |
| `field-border` | Edge of text fields and select triggers | `border` lifted until it reaches 3:1 on card, background and popover (WCAG 1.4.11) |
| `foreground` | Primary copy | Bone `#e5e5e6` |
| `secondary-foreground` | Secondary labels | Mist `#d0d6e0` |
| `muted-foreground` | Muted copy | Fog `#8a8f98` |
| `ring` | Theme ink (keycap highlight, not focus) | Bone |
| `focus-ring` | Keyboard focus edge | A tint of `ring` lifted until it reaches 4:1 on card, background and popover |

The default light theme (`termul-light`) uses Interfere neutrals. The page is `#fcfcfc`, and cards and popovers are white `#ffffff`, so raised panes separate by elevation (`--elevation-*`, Interfere s-default / s-large / s-extra-large) as well as `border-border`. Brand is the same blue family as Troupe dark: fill `#0d74ce` with white text, hover `#0e6abe`, pressed `#0e60ae`. `--primary` text resolves to `#026ec6`: the AA solver darkens `#0d74ce` so it also clears 4.5:1 on the `secondary` wash (`#0d74ce` on `#f0f0f0` is about 4.3:1). `--accent` is the brand fill, not maroon. Status hues stay. Other families keep derived surfaces.

| Token | Role | Source |
| --- | --- | --- |
| `background`, `terminal-bg` | Page canvas | Interfere page `#fcfcfc` |
| `card`, `popover` | Raised panels | Container `#ffffff` |
| `sidebar-background` | Sidebar and shell | `#f6f6f6` |
| `secondary` | Hover wash | `#f0f0f0` |
| `muted` | Quiet well | `#f2f2f2` |
| `border` / `input` | Hairline / input edge | `#ededed` / `#d9d9d9` |
| `foreground` | Primary copy | gray-12 `#202020` |
| `secondary-foreground`, `muted-foreground` | Secondary and muted copy | gray-11 `#646464` (5.5:1 on the shell) |

`--primary`, `--success`, `--warning`, and `--destructive` are text-on-card tokens (AA-shifted). Solid primary / success / destructive buttons use `bg-primary-fill` / `bg-success-fill` / `bg-destructive-fill` with matching `*-foreground`. Solid warning buttons use `bg-warning text-warning-foreground`. Do not use `--accent` for new state. In Troupe themes it is the solid brand fill. Selection, hover and focus are neutral (see State). Washes stay on the text token (`bg-primary/10 text-primary`).

## Component tokens

Full CSS values (not `"L C H"`), set per theme through `ThemeChrome.tokens`. Every theme without chrome tokens gets `COMPONENT_TOKEN_DEFAULTS` in `lib/themes/component-tokens.ts` (`theme-regression.test.ts` pins them). Troupe Light overrides them in `termul-light-chrome.ts`.

| Tokens | Consumer |
| --- | --- |
| `--primary-fill-hover`, `--primary-fill-active` | `bg-primary-fill-hover`, `bg-primary-fill-active` on `default` / `composer` buttons |
| `--shadow-emboss`, `--shadow-emboss-hover` | `shadow-emboss`, `shadow-emboss-hover` |
| `--switch-track-{on,off}{,-hover,-active,-disabled}`, `--switch-thumb-{on,off}{,-disabled}`, `--switch-thumb-shadow`, `--switch-disabled-opacity` | `.switch-track`, `.switch-thumb` (index.css). Do not put `ring-*` or `shadow-*` utilities on the thumb; they override the token. |
| `--elevation-{2xs,xs,sm,md,lg,xl,2xl}`, `--elevation-{pill,panel,menu}` | `shadow-*` utilities (tailwind.config.ts) |
| `--skeleton` | `Skeleton` fill (alpha in Troupe Light, so it reads on page and card) |
| `--ghost-hover-foreground` | `ghost` hover ink. Defaults to `accent-foreground`; Troupe uses `foreground`. |
| `--control-fill`, `--control-fill-hover`, `--shadow-control` | The raised secondary control: `secondary` / `outline` buttons (`bg-control-fill shadow-control hover:bg-control-fill-hover`). Dark: a 0.5px `popover-edge` outline and a black 1px drop. Light: a 1px ink ring at 8% and a 1px drop at 12%. |
| `--popover-edge` | The 0.5px edge of popovers and panels: `popover` mixed with 19.5% `foreground` (`outline-popover-edge`). |
| `--rail-hover-panel-shadow` | `shadow-rail-hover-panel`: the drop of the V2 panel surface (model picker, mode menu, rail hover panels). |
| `--keycap-fill`, `--keycap-shadow`, `--rail-keycap-fill`, `--rail-keycap-shadow` | The `.keycap` surface, and its Rail variant inside `[data-rail-surface]`. |

Terminal ANSI colors and selection do not follow `--primary`. Troupe pins them in `termul-terminal.ts` (`palette.terminal`), so a brand change never alters terminal output.

## State

| State | On `background` / `card` | On `popover` (menus, pickers, panels) |
| --- | --- | --- |
| Hover | `bg-foreground/[0.03]` | `bg-foreground/[0.06]` |
| Rail row hover (hover and focus-within) | `bg-row-hover` (3%); a fade that ends in it uses `from-row-hover-solid`. Icon-only rows on the collapsed Rail use `bg-foreground/[0.06]`. | n/a |
| Picked / you are here | `.keycap` (index.css) | `bg-foreground/10`, no tick (`PICKER_ROW_SELECTED`, `MENU_PICKED_CLASS`) |
| A chosen card in a list | `bg-foreground/[0.03] ring-1 ring-foreground/[0.12]` | n/a |
| Active segment in a track | `.keycap` | `bg-foreground/10` |
| Focus | `focus-ring` (dim, 4:1) | `focus-ring` (dim, 4:1) |

Picked (10%) is always stronger than hover (6%), so the two never look alike. A tick belongs only to a checkbox item, where several rows can be on at once (`DropdownMenuCheckboxItem`, `ContextMenuCheckboxItem`, `Select`). A pick-one row never shows a tick: the fill says it.

The Rail paints `bg-background`, like the main area, the right panel and the tool strip (Sidebar V2, Paper 2.2); 0.5px `border` hairlines split the columns. Keycaps inside it (`[data-rail-surface]`) fill with `--rail-keycap`: `muted` in dark themes, `muted` plus 6% `foreground` in light themes. `--row-hover-solid` is flattened over `--background`. The open project row is plain; only the open chat row under it takes the keycap.

Blue (`primary`, `primary-fill`) has three jobs only: live work (a running agent, a working spinner, a drop target), the one primary button in a view, and count badges that ask for attention (`CountBadge` in `components/ui/count-badge.tsx`: the Git change count on the tool strip Changes button and the Git Changes tab, `bg-primary-fill text-primary-foreground`). Focus, selection and hover stay neutral.

## Background

```
Is it the page or the Terminal grid?
 ├── Yes → bg-background or bg-terminal-bg (same colour)
 └── No
      ├── Raised panel / modal card → bg-card
      ├── Menu / select list → bg-popover
      ├── Raised control (secondary button) → bg-control-fill + shadow-control
      ├── Recessed well → bg-muted
      ├── Hover wash → bg-foreground/[0.03] or /[0.06] (see State). Never bg-secondary on a menu row: it equals popover in Troupe Dark.
      └── Scrim behind a modal → bg-overlay/{40–90} (see overlays.md)
```

## Text

```
On background / card / popover?
 ├── Primary copy → text-foreground
 ├── Secondary copy / labels → text-muted-foreground
 ├── Disabled copy (custom chrome) → text-disabled-foreground
 └── On a solid primary / destructive / success fill → matching *-foreground
```

## Syntax

Code color is not a UI token. The editor, chat fences, and diffs share one map: `resolveSyntaxColors`. Troupe's map is `termul-syntax.ts`. Other families keep their own overrides.

Troupe follows the Cursor editor. Teal is a keyword. Peach is a declared function or type name. Blue is a name being read. Lavender is a name being declared, and also a JSX tag. Pink is a string. Comments stay neutral gray. Property names stay on the foreground.

Roles that sit next to each other stay at least 15° apart in OKLCH hue. Do not use the olive, brown, and khaki set from VS Code Dark+ (`#6a9955`, `#ce9178`, `#dcdcaa`). Do not use the UI blue (`primary`) as a syntax hue. Each syntax color must clear WCAG AA (4.5:1) on the theme background and on the card.

## Incorrect

```tsx
// Incorrect — palette primitive
<p className="text-red-400">Failed to load</p>
<div className="bg-black/50" />
```

```tsx
// Correct — from FileExplorer.tsx
<p className="text-sm text-destructive">Failed to load project files.</p>
<div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50" />
```
