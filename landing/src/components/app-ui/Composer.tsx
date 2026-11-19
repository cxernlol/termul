import type { ComponentProps, ReactNode } from 'react';

import { AgentLogo } from '@/components/ui/AgentLogo';
import { cn } from '@/lib/utils';
import { ArrowUpIcon, ChevronDownIcon, FolderOpenIcon, HandIcon, MicIcon, PlusIcon, ShieldIcon, SpinnerIcon } from './icons';
import { McpLogo } from './McpLogo';

/**
 * The app composer as drawn in the window shots (static, not a form).
 * Outer card (checkout row) around the inner field card.
 * Put menus that open from the composer in `children`; they position against
 * the outer card.
 */
export function Composer({
  placeholder = 'Ask anything… (/ for commands, @ for files and chats)',
  value,
  mode = 'ask-first',
  model = 'Opus 5.5',
  effort = 'Medium',
  checkout = 'Current checkout',
  branch = 'dev',
  connectors = true,
  busy = true,
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & {
  placeholder?: string;
  /** Typed text. Shows instead of the placeholder. */
  value?: ReactNode;
  mode?: 'ask-first' | 'bypass';
  model?: string;
  effort?: string;
  checkout?: string;
  branch?: string;
  connectors?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative flex w-[680px] flex-col rounded-[20px] border-[0.5px] border-border bg-card px-1.5 pt-1.5 text-xs leading-4', className)}
      {...props}
    >
      <div className="flex flex-col rounded-[14px] bg-popover shadow-[0_0_0_0.5px_#38393A,0_1px_2px_#00000080]">
        <div className="flex items-start gap-1 pt-4 pr-2.5 pb-2.5 pl-[18px]">
          <div className={cn('min-w-0 grow truncate text-base leading-6', value ? 'text-foreground' : 'text-muted-foreground')}>
            {value ?? placeholder}
          </div>
          <span className="flex h-6 w-7 shrink-0 items-center justify-center text-muted-foreground">
            {busy ? <SpinnerIcon /> : null}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-2 pb-2 text-muted-foreground">
          <div className="flex items-center gap-0.5">
            <span className="flex size-8 items-center justify-center">
              <PlusIcon size={16} />
            </span>
            {mode === 'ask-first' ? (
              <span className="flex h-8 items-center gap-1.5 px-2">
                <HandIcon />
                Ask first
              </span>
            ) : (
              <span className="flex h-7 items-center gap-1.5 rounded-md bg-warning/15 px-2 text-warning">
                <ShieldIcon size={12} />
                Bypass permissions
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="flex h-8 items-center gap-1.5 pr-1.5 pl-2">
              <AgentLogo agent="claude-code" size={12} />
              {model}
              <span>{effort}</span>
              <ChevronDownIcon size={12} />
            </span>
            <span className="flex size-8 items-center justify-center">
              <MicIcon size={16} />
            </span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-fill text-primary-foreground shadow-emboss">
              <ArrowUpIcon />
            </span>
          </div>
        </div>
      </div>
      <div className="flex h-10 shrink-0 items-center justify-between gap-4 px-2">
        <span className="flex h-7 min-w-0 items-center gap-2 px-1.5 text-foreground">
          <span className="text-muted-foreground">
            <FolderOpenIcon />
          </span>
          {checkout}
          <span>· {branch}</span>
        </span>
        {connectors ? (
          <span className="flex h-7 shrink-0 items-center gap-2.5 px-1.5 text-muted-foreground">
            Connectors
            <span className="flex items-center gap-1.5">
              <McpLogo id="paper" size={14} />
              <McpLogo id="supabase" size={14} />
              <McpLogo id="context7" size={14} />
            </span>
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
