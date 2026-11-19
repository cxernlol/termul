import type { CSSProperties, ReactNode } from 'react';

import { AgentLogo } from '@/components/ui/AgentLogo';
import { cn } from '@/lib/utils';
import { WindowTab, WindowTabBar } from '../app-ui';
import type { TourStep } from '../types';
import './accounts.css';

/*
 * Accounts tab of the feature tour. Source: Paper "Feature tour · All states
 * (full stage)", Accounts 1/4 to 4/4, and the "Accounts" row of
 * "Feature tour · Keyframes".
 *
 * All parts are in the DOM for all steps. A part with `data-show="1 2"`
 * shows in steps 1 and 2 only (0-based). accounts.css does the motion.
 *
 * Step 0: "Work" is near its limit. The banner shows above the composer.
 * Step 1: the limit is reached. The limit dock and the account menu show.
 * Step 2: Troupe switches to "Personal". A spinner line shows.
 * Step 3: the chat continues on "Personal". A success toast shows.
 */

// Demo data -----------------------------------------------------------------

const USER_MESSAGE = 'Split the checkout form into steps and keep the cart state in the URL.';
const DRAFT = 'Also add a test for an empty cart.';
const PLACEHOLDER = 'Ask anything… (/ for commands, @ for files and chats)';

/** Rows in the account menu (step 1). `fill` is the usage bar width of 40px. */
const MENU_ACCOUNTS = [
  { name: 'Personal', used: '12% used', fill: 5, active: true },
  { name: 'Team', used: '47% used', fill: 19 },
] as const;

/** Card shadow of the composer (Paper). */
const COMPOSER_SHADOW = 'shadow-[0_1px_2px_#00000080,0_6px_8px_-4px_#00000080]';
/** Shadow of popovers and toasts (Paper). */
const POPOVER_SHADOW = 'shadow-[0_1px_2px_#00000080,0_4px_8px_-4px_#00000099]';

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

/** The app spinner arc. It turns (see `.acc-spin`). */
function Spinner({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <Glyph size={size} strokeWidth={strokeWidth} className="acc-spin text-muted-foreground">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </Glyph>
  );
}

const ChevronDown = ({ size }: { size: number }) => (
  <Glyph size={size} className="text-muted-foreground">
    <path d="m6 9 6 6 6-6" />
  </Glyph>
);

const ChevronUp = () => (
  <Glyph size={12} className="text-muted-foreground">
    <path d="m6 15 6-6 6 6" />
  </Glyph>
);

function Dot({ className, size = 'size-1.5' }: { className: string; size?: string }) {
  return <span className={cn('shrink-0 rounded-full', size, className)} />;
}

/** Sets the enter delay of a step part (see accounts.css). */
function delay(ms: number) {
  return { '--acc-delay': `${ms}ms` } as CSSProperties;
}

// Chat ----------------------------------------------------------------------

function ToolRow({
  show,
  style,
  className,
  children,
}: {
  show?: string;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-show={show} style={style} className={cn('flex min-h-7 items-center justify-between px-1', className)}>
      {children}
    </div>
  );
}

function ToolText({ children }: { children: ReactNode }) {
  return <span className="text-[13px] leading-5 text-muted-foreground">{children}</span>;
}

function ToolTime({ children }: { children: ReactNode }) {
  return <span className="text-[12px] leading-5 text-muted-foreground">{children}</span>;
}

/** Row 3: the test run. Running (0), stopped (1, 2), done (3). */
function TestRunRow() {
  return (
    <div className="grid">
      <ToolRow show="0" className="col-start-1 row-start-1">
        <ToolText>
          Running <span className="text-foreground">bun run test -- checkout</span>…
        </ToolText>
        <Spinner size={12} strokeWidth={2.5} />
      </ToolRow>
      <ToolRow show="1 2" className="col-start-1 row-start-1">
        <ToolText>
          Ran <span className="text-foreground">bun run test -- checkout</span>
        </ToolText>
        <span className="flex items-center gap-1.5 text-destructive">
          <Glyph size={12}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </Glyph>
          <span className="text-[12px] leading-5">stopped</span>
        </span>
      </ToolRow>
      <ToolRow show="3" className="col-start-1 row-start-1">
        <ToolText>
          Ran <span className="text-foreground">bun run test -- checkout</span>
        </ToolText>
        <ToolTime>3.1s</ToolTime>
      </ToolRow>
    </div>
  );
}

function Chat() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center pt-6">
      <div className="flex w-[660px] flex-col gap-3.5">
        <div className="flex justify-end">
          <p className="max-w-[420px] rounded-[14px] bg-muted px-3.5 py-2.5 text-sm leading-[21px] text-foreground">
            {USER_MESSAGE}
          </p>
        </div>
        <p className="text-sm leading-[22px] text-foreground">
          I split <span className="font-mono text-[13px]">CheckoutForm</span> into three steps and moved the cart into
          search params. Next I update the tests.
        </p>
        <div className="flex flex-col">
          <ToolRow>
            <ToolText>
              Edited <span className="text-foreground">CheckoutForm.tsx</span> <span className="text-success">+84</span>{' '}
              <span className="text-destructive">−31</span>
            </ToolText>
            <ToolTime>0.4s</ToolTime>
          </ToolRow>
          <ToolRow>
            <ToolText>
              Edited <span className="text-foreground">use-cart-params.ts</span> <span className="text-success">+46</span>
            </ToolText>
            <ToolTime>0.2s</ToolTime>
          </ToolRow>
          <TestRunRow />
          <ToolRow show="3" style={delay(100)} className="acc-rise justify-start">
            <ToolText>
              Editing <span className="text-foreground">checkout.test.ts</span>…
            </ToolText>
          </ToolRow>
        </div>
      </div>
    </div>
  );
}

// Composer docks ------------------------------------------------------------

/**
 * A dock on top of the composer card. It overlaps the card by 14px, so it
 * covers the card's top corners and top edge. Its bottom edge line is the
 * line between the dock and the input.
 */
function Dock({ show, className, children }: { show: string; className?: string; children: ReactNode }) {
  return (
    <div
      data-show={show}
      className="acc-rise absolute inset-x-0 bottom-[calc(100%-14px)] rounded-t-[14px] border-[0.5px] border-b-0 border-hairline bg-card pb-3.5"
    >
      <div className={cn('border-b-[0.5px] border-border py-2.5 pr-2.5 pl-4', className)}>{children}</div>
    </div>
  );
}

/** Step 0: "Work has used 85%…" banner (ClaudeLimitWarning). */
function NearLimitBanner() {
  return (
    <Dock show="0" className="flex items-center gap-2.5">
      <Dot className="bg-warning" size="size-[7px]" />
      <p className="flex-1 text-[12px] leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">Work has used 85% of its 5-hour limit.</span> Resets in 2h 56m.
      </p>
      <span className="flex h-7 items-center gap-1.5 rounded-lg border-[0.5px] border-border bg-muted pr-2 pl-2.5 shadow-[0_1px_2px_#00000066]">
        <span className="text-[12px] leading-4 font-medium text-foreground">Switch account</span>
        <ChevronDown size={12} />
      </span>
      <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
        <Glyph size={12}>
          <path d="M18 6 6 18M6 6l12 12" />
        </Glyph>
      </span>
    </Dock>
  );
}

/** Steps 1–2: "Work reached its 5-hour limit…" dock (ClaudeLimitNotice). */
function LimitDock() {
  return (
    <Dock show="1 2" className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2.5">
        <span className="flex h-5 items-center">
          <Dot className="bg-warning" size="size-[7px]" />
        </span>
        <p className="text-[12px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Work reached its 5-hour limit.</span> Resets in 2h 56m. Your
          draft is kept.
        </p>
      </div>
      <div className="grid">
        {/* Step 1: pick the account and continue. */}
        <div data-show="1" className="col-start-1 row-start-1 flex items-center gap-2.5 pl-[17px]">
          <span className="text-[12px] leading-5 text-muted-foreground">Go on with</span>
          <span className="flex h-7 items-center gap-1.5 rounded-lg border-[0.5px] border-border bg-muted pr-2 pl-2.5 shadow-[0_1px_2px_#00000066]">
            <Dot className="bg-success" />
            <span className="text-[12px] leading-4 font-medium text-foreground">Personal</span>
            <span className="text-[12px] leading-4 text-muted-foreground">12% used</span>
            <ChevronUp />
          </span>
          <span className="flex-1" />
          <span className="flex h-7 items-center rounded-md bg-primary-fill px-3 shadow-[inset_0_1px_0_#FFFFFF29,0_1px_2px_#00000073]">
            <span className="text-[12px] leading-4 font-medium text-white">Switch and continue</span>
          </span>
        </div>
        {/* Step 2: the switch runs. */}
        <div data-show="2" className="col-start-1 row-start-1 flex h-7 items-center gap-2 pl-[17px]">
          <Spinner size={12} strokeWidth={2.5} />
          <span className="text-[12px] leading-5 text-muted-foreground">Switching to Personal and continuing…</span>
        </div>
      </div>
    </Dock>
  );
}

/** Step 1: the open account menu above the "Go on with" chip. */
function AccountMenu() {
  return (
    <div
      data-show="1"
      style={delay(120)}
      className={cn(
        'acc-pop absolute bottom-[calc(100%+81px)] left-[102px] flex w-[300px] origin-[78px_calc(100%+56px)] flex-col rounded-[10px] border-[0.5px] border-chip-edge bg-popover p-1',
        POPOVER_SHADOW,
      )}
    >
      <div className="px-2 pt-1.5 pb-1">
        <span className="text-[12px] leading-4 text-muted-foreground">Account for this chat</span>
      </div>
      {MENU_ACCOUNTS.map((account) => (
        <div
          key={account.name}
          className={cn('flex h-8 shrink-0 items-center gap-2 rounded-md px-2', 'active' in account && 'bg-[#232425]')}
        >
          <Dot className="bg-success" />
          <span
            className={cn('flex-1 text-[13px] leading-5 text-foreground', 'active' in account && 'font-medium')}
          >
            {account.name}
          </span>
          <UsageBar fill={account.fill} className="bg-muted-foreground" />
          <span className="w-16 shrink-0 text-right text-[12px] leading-5 text-foreground">{account.used}</span>
        </div>
      ))}
      <div className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1 opacity-50">
        <Dot className="bg-destructive" />
        <span className="flex flex-1 flex-col">
          <span className="text-[13px] leading-5 text-foreground">Work</span>
          <span className="text-[11px] leading-3.5 text-muted-foreground">resets in 2h 56m</span>
        </span>
        <UsageBar fill={40} className="bg-destructive" />
        <span className="w-16 shrink-0 text-right text-[12px] leading-5 text-destructive">100% used</span>
      </div>
      <div className="my-1 h-[0.5px] shrink-0 bg-border" />
      <div className="flex h-[30px] shrink-0 items-center gap-1.5 px-2">
        <span className="text-[13px] leading-5 text-secondary-foreground">Manage accounts</span>
        <Glyph size={12} className="text-muted-foreground">
          <path d="M7 17 17 7M9 7h8v8" />
        </Glyph>
      </div>
    </div>
  );
}

function UsageBar({ fill, className }: { fill: number; className: string }) {
  return (
    <span className="h-1 w-10 shrink-0 overflow-clip rounded-full bg-muted">
      <span className={cn('block h-1', className)} style={{ width: fill }} />
    </span>
  );
}

// Composer card -------------------------------------------------------------

/** One look of the account chip in the composer toolbar. */
function AccountChip({ show, indicator, name, usage }: { show: string; indicator: ReactNode; name: string; usage: ReactNode }) {
  return (
    <span data-show={show} className="col-start-1 row-start-1 flex h-8 items-center gap-1.5 rounded-md px-1.5">
      {indicator}
      <span className="text-[12px] leading-4 text-foreground">{name}</span>
      {usage}
    </span>
  );
}

/** The account chip: amber (0), red (1), spinner (2), then "Personal" (3). */
function AccountChips() {
  const used = (text: string, className: string) => <span className={cn('text-[12px] leading-4', className)}>{text}</span>;
  return (
    <span className="grid">
      <AccountChip show="0" indicator={<Dot className="bg-warning" />} name="Work" usage={used('5h 85%', 'text-warning')} />
      <AccountChip
        show="1"
        indicator={<Dot className="bg-destructive" />}
        name="Work"
        usage={used('5h 100%', 'text-destructive')}
      />
      <AccountChip
        show="2"
        indicator={<Spinner size={10} strokeWidth={3} />}
        name="Work"
        usage={used('5h 100%', 'text-destructive')}
      />
      <AccountChip
        show="3"
        indicator={<Dot className="bg-success" />}
        name="Personal"
        usage={used('5h 13%', 'text-secondary-foreground')}
      />
    </span>
  );
}

/** Stop (agent works: 0, 3) or send (draft kept: 1, 2). */
function SendButton() {
  return (
    <span className="acc-send relative grid size-8 shrink-0 place-items-center rounded-lg bg-primary-fill">
      <span data-show="1" className="absolute inset-0 rounded-lg shadow-[0_1px_2px_#00000066]" />
      <span data-show="0 3" className="col-start-1 row-start-1 size-2.5 rounded-[2px] bg-white" />
      <span data-show="1 2" className="col-start-1 row-start-1 flex text-white">
        <Glyph size={14} strokeWidth={2.25}>
          <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </Glyph>
      </span>
    </span>
  );
}

function ComposerCard() {
  return (
    <div className={cn('relative flex flex-col rounded-[14px] border-[0.5px] border-hairline bg-card', COMPOSER_SHADOW)}>
      <div className="relative h-[42px] shrink-0 px-4 pt-3.5 pb-1.5">
        <span data-show="0 3" className="absolute top-3.5 left-4 text-[15px] leading-[22px] text-muted-foreground">
          {PLACEHOLDER}
        </span>
        <span data-show="1 2" className="absolute top-3.5 left-4 text-[15px] leading-[22px] text-foreground">
          {DRAFT}
        </span>
      </div>
      <div className="flex items-center gap-1 px-2 pt-1.5 pb-2">
        <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
          <Glyph size={16} strokeWidth={1.75}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </Glyph>
        </span>
        <span className="flex h-8 items-center gap-1.5 rounded-md px-1.5">
          <Glyph size={13} strokeWidth={1.75} className="text-secondary-foreground">
            <path
              d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Glyph>
          <span className="text-[12px] leading-4 text-secondary-foreground">Default</span>
          <ChevronDown size={11} />
        </span>
        <AccountChips />
        <span className="flex-1" />
        <span className="flex h-8 items-center gap-1.5 px-2">
          <AgentLogo agent="claude-code" size={12} />
          <span className="text-[13px] leading-5 text-secondary-foreground">Opus 5.5</span>
          <span className="text-[13px] leading-5 text-muted-foreground">Medium</span>
        </span>
        <SendButton />
      </div>
    </div>
  );
}

/** The composer: the card, its docks and the account menu. */
function Composer() {
  return (
    <div className="absolute bottom-[46px] left-[120px] w-[660px]">
      <ComposerCard />
      <NearLimitBanner />
      <LimitDock />
      <AccountMenu />
    </div>
  );
}

/** Step 3: "Work reached its limit. Continued on Personal." */
function SuccessToast() {
  return (
    <div
      data-show="3"
      style={delay(150)}
      className={cn(
        'acc-rise absolute bottom-[162px] left-[450px] flex -translate-x-1/2 items-center gap-2 rounded-[10px] border-[0.5px] border-chip-edge bg-popover px-3.5 py-2.5',
        POPOVER_SHADOW,
      )}
    >
      <Glyph size={14} className="text-success">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </Glyph>
      <span className="text-[13px] leading-5 whitespace-pre text-foreground">
        Work reached its limit. Continued on Personal.
      </span>
    </div>
  );
}

// Scene ---------------------------------------------------------------------

export function AccountsScene({ step }: { step: TourStep }) {
  return (
    <div data-step={step} className="acc relative flex min-h-0 flex-1 flex-col">
      <WindowTabBar>
        <WindowTab active icon={<AgentLogo agent="claude-code" size={12} />}>
          Refactor checkout flow
        </WindowTab>
        <WindowTab icon={<AgentLogo agent="codex" size={12} />}>Fix flaky e2e</WindowTab>
      </WindowTabBar>
      <Chat />
      <Composer />
      <SuccessToast />
    </div>
  );
}

/** The agents this tab is about (shown under the steps). */
export function AccountsFooter() {
  return (
    <>
      <AgentLogo agent="claude-code" size={16} />
      <span>Claude Code</span>
      <span className="text-[#464849]">·</span>
      <AgentLogo agent="codex" size={15} />
      <span>Codex (ChatGPT)</span>
    </>
  );
}
