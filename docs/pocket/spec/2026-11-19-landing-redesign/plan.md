# Landing redesign: implementation plan

Date: 2026-11-19. Status: approved plan, no code yet.
Target: one PR to `dev` that replaces the marketing site in `landing/`.

## 1. Goal and scope

Replace the homepage of `usetroupe.dev` with the new design from Paper. Keep the other routes and the backend.

| Area | Action |
|---|---|
| `/` (HomePage) | Replace with the new design (desktop and mobile). |
| Header, Footer | Replace with the new design. |
| `/testimonial/submit`, `/testimonial/list` | Keep. Move to the new layout and tokens. |
| `/privacy`, `/terms`, 404 | Keep. Move to the new layout and tokens. |
| `functions/api` (Hono, D1, R2) | Keep. Add the `/releases` route. |
| Contributors section, sync script, tests | Remove. The new design has no place for it. |
| Testimonials on the homepage | Keep the API data (`fetchApprovedTestimonials`). Fall back to the 6 quotes from the design. |

Out of scope: an email backend, a router change, any change to `website-docs/`.

## 2. Source of truth

Paper file "Termul Design System", page "Troupe Landing Page".

| Use | Artboard |
|---|---|
| Desktop | "Troupe · Landing · Feature tour · Blue emboss buttons" |
| Mobile page | "Troupe · Landing · Mobile (390)" |
| Mobile download sheet | "Troupe · Landing · Mobile · Get the link (sheet)" |
| Tour motion | "Feature tour · Keyframes" |
| Card illustration motion | "More in one place · Illustration keyframes" |

Other landing artboards are history only.

Read exact values with Paper `get_jsx` and `get_computed_styles`. Do not read sizes or colors from screenshots.

### Design tasks before code (in Paper)

1. Sheet: change "Email me the link" to "Send to my Mac" (Q2).
2. Canvas tab: redraw the Troupe Canvas UI from the user's screenshot (2026-11-19, `design.figcraft` tab). Make 4 keyframes:
   1. Empty page.
   2. The agent creates the "Home" frame. A layer appears.
   3. Heading, button and image layers appear one by one in the frame and in Layers.
   4. The agent selects the button. The green selection box shows. The Design panel shows Position, Layout and Fill.

   No agent cursor: Troupe shows no cursor for canvas edits (the agent overlay exists only in the browser, `src-tauri/src/browser_automation/engine/assets/agent_overlay.js`). Use generic content, not the user's project list.
3. Export the static window shots as WebP at 1× and 2×, with a desktop crop and a mobile crop:
   - hero window
   - bento window backgrounds: Agents, Phone
4. Make a 1200×630 `og-image.png` from the new hero (Q18).

Status 2026-11-19: tasks 1–4 are done.

- Task 2: Canvas states are "State · Canvas 1/4" to "4/4" in "Feature tour · All states (full stage)". Notes and timings are in "Feature tour · Keyframes", row "Canvas".
- Task 3: exports are in `assets/shots/` (hero, bento-agents, bento-phone; desktop and mobile; 1× and 2×).
- Background photos are in `assets/backgrounds/` (bg1–bg4, 2048px JPG). Convert them to WebP in the build.
- Task 4: `assets/og-image.png` (Paper artboard "Troupe · OG image (1200×630)").

Before ship, see risk "Private project names" in section 10.

## 3. Decisions

| # | Decision | Reason |
|---|---|---|
| Q1 | The artboards in section 2 are the only source. | One truth for code review. |
| Q2 | No email backend. The sheet has "Send to my Mac" (Web Share API) and "Copy link". If `navigator.share` is missing, show only "Copy link". | A backend needs a mail provider, rate limits and privacy text. Email is a follow-up. |
| Q3 | Scope as in section 1. | The redesign is the homepage; the other routes work today. |
| Q4 | Copy the dark tokens the design uses from `src/renderer/index.css` into `landing/src/index.css` `@theme`. Do not import from `src/renderer`. Rebuild `Button` with the app variants. | The landing stays a separate app, with the same build and the same CSP. |
| Q5 | Hybrid visuals. Static window shots are WebP in `<picture>`. Everything that moves or reflows is code: the tour UI, bento menus and lists, the download menu, the sheet, and the card illustrations (inline SVG). | Real UI, sharp text, and reflow on mobile, without coding full windows. |
| Q6 | `GET /api/releases` in the Hono function, cached at the edge (`s-maxage=600`). A build-time snapshot (`scripts/sync-releases.ts`) feeds prerender, the fallback, and JSON-LD `softwareVersion`. | Nightly changes every night; the site deploys only on push or after a stable release. |
| Q7 | Detect OS and chip on the client. Apple silicon is the default when unknown. Windows and Linux get their own button label and installer. Prerendered HTML shows macOS. | One-click download of the correct file. |
| Q8/Q9 | 5 tour tabs: Accounts, Canvas, Automation, Browser, Remote. Canvas is built from the user's screenshot. | All 5 tabs in one style, with real UI only. |
| Q10 | UI SDK (`@ui-sdk/react`, `@ui-sdk/core`), pinned to an exact beta version, wrapped as our own compound components. It replaces Radix avatar and tooltip. | It has Tabs, Menu, Drawer, Accordion, Carousel and SSR. The wrappers keep a breaking change local. |
| Q11 | CSS-driven motion with a small timeline hook, following the emil-animations rules (section 6). Remove `motion`, `transitions*.css`, `infinite-slider` and the motion-token test. | No JavaScript per frame; transitions can be interrupted. |
| Q12 | Inter Variable from `@fontsource-variable/inter`. Paper Mono 400 and 500 WOFF2 copied from `github.com/paper-design/paper-mono`, with `OFL.txt`. Remove Google Fonts and "Neue Haas". | No third party for fonts, no render-blocking `@import`. Paper Mono is not on npm. |
| Q13 | Links as in section 4.6. | The docs site is on the same domain at `/docs/`. |
| Q14 | Tests as in section 8. | The old tests check the old design. |
| Q15/Q16 | One PR to `dev`, with commits split by area (section 7). The PR knowingly goes over the 50-file limit in `AGENTS.md`, with the user's approval. State this in the PR body. | The user asked for one PR. Commits keep the review readable. |
| Q17 | Keep React Router 7 with `vite-plugin-react-ssg`. | Prerender depends on it. The site has about 6 routes. `website-docs` also uses React Router. |
| Q18 | New title, description, OG image and sitemap. Keep GTM and Cloudflare Insights. Update the CSP. | The current meta describes the old design. |
| Q19 | This file, plus `landing/AGENTS.md`. | Root `AGENTS.md` excludes `landing/`. |
| 18 | Browser pass with `/ego-browser` before review (section 9). | Check the real page against Paper. |

## 4. Architecture

### 4.1 Stack after the change

- React 19.2, React Router 7, Vite 8, TypeScript, `vite-plugin-react-ssg` (unchanged).
- Tailwind CSS 4.3 (unchanged).
- UI SDK `@ui-sdk/react` and `@ui-sdk/core`, exact version (new).
- Cloudflare Pages and Hono functions (unchanged; new `/releases` route).
- Removed: `motion`, `@radix-ui/react-avatar`, `@radix-ui/react-tooltip`, `react-use-measure` (if only `infinite-slider` uses it), `lucide-react` and Hugeicons if no new file uses them.

### 4.2 File tree (`landing/src`)

```
components/
  primitives/                 UI SDK wrappers (compound components)
    download-menu/            DownloadMenu.* : dropdown on desktop, Drawer sheet on mobile
    faq.tsx                   Faq.*
    tooltip.tsx
  ui/
    button.tsx                variants primary | secondary | ghost; sizes sm | md | lg | touch
    logo.tsx
    brand-icons.tsx           Apple, GitHub, Windows, Linux (filled)
    agent-logos.tsx           Claude Code, Codex, Gemini CLI, OpenCode, Cursor
  layout/
    header.tsx                desktop nav; mobile: logo + 44px menu button
    footer.tsx
  sections/
    hero.tsx, hero-shot.tsx, works-with.tsx, bento.tsx, more-in-one-place.tsx,
    closing-cta.tsx, facts.tsx, testimonials.tsx, faq-section.tsx
  tour/
    feature-tour.tsx          FeatureTour.*
    tabs/accounts.tsx, canvas.tsx, automation.tsx, browser.tsx, remote.tsx
    app-ui/                   window chrome, composer, account menu, limit notice,
                              suggestion card, consent card, remote popover (QR), canvas UI
  bento/                      model picker, subagent list, worktree menu, connectors menu
  illustrations/              canvas.tsx, automations.tsx, skills.tsx, accounts.tsx (inline SVG)
lib/
  releases.ts                 types, GitHub parser, asset picker
  platform.ts                 OS and chip detection
  use-releases.ts             snapshot first, then /api/releases after hydration
  use-tour-timeline.ts        reducer + timer
  use-in-view.ts              IntersectionObserver (pause off screen)
  use-reduced-motion.ts       keep
  links.ts                    updated targets
  testimonials-api.ts         keep
data/
  releases.snapshot.json      generated at build time
  testimonials.ts             6 fallback quotes from the design
  faq.ts, tour.ts             copy
```

Keep the route files and `LegalPage`. Update them to the new layout.

### 4.3 Component APIs (emil-component-design)

Rules for every component:
- Composition over configuration.
- Compound parts share state through context.
- `value` / `defaultValue` / `onValueChange` for state.
- `ref` passes through (React 19 prop).
- Remaining props spread to the DOM element.
- `className` is the escape hatch; `asChild` where a link must render.

```tsx
<DownloadMenu.Root defaultChannel="stable">
  <DownloadMenu.Trigger asChild><Button size="lg">…</Button></DownloadMenu.Trigger>
  <DownloadMenu.Content>             {/* Menu on desktop, Drawer at < 768px */}
    <DownloadMenu.Label>Choose a release channel</DownloadMenu.Label>
    <DownloadMenu.Channel value="stable" />
    <DownloadMenu.Channel value="nightly" />
    <DownloadMenu.Footer />          {/* chip line, Intel link, All releases */}
  </DownloadMenu.Content>
</DownloadMenu.Root>

<FeatureTour.Root defaultValue="accounts" autoAdvance>
  <FeatureTour.List>
    <FeatureTour.Tab value="accounts">Accounts<FeatureTour.Progress /></FeatureTour.Tab>
    …
  </FeatureTour.List>
  <FeatureTour.PauseButton />
  <FeatureTour.Panel value="accounts"><AccountsTab /></FeatureTour.Panel>
</FeatureTour.Root>

<Faq.Root defaultValue={["what"]}>
  <Faq.Item value="what"><Faq.Question>…</Faq.Question><Faq.Answer>…</Faq.Answer></Faq.Item>
</Faq.Root>
```

The mobile sheet content is the same `DownloadMenu.Channel` parts in a segmented control, plus the "Send to my Mac" and "Copy link" buttons.

### 4.4 Tokens (copied, not imported)

Copy the dark values from `src/renderer/index.css` (theme variables, about lines 160–430) and `src/renderer/lib/themes/termul-brand.ts`. Add a header comment with the source paths.

- Surfaces: `background`, `foreground`, `card`, `popover`, `muted`, `muted-foreground`, `border`, `primary`, `primary-foreground`.
- `primary-fill` with hover `#0e6abe`.
- `shadow-emboss`: `0 0 0 0.5px #000, 0 1px 3px #000000b3, inset 0 0 0 0.5px #ffffff1f, inset 0 1px 0 #ffffff66, inset 0 -2px 0 #00000059`.
- `control-fill` (= muted) and `shadow-control`: `0 0 0 0.5px <popover-edge>, 0 1px 2px rgb(0 0 0 / .5)`. `popover-edge` = popover mixed 19.5% toward foreground.
- Radius: buttons 8px; menus 12px; cards 12px.

Phone rule (memory "Phone overrides DS"):
- 15px text floor (14px for descriptions and meta lines);
- 44px hit targets;
- 16px font in fields.

### 4.5 `/api/releases` contract

Route in `functions/api/[[path]].ts`, logic in `functions/api/releases.ts`. Optional `GITHUB_TOKEN` secret for the rate limit.

```ts
type ReleaseChannel = {
  version: string            // "0.4.60" | "0.5.0-nightly"
  tag: string                // "v0.4.60" | "nightly"
  publishedAt: string        // ISO date
  build?: number             // nightly run number, e.g. 108
  commit?: string            // nightly short sha
  releaseUrl: string
  assets: { macArm?: string; macIntel?: string; windows?: string; linuxAppImage?: string }
}
type ReleasesResponse = { stable: ReleaseChannel | null; nightly: ReleaseChannel | null; fetchedAt: string }
```

- Headers: `Cache-Control: public, s-maxage=600, stale-while-revalidate=3600`.
- Pick assets by **suffix**, not by product name. Stable assets are still named `Termul.Manager_0.4.60_*`; nightly assets are `Troupe_0.5.0-nightly.*`.
  - `_aarch64.dmg` (macArm)
  - `_x64.dmg` (macIntel)
  - `_x64-setup.exe` (windows)
  - `_amd64.AppImage` (linuxAppImage)
- The `nightly` release keeps assets of more than one build (for example 107 and 108). Pick the asset set with the **highest build number** from `<ver>-nightly.<date>.<run>.<sha>`.
- On a GitHub error, return the last cached value. If there is none, return 503. The client keeps the snapshot.

### 4.6 Links (`lib/links.ts`)

| Link | Target |
|---|---|
| Features | `#tour` |
| Agents | `#agents` |
| Docs, Read the docs | `/docs/` |
| Changelog | GitHub Releases |
| GitHub, Issues, Releases | GitHub repo pages |
| Getting started, Agent setup, Browser and phone, Server API | `/docs/getting-started`, `/docs/agent-setup`, `/docs/remote`, `/docs/server-api` |
| Download (nav) | the same `DownloadMenu` |
| FAQ "Can I use Troupe from my phone?" | answer links to `/docs/remote` |
| Privacy, Terms | small row in the footer |

### 4.7 Platform detection (`lib/platform.ts`)

1. `navigator.userAgentData.getHighEntropyValues(['architecture', 'platform'])` where the browser supports it.
2. Otherwise: the user agent for the OS, and the WebGL renderer for the chip ("Apple M…" means arm).
3. Unknown macOS chip: arm.

Result: `{ os: 'mac' | 'windows' | 'linux' | 'other', arch: 'arm' | 'x64' | 'unknown' }`. Run it only after hydration. The prerendered HTML is macOS.

## 5. Content

- Copy is exactly as in the Paper artboards.
- Hero title on desktop: "Any Agents in One UI". On mobile: break after "Agents".
- Mobile primary button: "Get Troupe for your Mac". It opens the sheet. Desktop primary: "Download for macOS" with a chevron. It opens the menu.
- Tour copy, steps and agent rows: from the "Feature tour" body and the keyframes artboard.
- Release text in the menu comes from `/api/releases`, not from the design. The design values (v0.4.60, Build 108) are examples.

## 6. Motion spec (emil-animations)

| Part | Rule |
|---|---|
| Page load | No entrance animation. Sections are static. |
| Tour steps | CSS transitions on `data-step` / `data-state`. UI parts 200–300ms, enter curve `cubic-bezier(0.23,1,0.32,1)`. Things that move on screen (Canvas layers, Automations dot) 400–500ms ease-in-out. Timings per tab come from "Feature tour · Keyframes". |
| Tab change | Click: 200ms cross-fade. Keyboard (arrows): no animation. |
| Tour progress | `linear` `scaleX` keyframes. Pause sets `animation-play-state: paused`. Auto-advance pauses on hover, on focus inside the tour, when off screen, and when the tab is hidden. |
| Illustration loops | `@keyframes` on SVG groups, `transform` and `opacity` only. `stroke-dashoffset` for the pen scribble and the Accounts arrow. Loop lengths: Canvas 6.4s, Automations 3.6s, Skills 3.2s, Accounts 4.0s (from "Illustration keyframes"). Run only in view. |
| Download menu | Opens in 180ms (scale 0.97→1, opacity), `transform-origin` at the trigger. Closes in 130ms. |
| Mobile sheet | UI SDK Drawer motion (scroll-snap on touch, spring for pointer). |
| Buttons | `:active` scale 0.97, 150ms ease-out, as the app `PRESS`. Hover motion only under `(hover: hover) and (pointer: fine)`. |
| Reduced motion | Tour: no auto-advance; steps change at once (opacity ≤ 200ms only). Illustrations: still frame. No base state at `opacity: 0`. |

## 7. Commit order (one PR)

1. **Release data**:
   - add `functions/api/releases.ts` and the route;
   - add `scripts/sync-releases.ts` and the `prebuild` hook;
   - add `data/releases.snapshot.json`;
   - add `lib/releases.ts`, `lib/platform.ts` and their unit tests;
   - make JSON-LD `softwareVersion` come from the snapshot.
2. **Foundation**:
   - add tokens to `@theme` and the fonts (Fontsource Inter, `public/fonts/paper-mono/*` + `OFL.txt`);
   - add UI SDK (exact version) and install the `ui-sdk` skill;
   - rewrite `ui/button.tsx`;
   - add `primitives/download-menu`, `primitives/faq` and `primitives/tooltip`;
   - add the new `header.tsx` and `footer.tsx`.
3. **Static sections**: Hero, hero shot (`<picture>` WebP), Works with, Bento (code menus and lists on WebP backgrounds), Closing CTA (CSS dither background), Facts, Testimonials (API + fallback, scroll-snap row on mobile), FAQ.
4. **Feature tour**: `tour/feature-tour.tsx`, `use-tour-timeline.ts`, `app-ui/*`, and the Accounts, Automation, Browser and Remote tabs. Remote needs `qrcode.react` (add it to `landing/`).
5. **Canvas tab and illustrations**: `tabs/canvas.tsx` (after the Paper Canvas keyframes are done) and `illustrations/*` from the Paper SVGs.
6. **Switch and cleanup**:
   - `HomePage` uses the new sections;
   - `/testimonial/*`, `/privacy`, `/terms` and 404 use the new layout;
   - delete `feature-visuals/*`, the old sections, `FeatureVideo`, `ProductCta`, `SectionHeader`, `infinite-slider`, `avatar`, the old `tooltip`, `transitions*.css`, `smooth-scroll`, `read-css-time`, `useInViewOnce`, `clamp-tooltip-x`, `data/features.ts`, `data/more-features.ts`, `data/contributors.ts`, `lib/contributors.ts`, `scripts/sync-contributors.ts`, `public/features/*.mp4`, `bg-termul.webp`, `termulmock.png`, and the old tokens;
   - remove the old dependencies;
   - update meta, `og-image.png`, the sitemap and `_headers.yaml` (CSP);
   - update `verify:prerender`.
7. **Tests**: as in section 8. Regenerate the Playwright snapshots.

`ScrollContainer` (OverlayScrollbars) stays unless it blocks the sticky nav or the Drawer. If it blocks them, replace it with native scroll in step 6.

## 8. Tests and checks

- **Unit (`bun test`):**
  - release parser: asset suffixes, highest nightly build, API error, empty release;
  - platform detection: mac arm, mac Intel, Windows, Linux, unknown;
  - `use-tour-timeline` reducer: advance, pause, tab jump, reduced motion;
  - keep the testimonial API, testimonial route and `write-headers` tests.
- **E2E (Playwright)** at 1440 and 390:
  - the page renders;
  - Download menu by click and by keyboard (Enter, arrows, Esc);
  - at 390: the sheet opens, "Copy link" works, Stable/Nightly switches;
  - the tour: arrow keys, Pause stops auto-advance, reduced motion has no auto-advance;
  - FAQ open and close.
- **Visual snapshots:** new baselines at 1440 and 390. Delete the old baselines.
- **Accessibility:** add `@axe-core/playwright`; fail on serious and critical issues on `/` at both widths.
- **`verify:prerender`:**
  - homepage: "Any Agents in One UI", "Watch the troupe do the work", "One window for the whole troupe";
  - keep the testimonial, privacy, terms and 404 checks.
- **Remove:** `tests/contributors.test.ts`, `tests/e2e/contributors-section.spec.ts`, `tests/motion-tokens.test.ts`.
- **Local commands:** `bun run lint`, `bun run build`, `bun run verify:prerender`, `bun test`, `bun run test:e2e`.

## 9. Browser pass (`/ego-browser`)

Run after the code is done, before the PR is ready for review.

1. Local preview (`bun run landing:preview`). Ask the user before starting the server.
2. The Cloudflare Pages preview URL of the PR, which is the only place where `/docs/` and `/api/releases` are real.

Checks at 1440 and 390, with each section compared to its Paper artboard screenshot:

- Download menu by click and keyboard. The OS label is correct.
- Mobile sheet: drag to close, "Copy link", "Send to my Mac" (share sheet or hidden), Stable/Nightly.
- Feature tour: auto-advance, Pause, arrow keys, all 5 tabs.
- Illustrations loop and stop off screen.
- FAQ.
- Every nav and footer link resolves.

Edge cases:
- reduced motion on;
- `/api/releases` blocked (the snapshot shows);
- slow network (font swap, no layout shift).

Console: no errors, no CSP violations, no hydration warnings.

Output: a short report with screenshots per check. Fix each issue in the same PR.

## 10. Risks

| Risk | Mitigation |
|---|---|
| UI SDK is beta (`0.1.0-beta.x`, repo from 2026-10-26). | Pin the exact version. All use goes through `primitives/*` wrappers. |
| The PR goes over the 50-file limit. | User-approved exception, stated in the PR body. Commits split by area. |
| Nightly data is stale or GitHub rate-limits. | Edge cache, optional `GITHUB_TOKEN`, snapshot fallback. |
| Paper Mono is not on npm. | Copy only 2 WOFF2 weights plus `OFL.txt`. Note the source commit in a comment. |
| Stable asset names still say "Termul.Manager". | Pick assets by suffix. |
| The Canvas tab depends on Paper work. | Do design task 2 first. Commit 5 waits for it. |
| CSP blocks something new. | `write-headers.test.ts` plus the browser pass console check. |
| Private names in screenshots. | Done 2026-11-19: sidebar projects, host "Mac Faiz" and account "Faiz Personal" were renamed in Paper to demo names (marketing-site, billing-api, release-bot, help-center, field-app, docs-site, metrics-dashboard, mobile-app; "My Mac"; "Personal"). The hero, mobile hero and OG exports are updated. Keep demo names in all new screenshots. |
| License of the background photos (free background library by @uihssn). | Done 2026-11-19: the user confirmed the license allows this use. |

## 11. Follow-ups (not in this PR)

- "Email me the link" with a mail backend.
- TanStack Router only if the landing grows into an app.
- Link Changelog to a docs page if `website-docs` gets one.
