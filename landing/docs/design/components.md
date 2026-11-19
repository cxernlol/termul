# Components

Shared parts live in `src/components/ui/`, `src/components/sections/`, `src/components/download/`, `src/components/app-ui/`. Use what exists. A new shared component needs a reason no existing part covers.

## Page layout

- Every homepage section wraps its content in `Container` (`sections/Container.tsx`): max 1248px content, 24px side padding. Full-bleed parts (the closing CTA photo, phone crops) break out with `-mx-6 md:mx-0`.
- Section top space: 72–88px on phones, 144–160px on desktop (`pt-[88px] md:pt-40`). The section after the hero shot starts at its own rule (`WorksWith`: `py-10 md:py-12`).
- A section has one `h2` (with an `id` for `aria-labelledby`). The page has one `h1` (the hero). Testimonial pages pass `as="h1"` to `SectionHeader`.
- Anchored sections (`#download`, `#agents`, `#tour`) carry `scroll-mt-6`.
- `SectionHeader` (`ui/SectionHeader.tsx`) is for the testimonial pages only. Homepage sections write their own `h2` with the type scale in tokens.md.

## FAQ (`ui/Faq.tsx`)

Use `Faq` for questions with answers that can be long. One item open by default (`defaultValue={['what']}`). Answers come from `src/data/faq.tsx`; links in answers point to `/docs/…`. For a list that does not expand, use a plain list.

```tsx
// Correct — src/components/sections/FaqSection.tsx
<Faq.Root defaultValue={['what']}>
  {FAQ.map((item) => (
    <Faq.Item key={item.id} value={item.id}>
      <Faq.Question>{item.question}</Faq.Question>
      <Faq.Answer>{item.answer}</Faq.Answer>
    </Faq.Item>
  ))}
</Faq.Root>

// Incorrect — a hand-made disclosure: no keyboard, no find-in-page, no height motion
<details><summary>Is Troupe free?</summary>…</details>
```

## Logos and icons

```
What mark do you need?
 ├── The Troupe mark → TroupeMark (ui/Icons.tsx), or <Logo /> for the home link
 ├── An agent (Claude Code, Codex, Gemini CLI, Antigravity, OpenCode, Cursor) → <AgentLogo agent="…" />
 ├── An MCP server in mock UI (Paper, Supabase, Context7, GitHub, Linear) → <McpLogo id="…" />
 ├── An OS or brand on a button (Apple, GitHub, Windows, Linux) → AppleIcon, GitHubIcon, OsIcon …
 ├── A stroke icon in mock app UI → app-ui/icons.tsx (PlusIcon, GearIcon, SpinnerIcon …)
 └── A tour tab icon → tour/icons.tsx
```

- Logos are the official marks: Simple Icons paths or the vendor's own file in `public/logos/`. Never redraw a logo, never use a letter in a square instead of a logo.
- Agent and MCP data lives in `ui/agents.ts` and `app-ui/mcp.ts`. Add a new agent there with its official SVG in `src/assets/agents/`, only if it is in the app's ACP registry (`src/renderer/assets/agent-icons/acp/agents.json`).
- Decorative icons are `aria-hidden`. An icon-only control gets an `aria-label` that names the action ("Open menu", "Close").

## Testimonials (`sections/Testimonials.tsx`)

Cards are at least 220px tall and grow with the quote; nothing is cut. Desktop: 3 columns, a short last row is centred. Phone: one row that scrolls sideways with snap and dots. The avatar falls back to initials.

## Which part to use

| Need | Use | Not |
|---|---|---|
| Download | `DownloadCta` | a hand-made link |
| Menu of actions or links | `DownloadMenu` pattern on UI SDK `Menu` | a custom popover |
| Phone-only choice | UI SDK `Drawer` (see `DownloadSheet`) | a modal centred on a phone |
| Tabs that auto-advance | `FeatureTour` | a carousel library |
| Status text | a word plus its colour | colour alone |
