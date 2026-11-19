# Content and meta

## Copy

- Copy comes from the Paper artboards word for word. A section without Paper copy (for example a new FAQ answer) is written from the docs (`website-docs/content/docs`) and `LICENSE`, then shown to the owner.
- True facts only. No invented numbers ("10x faster"), people, logos or features. If the app cannot do it today, the page does not say it.
- Sentence case. "…" not "...". No em dash in UI copy (headings may use "—" in the page title only: "Privacy — Troupe").
- Product name: "Troupe". The old product name appears only in data that still has it (GitHub release file names, a testimonial quote). The repo's rebrand check (`bun run rebrand --check`) fails on any other use; an intended one needs a keep entry with a reason in `scripts/rebrand/rules.ts`.

## Data on the page

| Data | Source | Never |
|---|---|---|
| Versions, dates, download files | `useDownload()` ← snapshot (`scripts/sync-releases.ts`) → `/api/releases` | a version or URL in JSX |
| Testimonials | snapshot (`scripts/sync-testimonials.ts`, with 96px WebP avatars) → `/api/testimonials` | placeholder people or quotes |
| FAQ answers | `src/data/faq.tsx` | answers inline in a section |
| Tour copy | `src/data/tour.tsx` | copy inside a scene file |

Testimonial quotes stay in the author's words and language. Do not translate or edit them.

## Assets

- Window shots: WebP at 1x and 2x, desktop and phone crops (`public/media/*-desktop[@2x].webp`, `*-mobile[@2x].webp`). Give every `<img>` its `width` and `height` (or a fixed height) so nothing shifts.
- The hero image is `fetchPriority="high"`; every other image is `loading="lazy"`.
- Photos: `public/media/bg-*.webp`, 1600px. Logos: `public/logos/`. Agent marks: `src/assets/agents/`.
- New fonts or font weights: none. Inter Variable and Paper Mono 400/500 cover the design.

## Page meta

Every route calls `usePageMeta` (`src/lib/page-meta.ts`) with `title`, `description` and `path`. It writes the title, description, canonical, `og:*` and `twitter:*` tags. `index.html` holds only the shared tags (OG image, site name, theme colour).

```tsx
// Correct — src/routes/TestimonialSubmitPage.tsx
usePageMeta({
  title: 'Submit a testimonial — Troupe',
  description: 'Share how Troupe helps your workflow. …',
  path: '/testimonial/submit/',
});

// Incorrect — no canonical and no og tags: a shared link shows the homepage card
useSeoMeta({ title: 'Submit a Troupe Testimonial', description: '…' });
```

- Title pattern: "<Page> — Troupe". The homepage: "Troupe — Any Agents in One UI".
- Paths end with "/" and match `public/sitemap.xml`.
- noindex pages (404, admin, route error): `robots: 'noindex,nofollow'` and no `path`.
- A new public route: add it to `public/sitemap.xml` and to `verify:prerender` in `package.json`.
- A new third-party origin (image, script, font): add it to `scripts/_headers.yaml` (CSP) first, and say why in the PR.
