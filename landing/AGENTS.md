# Landing (usetroupe.dev) agent instructions

The root `AGENTS.md` excludes `landing/`. Follow this file for work in `landing/`.

## Design system

UI rules (tokens, which component and variant to use, motion, phone, meta) are in [`DESIGN.md`](./DESIGN.md) and [`docs/design/`](./docs/design/). Read `DESIGN.md` before you add or change any UI.

## Current work

The landing redesign plan is in [`docs/pocket/spec/2026-11-19-landing-redesign/plan.md`](../docs/pocket/spec/2026-11-19-landing-redesign/plan.md). Read it before you change any page, section or component.

## Rules

- **Source of truth:** the Paper artboards listed in the plan (section 2). Read values with Paper `get_jsx` and `get_computed_styles`, not from screenshots.
- **Tokens:** copied from `src/renderer/index.css` (dark values) into `landing/src/index.css`. Do not import from `src/renderer`. When the app tokens change, update the copy and its source comment.
- **Real product facts only:**
  - no invented stats, logos or testimonials;
  - testimonials come from the D1 API: the build snapshot (`scripts/sync-testimonials.ts` → `src/data/testimonials.snapshot.json`) for prerender, then `/api/testimonials` after hydration. Local dev and preview proxy GET `/api/testimonials` to production (`vite.config.ts`);
  - third-party logos are the official marks (Simple Icons paths, or the vendor's own icon file), never redrawn;
  - versions and download links come from `/api/releases` or the build-time snapshot, never hardcoded.
- **Components:** UI SDK (`@ui-sdk/react`, exact version) only through the wrappers in `src/components/primitives/`. Compound components, `value`/`defaultValue`, `ref` passes through, spread remaining props.
- **Motion:**
  - CSS transitions and keyframes only, `transform` and `opacity`;
  - no entrance animation on page load;
  - every animation has a `prefers-reduced-motion` path;
  - see the plan, section 6.
- **Phone:** 15px text floor (14px for descriptions), 44px hit targets, 16px font in fields.
- **Fonts:** Inter Variable (Fontsource) and Paper Mono (`public/fonts/paper-mono`, OFL). No third-party font hosts.
- **CSP:** a new origin needs an entry in `scripts/_headers.yaml`. `scripts/write-headers.test.ts` must pass.
- **Checks before a PR:** `bun run lint`, `bun run build`, `bun run verify:prerender`, `bun run test` (unit tests only; plain `bun test` also loads the Playwright spec and fails), `bun run test:e2e`, then the browser pass in the plan (section 9).
- **Language:** write UI copy, docs and comments in ASD-STE100 Simplified Technical English.
