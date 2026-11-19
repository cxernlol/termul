# Tokens

Source of truth: `src/index.css` `@theme`. Every name below is a Tailwind class there (`bg-<name>`, `text-<name>`, `border-<name>`, `shadow-<name>`). The site is dark only: there is no light theme and no `dark:` variant. Never add either.

## Surfaces

```
What does it sit on?
 ├── The page itself → bg-background (no class needed; body has it)
 ├── A raised block on the page (bento tile, feature card, testimonial card) → bg-card + border-[0.5px] border-border + shadow-card
 ├── A floating layer (menu, sheet) → bg-popover + shadow-menu (its ring is the edge; no border)
 ├── A control on a surface (secondary button, field) → bg-control-fill + shadow-control (Button does this)
 ├── A photo stage behind a mock window → Stage (window-shots.md); bg-window under the photo
 └── The footer → bg-card + border-t-[0.5px] border-border
```

- Bento tiles on desktop use `md:border-hairline` (#2d2e2f), as in Paper. Elsewhere edges use `border-border`.
- Structural lines are 0.5px (`border-[0.5px]`, `h-[0.5px]`). A 1px line reads as a double edge on dark.

## Text colour

| Role | Class |
|---|---|
| Headings, values, body you must read | `text-foreground` |
| Descriptions, labels, meta, lead words of a title | `text-muted-foreground` |
| Links inside copy, "Read the docs →" | `text-primary` |
| Status words in mock UI | `text-success`, `text-warning`, `text-destructive` |
| Text on the blue fill | `text-primary-foreground` |

A section title can be two-tone: lead words `text-muted-foreground`, key words `text-foreground` (Paper does this for "Everything around the chat, in one place").

## Blue

- `bg-primary-fill` (+ `-hover`, `-active`) is the fill of the one primary button. Never for a background, a card or a badge.
- `text-primary` is link and accent text (the tab progress bar, "Recommended" text).
- `bg-switch-track-on` is only the switch in mock UI.

## Shadows

| Token | Use |
|---|---|
| `shadow-emboss` | the primary button only |
| `shadow-control` | secondary button and other raised controls |
| `shadow-card` | cards, tiles, testimonial cards |
| `shadow-menu` | menus and the sheet: 0.5px ring + 1px drop + 4px drop |

No big soft blur (more than 8px) on UI. The mock app window uses `shadow-[0_24px_48px_-12px_#00000099]`, as in Paper; it is a photo-stage object, not UI.

## Radius

`rounded-lg` (8px) buttons and menu rows · `rounded-xl` (12px) cards, tiles, menus · `rounded-2xl` (16px) the tour stage and the sheet top · `rounded-[10px]` mock app windows · `rounded-full` pills, avatars, the close button. An inner radius is the outer radius minus the padding.

## Type

Fonts: `font-sans` = Inter Variable (Fontsource, preloaded); `font-mono` = Paper Mono 400 and 500 only. Mono is for versions in mock UI, step numbers, code and branch names. Never `font-semibold` or `font-bold` with mono: there is no file for it.

| Role | Phone | Desktop (md) |
|---|---|---|
| Hero h1 | 40/44, −0.03em | 56/60 |
| Section title (h2) | 28/34, −0.02em | 44/52, −0.03em (`More in one place`, testimonials: 32/40) |
| Tile and tour copy title | 19/26 · tour 26/32 | 20/28 · tour 26/32 |
| Lead under a title | 16/24 | 17/26 or 18/28 (hero) |
| Body, descriptions | 15/22 | 15/22 or 14/20 |
| Meta | 14/20 | 13/20 or 12/16 |

One weight: `font-medium` for titles and labels, normal for the rest. Hierarchy is size plus ink step, not bold. Use `text-base`/`text-sm` where they match; Paper sizes without a Tailwind step use `text-[15px]` etc. Never below 15px on a phone for text a person must read (14px for meta).

## Curves

`ease-(--ease-out)` for anything a person causes. `ease-(--ease-in-out)` only for things that move across the screen (tab pill, tour scene moves). The bare `ease-out` class is Tailwind's weak curve; do not use it.
