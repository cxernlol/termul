import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu';

import { ArrowUpRightIcon } from '@/components/ui/Icons';
import { cn } from '@/lib/utils';
import { useDownload, type ChannelId } from './DownloadContext';

function go(url: string) {
  window.location.assign(url);
}

/** The menu that opens from a "Download for …" button (desktop). */
function Root({ children }: { children: ReactNode }) {
  return <Menu>{children}</Menu>;
}

/** Pass the visible button as `render`, for example `render={<Button size="lg" />}`. */
function Trigger({ render, children, ...props }: Omit<ComponentProps<typeof MenuTrigger>, 'render'> & { render: ReactElement }) {
  return (
    <MenuTrigger render={render} {...props}>
      {children}
    </MenuTrigger>
  );
}

function Content({ className, children, ...props }: ComponentProps<typeof MenuContent>) {
  return (
    <MenuContent
      align="start"
      sideOffset={8}
      collisionPadding={16}
      className={cn(
        // Edge = the shadow's 0.5px ring (no border, so no double edge). Crisp, short drops only.
        'z-50 flex w-[340px] flex-col rounded-xl bg-popover p-1 text-foreground shadow-menu outline-none',
        // Grows from the middle of the trigger (UI SDK gives --anchor-width), not from the menu's corner.
        'origin-[calc(var(--anchor-width)/2)_0] data-[side=top]:origin-[calc(var(--anchor-width)/2)_100%]',
        'transition-[opacity,scale] duration-150 ease-(--ease-out)',
        'data-starting-style:scale-[0.97] data-starting-style:opacity-0',
        'data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-120',
        'motion-reduce:transition-opacity motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100',
        className as string,
      )}
      {...props}
    >
      {children}
    </MenuContent>
  );
}

function Label({ children = 'Choose a release channel' }: { children?: ReactNode }) {
  return (
    <MenuGroupLabel className="px-2 pt-2 pb-1 text-xs leading-4 font-medium text-muted-foreground">{children}</MenuGroupLabel>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <MenuGroup className="flex flex-col">{children}</MenuGroup>;
}

/**
 * One release channel. Selecting it downloads the file for this visitor's system.
 * `fromLink`: the page was opened from a shared link for this channel.
 */
function Channel({ value, fromLink = false }: { value: ChannelId; fromLink?: boolean }) {
  const { getChannel } = useDownload();
  const channel = getChannel(value);
  if (!channel) return null;

  return (
    <MenuItem
      value={value}
      label={`${channel.title} ${channel.versionLabel}`}
      onSelect={() => go(channel.target.url)}
      className="flex cursor-default items-start gap-3 rounded-lg p-2 outline-none transition-colors duration-150 ease-(--ease-out) data-highlighted:bg-foreground/6"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="text-[13px] leading-[18px] font-medium">{channel.title}</span>
          {value === 'stable' ? (
            <span className="rounded-md bg-primary-fill/20 px-1.5 text-[11px] leading-4 font-medium text-primary">Recommended</span>
          ) : null}
          {fromLink ? (
            <span className="rounded-md bg-foreground/8 px-1.5 text-[11px] leading-4 font-medium text-foreground">From your link</span>
          ) : null}
        </span>
        <span className="text-xs leading-4 text-muted-foreground">{channel.description}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-xs leading-[18px] font-medium tabular-nums">{channel.versionLabel}</span>
        <span className="text-[11px] leading-4 text-muted-foreground tabular-nums">{channel.metaLabel}</span>
      </span>
    </MenuItem>
  );
}

/** File line for this system, the Intel link on a Mac, and "All releases". */
function Footer() {
  const { platform, getChannel, intelUrl, allReleasesUrl } = useDownload();
  const stable = getChannel('stable');
  const isMac = platform.os === 'mac' || platform.os === 'other';
  const onArm = isMac && platform.arch !== 'x64';

  return (
    <>
      <MenuSeparator className="-mx-1 my-1 h-[0.5px] bg-border" />
      <div className="flex items-center justify-between gap-3 px-1 pb-0.5">
        <div className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
          <span className="truncate px-1">{stable?.target.fileLabel ?? 'Download'}</span>
          {onArm && intelUrl ? (
            <MenuItem
              value="intel"
              label="Intel Mac? Get x64"
              onSelect={() => go(intelUrl)}
              className="rounded-md px-1 py-1 text-foreground outline-none transition-colors duration-150 ease-(--ease-out) data-highlighted:bg-foreground/6"
            >
              · Intel Mac? Get x64
            </MenuItem>
          ) : null}
        </div>
        <MenuItem
          value="all-releases"
          label="All releases"
          onSelect={() => go(allReleasesUrl)}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] leading-4 font-medium text-foreground outline-none transition-colors duration-150 ease-(--ease-out) data-highlighted:bg-foreground/6"
        >
          All releases <ArrowUpRightIcon size={11} />
        </MenuItem>
      </div>
    </>
  );
}

// Compound parts. Import as a namespace: `import * as DownloadMenu from './DownloadMenu'`.
export { Root, Trigger, Content, Label, Group, Channel, Footer };
