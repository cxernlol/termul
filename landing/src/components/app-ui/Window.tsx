import type { ComponentProps, CSSProperties } from 'react';

import { cn } from '@/lib/utils';

export type ShotBackground = 'pastel' | 'orange' | 'green' | 'dusk';

const BACKGROUND: Record<ShotBackground, string> = {
  pastel: 'url(/media/bg-pastel.webp)',
  orange: 'url(/media/bg-orange.webp)',
  green: 'url(/media/bg-green.webp)',
  dusk: 'url(/media/bg-dusk.webp)',
};

/**
 * The photo stage behind an app window: dithered photo, clipped.
 * Paper "Shot" + "BG · CSS dither" frames.
 */
export function Stage({
  background,
  className,
  style,
  ...props
}: ComponentProps<'div'> & { background: ShotBackground }) {
  return (
    <div
      className={cn('dither relative overflow-clip bg-window', className)}
      style={{ '--dither-image': BACKGROUND[background], ...style } as CSSProperties}
      {...props}
    />
  );
}

/** An app window on the stage: 10px corners, hairline edge, deep shadow. */
export function AppWindow({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'absolute overflow-clip rounded-[10px] border border-hairline bg-background shadow-[0_24px_48px_-12px_#00000099]',
        className,
      )}
      {...props}
    />
  );
}
