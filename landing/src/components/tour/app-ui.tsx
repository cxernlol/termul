import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Shared window chrome for tour scenes (Paper "Window" › "Tab bar").
 * A scene draws everything inside the 900×640 window; it can use these parts.
 */
export function TrafficLights() {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-2">
      <span className="size-3 rounded-full bg-[#FF5F57]" />
      <span className="size-3 rounded-full bg-[#FEBC2E]" />
      <span className="size-3 rounded-full bg-[#28C840]" />
    </span>
  );
}

/** The 40px window tab bar: traffic lights, a 12px gap, then tabs. */
export function WindowTabBar({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex h-10 shrink-0 items-center gap-2 border-b-[0.5px] border-border px-3', className)}
      {...props}
    >
      <TrafficLights />
      <span className="w-3 shrink-0" />
      {children}
    </div>
  );
}

/** One window tab. `active` gets the muted fill. */
export function WindowTab({ active, icon, children }: { active?: boolean; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-7 items-center gap-2 rounded-lg px-2.5 text-[13px] leading-5',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground',
      )}
    >
      {icon}
      {children}
    </span>
  );
}
