# Phone and accessibility

## Phone

Breakpoint: phone is below 768px (`md:`). Design the phone at 390px and check 320px.

- Text: at least 15px for anything a person reads; 14px for descriptions under a larger lead and for meta. Mock UI inside a picture is exempt.
- Fields: `text-base pointer-fine:text-sm`, never `md:text-sm`. iOS zooms into a field under 16px and does not zoom back.
- Tap targets: at least 44px. When the visual must stay small (a logo, a footer link), add the hit area without moving the layout: `-my-[11px] py-[11px]`, or `inline-flex min-h-11 items-center md:min-h-0`.
- Actions stack full width; the phone primary is "Get Troupe for your Mac" (`DownloadCta` does this).
- Choices on a phone open a bottom sheet (UI SDK `Drawer`), not a centred dialog. The sheet caps its height (`max-h-[calc(100dvh-12px)]`), and an inner box scrolls when the content is taller than the screen (`overflow-y-auto`) and clears the home indicator (`pb-[max(34px,env(safe-area-inset-bottom))]`). Never put `overflow-*` or `overscroll-contain` on `DrawerContent` itself: on a touch screen the drawer moves by scrolling its own viewport, and a scroll box on the sheet keeps the swipe, so the sheet can't be dragged down.
- Rows that scroll sideways (tour tabs, testimonials) use native scroll + `snap-x` + `scrollbar-none`. Never a JS carousel.
- Heights: `dvh`, never `vh` or `h-screen`.
- Hover: Tailwind's `hover:` is already limited to hover devices. Never put information or an action behind hover only.

## Focus

Every control: `outline-hidden focus-ring`.

```tsx
// Correct — src/components/ui/Faq.tsx
<AccordionTrigger className="… outline-hidden focus-ring select-none …">

// Incorrect — Tailwind 4: outline-none sets --tw-outline-style: none, so the
// focus-visible outline never draws
<AccordionTrigger className="… outline-none focus-visible:outline-2 focus-visible:outline-focus-ring">
```

`outline-none` is allowed only where focus shows another way: menu rows (`data-highlighted:bg-foreground/6`) and the menu and sheet containers.

## Semantics

- One `h1` per page; one `h2` per section, linked with `aria-labelledby`.
- A link goes somewhere (`<a href>`); a button does something (`<button type="button">`). A link styled as a button is still an `<a>` (see buttons.md).
- Status that changes (form result, copy result, loading, errors) sits in a live region that is always in the DOM: `aria-live="polite"`, `role="status"`, or `role="alert"` for errors. Mounting the region with its first message is often not announced.
- Images that carry content have `alt` that says what the screenshot shows. Decorative images and mock UI are `aria-hidden` / `alt=""`.
- Error states say what happened and give a way out (see `routes/RouteError.tsx`). A list that failed to load never says "empty".
- Disabled while busy: a button that sends a request is `disabled` until it returns.
