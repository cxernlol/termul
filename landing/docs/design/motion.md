# Motion

CSS only (transitions and keyframes). There is no motion library; do not add one.

```
Should it move?
 ├── Is it on the page when it loads? → no entrance animation (one exception: the hero entrance)
 ├── Is it a below-the-fold intro row (the agent list)? → scroll reveal, once (`useReveal`)
 ├── Was it caused by the keyboard (arrow keys, shortcut)? → no animation
 ├── Is it a hover? → colour only, 150ms
 └── Caused by a pointer or by the tour → animate transform and opacity, curve and duration below
```

## Values

| Part | Duration | Curve | What moves |
|---|---|---|---|
| Press (primary, secondary button) | 150ms | `--ease-out` | `scale: .97` on `:active` (the `.press` class in `Button`) |
| Hover, row highlight | 150ms | `--ease-out` | colour only |
| Menu open / close | 150ms / 120ms | `--ease-out` | opacity + `scale` from .97, origin at the middle of the trigger |
| Phone menu icon (☰ ↔ ✕) | 400ms | `cubic-bezier(0.19, 1, 0.22, 1)` | 3 lines: outer lines `translate` + `rotate` 45°, middle line `scale` x to 0 + opacity, driven by the trigger's `aria-expanded` (`MenuIcon`). No transition with reduced motion |
| Tour tab panel | 200ms in, 150ms out | `--ease-out` | opacity (cross-fade in one grid cell) |
| Tour tab pill | 300ms | `--ease-in-out` | `translate` + width (UI SDK `--active-tab-*`) |
| Tour progress | one tab (8.8s) | linear | `scale` x |
| Tour scene parts | 200–300ms appear, 150ms leave | `--ease-out` | opacity + 4px rise or scale .97 |
| Tour scene moves across the window | 400–500ms | `--ease-in-out` | transform |
| FAQ answer | 250ms | `--ease-out` | height (measured by UI SDK) |
| Card illustration loops | 3.2–6.4s | per Paper keyframes | transform, opacity, stroke-dashoffset |
| Hero entrance (first paint) | 400ms text, 600ms shot; 100ms apart | `--ease-out` | title → copy → actions and note → shot: opacity + 8px rise + `blur(2px)`; the shot: opacity + 16px rise, no blur (`.hero-in`, `.hero-in-shot` with `--n`) |
| Agent list reveal (on scroll, once) | 250ms; 30ms apart | `--ease-out` | title, then each agent: opacity + 8px rise + `blur(2px)` (`useReveal` + `.reveal-item` with `--n`) |

- Only `transform`, `opacity` (and `stroke-dashoffset` in SVG). The one exception is the 2px `blur` on small text in the hero entrance and the agent reveal; never blur a large image.
- The hero entrance waits for Inter (at most 1s): an inline script first in `<body>` of `index.html` sets `.fonts-wait` (paused animation) until `document.fonts.load()` resolves, so the hero never changes from the fallback font to Inter in mid-animation. Keep that script in `<body>`: in `<head>` it runs before the stylesheet, finds no Inter `@font-face`, and lets the animation go at once.
- Entrances keep content visible without the animation: the hero hides only in the keyframe's `from` (held by `backwards`); a scroll reveal hides only a box that was below the screen at load (`useReveal`), so painted content never disappears. The listed measured heights and the tab pill width are the only layout animations; do not add more.
- Exits are faster than entrances. Never start from `scale(0)`; never `ease-in`; never `transition-all`.
- Menus are transitions (they can reopen mid-way), never keyframes.
- Never a permanent `will-change`.

```tsx
// Correct — src/components/download/DownloadMenu.tsx
'transition-[opacity,scale] duration-150 ease-(--ease-out)',
'data-starting-style:scale-[0.97] data-starting-style:opacity-0',
'data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-120',

// Incorrect — animates everything, weak curve, starts from nothing
'transition-all duration-300 ease-in data-starting-style:scale-0'
```

## The tour

- Auto-advance stops on mouse hover, keyboard focus inside, off screen (less than 25% visible), a hidden browser tab, reduced motion, and the Pause button. Keep all six when you change it.
- Loops inside a scene pause with the tour (`.tour-stage[data-running=false]`). A new loop needs nothing extra if it is a CSS animation inside the stage.

## Reduced motion

Every file with motion has a `prefers-reduced-motion: reduce` path: no movement, opacity changes at most 200ms, loops stopped, the tour shows its final frame and does not advance. In Tailwind: `motion-reduce:transition-none` or `motion-reduce:transition-opacity` plus `motion-reduce:data-starting-style:scale-100`. Never a base state of `opacity: 0` that only the animation clears.
