import type { CSSProperties, ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import { AgentLogo } from '@/components/ui/AgentLogo';
import { cn } from '@/lib/utils';
import { WindowTab, WindowTabBar } from '../app-ui';
import type { TourStep } from '../types';
import './remote.css';

/*
 * Remote tab of the feature tour. Source: Paper "Feature tour · All states
 * (full stage)", Remote 1/4 to 4/4, and the "Remote" row of
 * "Feature tour · Keyframes".
 *
 * The Paper frames do not use the host's 900px window. So this scene covers
 * the full 888×640 stage and draws its own 808px window and a phone.
 * remote.css makes the host window frame empty for this scene only.
 *
 * All parts are in the DOM for all steps. A part with `data-show="0 1"`
 * shows in steps 0 and 1 only (0-based). remote.css does the motion.
 *
 * Step 0: the Remote Agent Access popover, remote access is off.
 * Step 1: remote access is on. The popover shows the QR.
 * Step 2: the phone slides up with the same live chat.
 * Step 3: the phone scrolls to its composer. "Approval needed" shows.
 */

// Demo data -----------------------------------------------------------------

/** The QR opens the docs page for this feature. */
const QR_VALUE = 'https://usetroupe.dev/docs/remote/share-desktop';
const CHAT_TITLE = 'Refactor checkout flow';
const USER_MESSAGE = 'Split the checkout form into steps.';
const AGENT_MESSAGE = 'Done with the split. Running the tests now.';

/** Shadow of popovers (Paper). */
const POPOVER_SHADOW = 'shadow-[0_1px_2px_#00000080,0_4px_8px_-4px_#00000099]';
/** Deep shadow of the window and the phone (Paper). */
const DEVICE_SHADOW = 'shadow-[0_24px_48px_-12px_#00000099]';
/** Inset light edge of primary buttons (Paper). */
const PRIMARY_SHADOW = 'shadow-[inset_0_1px_0_#FFFFFF29,0_1px_2px_#00000073]';

const SHIELD = 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z';
const HAND =
  'M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15';

// Small parts ---------------------------------------------------------------

/** A 24-grid stroke icon. The color comes from `currentColor`. */
function Glyph({
  size,
  strokeWidth = 2,
  className,
  children,
}: {
  size: number;
  strokeWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  );
}

/** Sets the enter delay and duration of a step part (see remote.css). */
function timing(delayMs: number, durationMs = 200) {
  return { '--rmt-delay': `${delayMs}ms`, '--rmt-duration': `${durationMs}ms` } as CSSProperties;
}

/** The two-state switch from the app (Paper "Enable remote access"). */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'flex h-[18px] w-8 shrink-0 rounded-full p-0.5',
        on ? 'justify-end bg-switch-track-on' : 'bg-switch-track-off',
      )}
    >
      <span className="size-3.5 shrink-0 rounded-full bg-white" />
    </span>
  );
}

// Desktop window ------------------------------------------------------------

function ToolStripButton({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('flex size-7 shrink-0 items-center justify-center', className)}>{children}</span>;
}

/** The right tool strip. The Monitor icon opens Remote Agent Access. */
function ToolStrip() {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1.5 border-l-[0.5px] border-border pt-3 pb-[52px] text-muted-foreground">
      <ToolStripButton>
        <Glyph size={14} strokeWidth={1.75}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </Glyph>
      </ToolStripButton>
      <ToolStripButton>
        <Glyph size={14} strokeWidth={1.75}>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="M6 8.5v4a4 4 0 0 0 4 4h5.5" />
        </Glyph>
      </ToolStripButton>
      <span className="flex-1" />
      <ToolStripButton>
        <Glyph size={14} strokeWidth={1.75}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
        </Glyph>
      </ToolStripButton>
      <ToolStripButton className="rmt-monitor rounded-md bg-[#232425]">
        <Glyph size={14} strokeWidth={1.75}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </Glyph>
      </ToolStripButton>
    </div>
  );
}

function DesktopChat() {
  return (
    <div className="flex flex-1 flex-col items-center pt-6">
      <div className="flex w-[600px] flex-col gap-3.5">
        <div className="flex justify-end">
          <p className="rounded-[14px] bg-muted px-3.5 py-2.5 text-sm leading-[21px] text-foreground">{USER_MESSAGE}</p>
        </div>
        <p className="text-sm leading-[22px] text-foreground">{AGENT_MESSAGE}</p>
        <div className="flex min-h-7 items-center px-1 text-[13px] leading-5 whitespace-pre text-muted-foreground">
          Running <span className="text-foreground">bun run test -- checkout</span>…
        </div>
      </div>
    </div>
  );
}

/** The popover title and text. Same in steps 0 and 1. */
function PopoverHeader() {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm leading-5 font-medium text-foreground">Remote Agent Access</span>
      <span className="text-[12px] leading-[18px] text-muted-foreground">
        Scan the QR to open your live agent sessions on a phone, on any network.
      </span>
    </div>
  );
}

const POPOVER = cn(
  'absolute left-[471px] flex w-[288px] flex-col gap-3 rounded-[10px] border-[0.5px] border-chip-edge bg-popover p-4',
  POPOVER_SHADOW,
);

/** Step 0: remote access is off. */
function EnablePopover() {
  return (
    <div data-show="0" className={cn(POPOVER, 'top-[430px]')}>
      <PopoverHeader />
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col">
          <span className="text-[13px] leading-5 font-medium text-foreground">Enable remote access</span>
          <span className="text-[12px] leading-4 text-muted-foreground">Starts a local server + a cloudflared tunnel.</span>
        </div>
        <Switch on={false} />
      </div>
    </div>
  );
}

/** Step 1: remote access is on. The popover grows from the Monitor icon. */
function QrPopover() {
  return (
    <div
      data-show="1"
      style={timing(50, 250)}
      className={cn(POPOVER, 'rmt-pop top-[136px] origin-[313px_calc(100%-10px)]')}
    >
      <PopoverHeader />
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[13px] leading-5 font-medium text-foreground">Enable remote access</span>
        <Switch on />
      </div>
      <div className="flex h-44 shrink-0 justify-center">
        <div className="flex size-44 shrink-0 rounded-lg bg-white p-2">
          <QRCodeSVG value={QR_VALUE} size={160} level="M" bgColor="#FFFFFF" fgColor="#000000" />
        </div>
      </div>
      <div className="flex gap-2 rounded-md border-[0.5px] border-[#EAB3054D] bg-[#EAB3051A] px-2.5 py-2 text-warning">
        <Glyph size={14}>
          <path d={SHIELD} />
          <path d="M12 9v4M12 16h.01" />
        </Glyph>
        <span className="text-[11px] leading-4">
          This link carries your access token (after the #), anyone who has it can drive your live agent, so share it
          only with devices you trust.
        </span>
      </div>
      <div className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border-[0.5px] border-chip-edge bg-secondary text-foreground">
        <Glyph size={12}>
          <rect x="8" y="8" width="13" height="13" rx="2" />
          <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
        </Glyph>
        <span className="text-[12px] leading-4 font-medium">Copy link</span>
      </div>
    </div>
  );
}

/** The 808px desktop window (steps 0–1). */
function DesktopWindow() {
  return (
    <div
      data-show="0 1"
      className={cn(
        'rmt-recede absolute top-10 left-10 flex h-[640px] w-[808px] flex-col overflow-clip rounded-[10px] border border-hairline bg-background',
        DEVICE_SHADOW,
      )}
    >
      <WindowTabBar>
        <WindowTab active icon={<AgentLogo agent="claude-code" size={12} />}>
          {CHAT_TITLE}
        </WindowTab>
      </WindowTabBar>
      <div className="flex min-h-0 flex-1">
        <DesktopChat />
        <ToolStrip />
      </div>
      <EnablePopover />
      <QrPopover />
    </div>
  );
}

// Phone ---------------------------------------------------------------------

function StatusBar() {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between px-7">
      <span className="text-[15px] leading-[18px] font-semibold text-foreground">9:41</span>
      <span className="flex items-center gap-[5px]">
        <span className="h-2.5 w-[17px] shrink-0 rounded-[2px] bg-foreground" />
        <span className="relative h-[11px] w-6 shrink-0 rounded-[3px] border border-foreground p-px">
          <span className="absolute top-px left-px h-[7px] w-4 rounded-[1px] bg-foreground" />
        </span>
      </span>
    </div>
  );
}

function PhoneButton({ children }: { children: ReactNode }) {
  return <span className="flex size-11 shrink-0 items-center justify-center text-foreground">{children}</span>;
}

/** MobileShellHeader: menu, chat title, attention pill, new chat, more. */
function PhoneHeader() {
  return (
    <div className="flex min-h-14 shrink-0 items-center gap-1 border-b-[0.5px] border-[#24252699] px-2">
      <PhoneButton>
        <Glyph size={20} strokeWidth={1.75}>
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </Glyph>
      </PhoneButton>
      <div className="flex flex-1 flex-col items-center">
        <span className="text-[15px] leading-5 font-medium text-foreground">{CHAT_TITLE}</span>
        <span className="flex items-center gap-1">
          <span className="text-sm leading-[18px] text-muted-foreground">acme-shop · main · Local</span>
          <Glyph size={12} className="text-muted-foreground">
            <path d="m6 9 6 6 6-6" />
          </Glyph>
        </span>
      </div>
      <span className="flex h-[22px] items-center gap-1 rounded-full bg-[#EAB30533] px-2">
        <span className="size-1.5 shrink-0 rounded-full bg-warning" />
        <span className="text-[12px] leading-4 font-semibold text-warning">1</span>
      </span>
      <PhoneButton>
        <Glyph size={20} strokeWidth={1.75}>
          <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4z" />
          <path d="M12 7v6M9 10h6" />
        </Glyph>
      </PhoneButton>
      <PhoneButton>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </PhoneButton>
    </div>
  );
}

function PhoneMessages() {
  return (
    <div className="flex flex-col gap-3.5 px-5 py-4">
      <div className="flex justify-end">
        <p className="w-[250px] shrink-0 rounded-2xl bg-muted px-3.5 py-2.5 text-[15px] leading-[22px] text-foreground">
          {USER_MESSAGE}
        </p>
      </div>
      <p className="text-[15px] leading-[23px] text-foreground">{AGENT_MESSAGE}</p>
      <div className="flex min-h-8 items-center gap-2 text-[15px] leading-[22px]">
        <Glyph size={13} strokeWidth={2.5} className="rmt-spin text-muted-foreground">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
        </Glyph>
        <span className="whitespace-pre text-muted-foreground">Running </span>
        <span className="text-foreground">bun run test</span>
      </div>
    </div>
  );
}

function ApprovalButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('flex h-11 items-center gap-2 rounded-lg px-3.5 text-[15px] leading-[18px] font-medium', className)}>
      {children}
    </span>
  );
}

/** PermissionPrompt, embedded at the top of the phone composer. */
function ApprovalPrompt() {
  return (
    <div className="flex flex-col gap-2.5 border-b-[0.5px] border-[#EAB30533] bg-[#EAB30509] px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border-[0.5px] border-[#EAB3054D] bg-[#EAB30526] text-warning">
          <Glyph size={13}>
            <path d={SHIELD} />
            <path d="M12 9v4M12 16h.01" />
          </Glyph>
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] leading-5 font-semibold text-foreground">Approval needed</span>
          <span className="text-sm leading-[21px] text-muted-foreground">
            The agent is waiting for permission to run{' '}
            <span className="font-mono text-[13px] text-foreground">bun run test -- checkout</span>.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <ApprovalButton className={cn('bg-primary-fill text-white', PRIMARY_SHADOW)}>
          <Glyph size={14}>
            <path d={SHIELD} />
            <path d="m9 12 2 2 4-4" />
          </Glyph>
          Allow
        </ApprovalButton>
        <ApprovalButton className="border-[0.5px] border-[#242526B3] bg-[#1617184D] text-foreground">
          <Glyph size={14}>
            <path d={SHIELD} />
            <path d="m9 12 2 2 4-4" />
          </Glyph>
          Always allow
        </ApprovalButton>
        <ApprovalButton className="text-muted-foreground">
          <Glyph size={14}>
            <path d={SHIELD} />
            <path d="M12 9v4M12 16h.01" />
          </Glyph>
          Reject
        </ApprovalButton>
      </div>
    </div>
  );
}

/** The phone composer with the approval (step 3). It rises after the scroll starts. */
function PhoneComposer() {
  return (
    <div
      data-show="3"
      style={timing(250, 250)}
      className="rmt-rise absolute inset-x-4 bottom-[34px] flex flex-col overflow-clip rounded-[20px] border-[0.5px] border-hairline bg-card"
    >
      <ApprovalPrompt />
      <div className="relative h-[42px] shrink-0 overflow-clip px-4 pt-3.5 pb-1 whitespace-nowrap">
        <span className="absolute top-3.5 left-4 text-base leading-[22px] tracking-[-0.01em] whitespace-pre text-muted-foreground">
          Ask anything… (/ for commands, @ for files)
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-2">
        <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
          <Glyph size={18} strokeWidth={1.75}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </Glyph>
        </span>
        <span className="flex h-11 items-center gap-1.5 px-1.5">
          <AgentLogo agent="claude-code" size={13} />
          <span className="text-[15px] leading-[18px] text-secondary-foreground">Opus 5.5</span>
          <Glyph size={12} className="text-muted-foreground">
            <path d="m6 15 6-6 6 6" />
          </Glyph>
        </span>
        <span className="flex h-11 items-center gap-1.5 px-1.5">
          <Glyph size={15} strokeWidth={1.75} className="text-secondary-foreground">
            <path d={HAND} strokeLinecap="round" strokeLinejoin="round" />
          </Glyph>
          <span className="text-[15px] leading-[18px] text-secondary-foreground">Default</span>
          <Glyph size={12} className="text-muted-foreground">
            <path d="m6 9 6 6 6-6" />
          </Glyph>
        </span>
        <span className="flex-1" />
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-primary-fill',
            PRIMARY_SHADOW,
          )}
        >
          <span className="size-3 shrink-0 rounded-[2px] bg-white" />
        </span>
      </div>
    </div>
  );
}

/**
 * The phone (390×844, at 243,40 on the stage). It is below the stage in
 * steps 0–1, slides up in step 2 and scrolls up 280px in step 3.
 */
function Phone() {
  return (
    <div
      className={cn(
        'rmt-phone absolute top-10 left-[243px] flex h-[844px] w-[390px] flex-col overflow-clip rounded-[48px] border-[6px] border-[#232425] bg-background',
        DEVICE_SHADOW,
      )}
    >
      <StatusBar />
      {/* Step 3 scrolls the chat out of view. Paper 4/4 shows it empty. */}
      <div data-show="0 1 2" className="flex flex-col">
        <PhoneHeader />
        <PhoneMessages />
      </div>
      <PhoneComposer />
    </div>
  );
}

// Scene ---------------------------------------------------------------------

export function RemoteScene({ step }: { step: TourStep }) {
  return (
    // The tab uses `frame: 'none'`, so this root covers the whole stage and
    // all positions below are stage positions.
    <div data-step={step} className="rmt absolute inset-0">
      <DesktopWindow />
      <Phone />
    </div>
  );
}

