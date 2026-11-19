# Buttons

## Button (`src/components/ui/Button.tsx`)

Use `Button` for actions on this page (open the download menu, copy a link, submit a form, moderate a testimonial). For a link that must look like a button, use a plain `<a>` with `buttonClassName()`; for a text link inside copy, use a plain `<a>` with `text-primary` or the footer link style.

Variants: `primary` (the default), `secondary`, `ghost`. Sizes: `sm` (32px), `md` (40px, default), `lg` (44px), `touch` (44px, full width, 16px text). Nothing else exists. An unlisted variant or size is a bug, not an option.

- `primary`: blue fill + emboss. Only the download control and a page's single main action (404 "Back to home", route error "Reload the page", form submit). One per view. The one exception is the admin list (`/testimonial/list`): each card's "Approve"/"Restore" is that card's main action, at `size="sm"`.
- `secondary`: control fill + 0.5px edge. "View on GitHub", "Read the docs", "Copy link", admin actions.
- `ghost`: text only. The header "GitHub" link.

```
Is it the one action the page exists for (download, submit, the only way back)?
 ├── Yes → primary (default)
 └── No
      ├── Is it a quiet link in the header or a toolbar? → ghost, size sm
      └── Default → secondary
```

`primary` is the component default, so a bare `<Button>` is blue. Pass `variant="secondary"` for everything that is not the main action.

```tsx
// Correct — src/components/sections/Hero.tsx
<a
  href={GITHUB_REPO_URL}
  className={buttonClassName({ variant: 'secondary', size: 'lg', className: 'h-11 w-full px-4 text-base md:w-auto md:px-8 md:text-[15px]' })}
>
  <GitHubIcon size={16} />
  View on GitHub
</a>

// Incorrect — a second blue button next to "Download", and an <a> passed to render
<Button render={<a href={GITHUB_REPO_URL} />}>View on GitHub</Button>
```

Why a plain `<a>`: the link text then sits inside the `<a>` in the source, so linters and readers see it; the classes are the same.

Rules:
- Labels: sentence case, a verb, at most 4 words ("Copy link", "View on GitHub").
- An icon goes before the label, 14px in `sm`, 16px in `lg`, 17px in `touch`.
- Phone: actions stack full width (`w-full md:w-auto`), 44px tall, 16px text.
- Busy: `disabled` while the request runs and a label that says so ("Submitting…").

## Download control (`src/components/download/`)

Always use `<DownloadCta />`. Never build a download button or link to a release file by hand.

- From 768px: "Download for <OS>" opens `DownloadMenu` (Stable and Nightly, chip line, "All releases").
- Below 768px: "Get Troupe for your Mac" opens `DownloadSheet` (channel picker, "Send to my Mac", "Copy link"). A phone cannot install the app.
- `compact` is the header version ("Download", `sm`).
- A shared link with `?channel=nightly` (from "Send to my Mac" / "Copy link") opens on Nightly: the desktop button reads "Download Nightly for <OS>", the menu lists Nightly first with a "From your link" badge, and the sheet starts on Nightly. Read it with `useLinkedChannel()` (`src/lib/linked-channel.ts`), never from `window.location` during render: it must be null in the prerendered HTML.

```tsx
// Correct — src/components/sections/ClosingCta.tsx
<DownloadCta />

// Incorrect — hardcoded file and version; it goes stale at the next release
<a href="https://github.com/gnoviawan/troupe/releases/download/v0.4.60/…_aarch64.dmg">Download</a>
```

Versions, dates and file links come from `useDownload()` (snapshot first, `/api/releases` after hydration). Never write a version number in JSX.

`DownloadMenu`, `DownloadSheet` and `Faq` are compound parts. Import them as a namespace: `import * as DownloadMenu from './DownloadMenu'`, then `<DownloadMenu.Root>`.
