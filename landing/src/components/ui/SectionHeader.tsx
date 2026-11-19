import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type SectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  titleId?: string;
  /** Heading level. Use "h1" when this is the page's main title. */
  as?: 'h1' | 'h2';
};

/** Section title block for the testimonial pages. Static: no entrance motion. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'start',
  className,
  titleClassName,
  descriptionClassName,
  titleId,
  as: Heading = 'h2',
}: SectionHeaderProps) {
  return (
    <div className={cn(align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow ? (
        <div
          className={cn(
            'mb-6 font-mono text-xs tracking-[0.08em] text-primary uppercase',
            align === 'center' && 'flex justify-center',
          )}
        >
          {eyebrow}
        </div>
      ) : null}
      <Heading
        id={titleId}
        className={cn('mb-4 text-[32px] leading-10 font-medium tracking-[-0.02em] text-foreground md:text-[40px] md:leading-[48px]', titleClassName)}
      >
        {title}
      </Heading>
      {description ? (
        <p className={cn('max-w-xl text-base leading-6 text-muted-foreground', align === 'center' && 'mx-auto', descriptionClassName)}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
