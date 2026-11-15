# Troupe design system

Troupe is a dark-first, dense desktop workspace: quiet surfaces, 12px rows, one blue for live work and the single primary action, and motion only where it answers a question. Colour is semantic OKLCH tokens written by `applyColorTheme` (`src/renderer/lib/themes/apply-color-theme.ts`). Shared primitives live in `src/renderer/components/ui`. `landing/` is out of scope.

This file is the entry for agents. Topic rules live in `docs/design/`. `docs/component-inventory.md` is a catalog of product surfaces, not a licence to invent variants. The visual source is the Paper file "Termul Design System" (page "Troupe Design - V2", and the component boards on the Shell page).

## Layer rule

Components use semantic Tailwind tokens (`bg-background`, `text-destructive`, `bg-overlay/60`). Never Tailwind palette primitives (`bg-red-500`, `text-white`, `bg-black/50`). Never raw hex in renderer JSX. xterm and canvas that cannot take `oklch()` read hex through `readCssTokenHex`.

```
Need a colour?
 ├── Is it a semantic token in tailwind.config.ts / index.css?
 │    └── Yes → use that token
 └── No → stop. Add a token in applyColorTheme + index.css + Tailwind. Do not hardcode.
```

## Rules that apply everywhere

- One filled primary (`Button` default or composer) per view. Two means the view has no hierarchy.
- Rows and menu items are 12/16; fields, buttons and dialog copy are 14px. Never `text-[Npx]`, never below 12px.
- The picked row in a menu or picker is a 10% fill with no tick; hover is 6% on a popover, 3% on the page.
- Only main buttons press (`scale(0.97)`); rows, menu items, chips, tabs and icon buttons answer with their fill.
- Labels are sentence case with a real "…". Status is a word or icon plus its colour, never colour alone.
- Every motion has a reduced-motion path.

## Files

- [docs/design/colors.md](docs/design/colors.md) — tokens, surfaces, component tokens, the hover / picked / focus states
- [docs/design/typography.md](docs/design/typography.md) — font stacks, the two densities, size tokens
- [docs/design/buttons.md](docs/design/buttons.md) — `Button` variants and sizes, the press rule, icon buttons and row actions
- [docs/design/menus.md](docs/design/menus.md) — menu vs panel surfaces, row kinds and heights, labels, row actions
- [docs/design/overlays.md](docs/design/overlays.md) — Dialog, Sheet, ConfirmDialog, AlertDialog, Popover, SettingsModal
- [docs/design/forms.md](docs/design/forms.md) — Input, Label, Switch, Select, Textarea, focus
- [docs/design/status.md](docs/design/status.md) — success / warning / destructive / connection, SSH, toasts
- [docs/design/motion.md](docs/design/motion.md) — when to move, curves and durations, patterns, reduced motion
