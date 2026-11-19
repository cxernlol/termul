/** Shared Tailwind classes for testimonial CMS + submit forms. */

export const testimonialPanelClass =
  'rounded-3xl border border-border-subtle bg-porcelain/[0.03]';

export const testimonialPanelInsetClass =
  'rounded-3xl border border-border-subtle bg-porcelain/[0.02]';

export const testimonialLabelClass = 'text-sm font-medium text-foreground';

// Focus: the shared 2px focus ring (see `focus-ring` in index.css). Text is
// 16px on touch screens (iOS zooms into smaller fields) and 14px with a mouse.
const fieldFocus =
  'outline-hidden focus-ring transition-[border-color,background-color] duration-200 ease-[var(--ease-out)] hover:border-porcelain/20 hover:bg-pitch-black/60 focus:border-porcelain/30 focus:bg-porcelain/[0.03] placeholder:text-muted-foreground';

export const testimonialInputClass = [
  'rounded-full border border-border-subtle bg-pitch-black/40 px-4 py-3 text-base text-foreground pointer-fine:text-sm',
  fieldFocus,
].join(' ');

export const testimonialTextareaClass = [
  'resize-none rounded-2xl border border-border-subtle bg-pitch-black/40 px-4 py-3 text-base text-foreground pointer-fine:text-sm',
  fieldFocus,
].join(' ');

const fileFieldFocus =
  'outline-hidden focus-ring transition-[border-color,background-color] duration-200 ease-[var(--ease-out)] hover:border-porcelain/20 hover:bg-pitch-black/60 focus:border-porcelain/30 focus:bg-porcelain/[0.03]';

export const testimonialFileInputClass = [
  'w-full min-w-0 cursor-pointer rounded-full border border-border-subtle bg-pitch-black/40 py-2 pl-2 pr-4 text-base text-gray-300 pointer-fine:text-sm',
  fileFieldFocus,
  'file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-porcelain/10 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-foreground file:transition-colors file:hover:bg-porcelain/20',
].join(' ');
