import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/** The page column: 1248px on desktop, 24px side padding below that. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[1296px] px-6', className)} {...props} />;
}

/** Section title, as the Paper "Header" frames (32/40 on phone, 40/48 from md). */
export function SectionTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      className={cn(
        'text-[32px] leading-10 font-medium tracking-[-0.025em] text-foreground md:text-[40px] md:leading-12',
        className,
      )}
      {...props}
    />
  );
}

export function SectionLead({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-base leading-6 text-muted-foreground md:text-lg md:leading-7', className)} {...props} />;
}
