# Troupe landing design system

usetroupe.dev is dark only, quiet and tactile: near-black ground, raised cards with a 0.5px edge, one blue filled button for "download", real Troupe screens instead of illustrations of ideas, and motion only where it explains something. The visual source is the Paper file "Termul Design System", page "Troupe Landing Page": desktop artboard "Troupe · Landing · Feature tour · Blue emboss buttons" (1440) and phone artboard "Troupe · Landing · Mobile (390)". Read exact values from Paper with `get_jsx` / `get_computed_styles`; never from a screenshot.

This file is the entry for agents working in `landing/`. Topic rules live in `docs/design/`. Repo rules (checks, CSP, facts) are in `AGENTS.md`. The app's `DESIGN.md` at the repo root does not apply here.

## Layer rule

Components use the semantic tokens in `src/index.css` `@theme` (`bg-card`, `text-muted-foreground`, `border-hairline`, `shadow-menu`). Never Tailwind palette primitives (`bg-zinc-900`, `text-white`, `bg-black/50`). Never the legacy names (`porcelain`, `pitch-black`, `aether-blue`, `emerald`, `warning-red`, `gray-300`, `gray-600`, `border-subtle`, `light-steel`); they exist only for the old testimonial and legal pages.

```
Need a colour, shadow or curve?
 ├── Is there a token in src/index.css @theme?
 │    └── Yes → use it
 ├── Is it inside a mock app window (tour scene, bento shot) and Paper uses a hex?
 │    └── Yes → the hex, with a comment naming the Paper value
 └── No → stop. Copy the value from src/renderer/index.css into @theme first.
```

Tokens are copied from the app, not imported, so the landing keeps its own build and CSP. When you add one, copy the dark value from `src/renderer/index.css`.

## Rules that apply everywhere

- One blue filled button per view, and it is "download". Everything else is `secondary` or `ghost`. Two blue buttons means the page has no next step.
- Real facts only: no invented stats, logos, people or features. Every claim must match the app or the docs at `/docs/`.
- Demo screens use demo names (marketing-site, billing-api, "My Mac", "Personal") and Logoipsum marks. Never a real private project or person.
- Every interactive control: `outline-hidden focus-ring`, never `outline-none` alone (in Tailwind 4 it also cancels `focus-visible:outline-*`).
- Every motion has a reduced-motion path; nothing animates on page load.
- Phones (< 768px): text at least 15px (descriptions and meta 14px), fields 16px, tap targets at least 44px. Phone rules beat the desktop design.
- Sentence case, a real "…", no em dash in UI copy. ASD-STE100 for docs and comments.

## Files

- [docs/design/tokens.md](docs/design/tokens.md): colours, surfaces, shadows, radius, type scale
- [docs/design/buttons.md](docs/design/buttons.md): `Button`, links that look like buttons, the download control
- [docs/design/components.md](docs/design/components.md): layout, FAQ, logos and icons, which shared part to use
- [docs/design/window-shots.md](docs/design/window-shots.md): mock Troupe UI in the tour and bento, tour tabs, card illustrations
- [docs/design/motion.md](docs/design/motion.md): curves, durations, the press, menus, tour and loops
- [docs/design/phone-and-a11y.md](docs/design/phone-and-a11y.md): breakpoint, targets, fields, focus, live regions
- [docs/design/content-and-meta.md](docs/design/content-and-meta.md): copy, assets, testimonials, releases, page meta
