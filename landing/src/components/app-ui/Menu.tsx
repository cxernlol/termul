import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** A static app popover menu, as in the window shots (not interactive). */
export function PopoverMenu({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex w-[300px] flex-col gap-0.5 rounded-xl border-[0.5px] border-border bg-popover p-1 text-xs leading-4 shadow-[0_1px_2px_#00000099,0_4px_8px_-4px_#00000080]',
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between px-2 text-muted-foreground">
      <span>{children}</span>
      {end ? <span>{end}</span> : null}
    </div>
  );
}

export function MenuRow({
  highlighted,
  selected,
  className,
  ...props
}: ComponentProps<'div'> & { highlighted?: boolean; selected?: boolean }) {
  return (
    <div
      className={cn(
        'flex h-7 shrink-0 items-center gap-2 rounded-lg px-2 text-foreground',
        selected && 'bg-foreground/10',
        highlighted && 'bg-foreground/4',
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparatorGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-0.5 border-t-[0.5px] border-border pt-1', className)} {...props} />;
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-4 w-7 shrink-0 items-center rounded-full p-0.5',
        on ? 'justify-end bg-switch-track-on' : 'bg-switch-track-off',
      )}
    >
      <span className="size-3 rounded-full bg-white" />
    </span>
  );
}
