import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Drawer, DrawerBackdrop, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '@ui-sdk/react/drawer';
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control';

import { Button } from '@/components/ui/Button';
import { ArrowUpRightIcon, CheckIcon, CloseIcon, CopyIcon, ShareIcon } from '@/components/ui/Icons';
import { DOWNLOAD_PAGE_URL } from '@/lib/links';
import { cn } from '@/lib/utils';
import { useDownload, type ChannelId } from './DownloadContext';

type SheetState = { channel: ChannelId; setChannel: (channel: ChannelId) => void };
const SheetContext = createContext<SheetState | null>(null);

function useSheet(): SheetState {
  const context = useContext(SheetContext);
  if (!context) throw new Error('DownloadSheet parts must be inside <DownloadSheet.Root>');
  return context;
}

/** The phone sheet: "Get Troupe on your Mac". Uncontrolled or controlled channel. */
function Root({
  children,
  channel,
  defaultChannel = 'stable',
  onChannelChange,
}: {
  children: ReactNode;
  channel?: ChannelId;
  defaultChannel?: ChannelId;
  onChannelChange?: (channel: ChannelId) => void;
}) {
  const [ownChannel, setOwnChannel] = useState<ChannelId>(defaultChannel);
  const current = channel ?? ownChannel;
  const setChannel = useCallback(
    (next: ChannelId) => {
      if (channel === undefined) setOwnChannel(next);
      onChannelChange?.(next);
    },
    [channel, onChannelChange],
  );
  // A stable value, so parts that read the context re-render only when it changes.
  const value = useMemo(() => ({ channel: current, setChannel }), [current, setChannel]);
  return (
    <SheetContext value={value}>
      <Drawer>{children}</Drawer>
    </SheetContext>
  );
}

function Trigger({ render, children, ...props }: Omit<ComponentProps<typeof DrawerTrigger>, 'render'> & { render: ReactElement }) {
  return (
    <DrawerTrigger render={render} {...props}>
      {children}
    </DrawerTrigger>
  );
}

function Content({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      {/* UI SDK fixes the backdrop in place but gives it no size. */}
      <DrawerBackdrop className="fixed inset-0 z-50 bg-black/60" />
      <DrawerContent
        className={cn(
          // No overflow on the sheet itself. On a touch screen the drawer moves by
          // scrolling its full-screen viewport; a scroll box here (worse with
          // overscroll-contain) keeps the swipe, so the sheet can't be dragged.
          'flex max-h-[calc(100dvh-12px)] w-full flex-col rounded-t-2xl bg-popover pt-2 text-foreground shadow-[0_0_0_0.5px_var(--color-popover-edge),0_-8px_32px_rgb(0_0_0/0.5)] outline-none',
          className,
        )}
      >
        <div aria-hidden="true" className="flex shrink-0 justify-center pt-0.5 pb-3">
          <span className="h-[5px] w-9 rounded-full bg-[#4a4b4d]" />
        </div>
        {/* Scrolls only on a landscape phone, where the sheet is taller than the screen.
            No overscroll-contain: at its top (or when it can't scroll) the swipe goes on
            to the drawer and drags the sheet down. pt-2 keeps the close button's ring unclipped. */}
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pt-2 pb-[max(34px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DrawerContent>
    </>
  );
}

function Header({
  title = 'Get Troupe on your Mac',
  description = 'Troupe is a desktop app. Send the download link to your Mac, then open it there.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        <DrawerTitle className="text-xl leading-[26px] font-semibold tracking-[-0.01em]">{title}</DrawerTitle>
        <DrawerDescription className="text-[15px] leading-[22px] text-muted-foreground">{description}</DrawerDescription>
      </div>
      <DrawerClose
        aria-label="Close"
        className="-mt-2 -mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-full outline-hidden focus-ring"
      >
        <span className="flex size-[30px] items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CloseIcon />
        </span>
      </DrawerClose>
    </div>
  );
}

/** Stable / Nightly as a segmented control, with the versions from the release data. */
function ChannelPicker() {
  const { channels } = useDownload();
  const { channel, setChannel } = useSheet();
  if (channels.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span id="sheet-channel-label" className="text-sm leading-5 font-medium">
        Release channel
      </span>
      <SegmentedControl
        aria-labelledby="sheet-channel-label"
        value={channel}
        onValueChange={(next) => setChannel(next as ChannelId)}
        className="relative isolate flex gap-1 rounded-[10px] bg-background p-[3px] shadow-[inset_0_0_0_0.5px_var(--color-hairline)]"
      >
        <SegmentedControlIndicator className="absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) -z-10 h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-lg bg-control-fill shadow-control transition-[left,width] duration-200 ease-(--ease-out) data-[activation-direction=none]:transition-none motion-reduce:transition-none" />
        {channels.map((item) => (
          <SegmentedControlItem
            key={item.id}
            value={item.id}
            className="flex h-[52px] flex-1 flex-col items-start justify-center gap-px rounded-lg px-3 text-left outline-hidden focus-ring"
          >
            <span className={cn('text-[15px] leading-5 font-medium', channel === item.id ? 'text-foreground' : 'text-muted-foreground')}>
              {item.title}
            </span>
            <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">{item.shortLabel}</span>
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <p className="text-sm leading-5 text-muted-foreground">
        Stable is the most reliable. Nightly is built each night from the newest code and can be unstable.
      </p>
    </div>
  );
}

function shareUrl(channel: ChannelId): string {
  return channel === 'nightly' ? `${DOWNLOAD_PAGE_URL.replace('#', '?channel=nightly#')}` : DOWNLOAD_PAGE_URL;
}

// Web Share support does not change while the page is open.
const subscribeNever = () => () => {};
const hasShareSheet = () => typeof navigator.share === 'function';
const noShareSheet = () => false;

/** "Send to my Mac" (Web Share API) and "Copy link". Share hides where the browser has no share sheet. */
function Actions() {
  const { channel } = useSheet();
  // Read during render (no effect), so the sheet opens with its final buttons
  // instead of growing a frame later. The server snapshot is false.
  const canShare = useSyncExternalStore(subscribeNever, hasShareSheet, noShareSheet);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = window.setTimeout(() => setCopy('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copy]);

  const url = shareUrl(channel);

  return (
    <div className="flex flex-col gap-2.5 border-t border-hairline pt-4">
      {canShare ? (
        <Button
          size="touch"
          onClick={() => {
            void navigator.share({ title: 'Troupe', text: 'Download Troupe for your Mac', url }).catch(() => {});
          }}
        >
          <ShareIcon size={17} />
          Send to my Mac
        </Button>
      ) : null}
      <Button
        size="touch"
        variant={canShare ? 'secondary' : 'primary'}
        onClick={() => {
          // Show the tick at once; take it back if the clipboard refuses.
          setCopy('copied');
          const write = navigator.clipboard?.writeText(url) ?? Promise.reject(new Error('No clipboard'));
          write.catch(() => setCopy('failed'));
        }}
      >
        {copy === 'copied' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        <span aria-live="polite">
          {copy === 'copied' ? 'Link copied' : copy === 'failed' ? 'Copy failed' : 'Copy link'}
        </span>
      </Button>
    </div>
  );
}

function Footer() {
  const { allReleasesUrl } = useDownload();
  return (
    <div className="flex min-h-11 items-center justify-between">
      <span className="text-sm leading-5 text-muted-foreground">Also for Windows and Linux</span>
      <a href={allReleasesUrl} className="flex h-11 items-center gap-1 text-sm leading-5 font-medium text-foreground">
        All releases <ArrowUpRightIcon />
      </a>
    </div>
  );
}

// Compound parts. Import as a namespace: `import * as DownloadSheet from './DownloadSheet'`.
export { Root, Trigger, Content, Header, ChannelPicker, Actions, Footer };
