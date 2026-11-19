import type { ComponentProps } from 'react';
import { renderElement, type RenderProp } from '@ui-sdk/react/primitive';

import { cn } from '@/lib/utils';

/**
 * The app's Button (src/renderer/components/ui/button.tsx), rebuilt for the
 * landing: primary = blue fill + emboss, secondary = control fill + 0.5px edge,
 * ghost = text only. Main buttons squeeze to .97 on press.
 */
const VARIANT = {
  primary:
    'press bg-primary-fill text-primary-foreground shadow-emboss hover:bg-primary-fill-hover active:bg-primary-fill-active',
  secondary: 'press bg-control-fill text-foreground shadow-control hover:bg-control-fill-hover',
  ghost: 'text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground',
} as const;

const SIZE = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-lg px-4 text-sm',
  lg: 'h-11 gap-2 rounded-lg px-8 text-[15px]',
  /** Phone: 44px tall, 16px text, full width by default. */
  touch: 'h-11 w-full gap-2 rounded-lg px-4 text-base',
} as const;

export type ButtonVariant = keyof typeof VARIANT;
export type ButtonSize = keyof typeof SIZE;

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.01em] outline-hidden focus-ring',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render as another element, for example `render={<a href="/docs/" />}`. */
  render?: RenderProp;
};

export function Button({ variant, size, className, render, type, ...props }: ButtonProps) {
  return renderElement(
    'button',
    {
      ...props,
      type: render ? undefined : (type ?? 'button'),
      className: buttonClassName({ variant, size, className }),
    },
    render,
  );
}
