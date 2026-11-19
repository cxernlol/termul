import type { CSSProperties, ReactNode } from 'react';

import { AgentLogo } from '@/components/ui/AgentLogo';
import { cn } from '@/lib/utils';
import { WindowTabBar } from '../app-ui';
import type { TourStep } from '../types';
import './automation.css';

/*
 * Automation tab (Paper "Feature tour · All states", Automation 1/4–4/4).
 * Step 1: a suggestion card in the chat. Step 2: the run policy to approve.
 * Step 3: the run canvas while it runs. Step 4: the run history.
 * All parts are in the DOM. automation.css shows them per step.
 */

const SUGGESTION =
  'You’ve asked something like “summarize open PRs” on 4 days (usually around 9 AM). Make it a background automation?';

const POLICY_ROWS = [
  { label: 'Trigger', value: 'Cron 0 9 * * 1-5 (Asia/Jakarta)' },
  { label: 'Agents', value: 'Summarize · claude (Sonnet) · tools: read files, search' },
  { label: 'Outbound hosts', value: 'api.github.com' },
];

/** Run history before the new run. The last row goes out of view when the new row comes in. */
const OLDER_RUNS = [
  { status: 'Succeeded', when: 'Fri, Nov 20, 9:00 AM', took: '52 s' },
  { status: 'Succeeded', when: 'Thu, Nov 19, 9:00 AM', took: '1 min 3 s' },
  { status: 'Failed', when: 'Wed, Nov 18, 9:00 AM', took: '12 s' },
  { status: 'Succeeded', when: 'Tue, Nov 17, 9:00 AM', took: '50 s' },
];

/** The dot grid of the run canvas. */
const CANVAS_DOTS: CSSProperties = {
  backgroundImage: 'radial-gradient(circle, oklch(92% 0.001 286 / 0.16) 0.75px, transparent 1px)',
  backgroundSize: '20px 20px',
};

/** Delay for one part, in ms (see `--d` in automation.css). */
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

function Glyph({
  size = 16,
  strokeWidth = 2,
  className,
  children,
}: {
  size?: number;
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
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  );
}

const CalendarGlyph = ({ size, className }: { size: number; className?: string }) => (
  <Glyph size={size} className={className}>
    <rect x="3" y="4" width="18" height="17" rx="3" strokeLinecap="round" />
    <path d="M8 2v4M16 2v4M3 10h18" strokeLinecap="round" />
  </Glyph>
);

const CheckCircle = () => (
  <Glyph className="text-success">
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </Glyph>
);

function Pill({ tone, children }: { tone: 'warning' | 'success'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-5 w-fit items-center rounded-full px-2 text-[11px] leading-3.5 font-medium whitespace-nowrap',
        tone === 'warning' ? 'bg-[#EAB30533] text-warning' : 'bg-[#22C55E33] text-success',
      )}
    >
      {children}
    </span>
  );
}

function SecondaryButton({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-9 items-center gap-1.5 rounded-lg border-[0.5px] border-chip-edge bg-secondary px-3 text-[13px] leading-4 font-medium text-foreground shadow-card">
      {children}
    </span>
  );
}

function PrimaryButton({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-9 shrink-0 items-center rounded-lg bg-primary-fill px-3 text-[13px] leading-5 font-medium text-white shadow-[inset_0_1px_0_#FFFFFF29,0_1px_2px_#00000073]">
      {children}
    </span>
  );
}

/* ---------- Window tab bar ---------- */

function TabBar() {
  return (
    <WindowTabBar>
      <span className="relative isolate flex h-7 items-center gap-2 px-2.5 text-[13px] leading-5">
        <span className="au-tab-fill absolute inset-0 -z-10 rounded-lg bg-muted" />
        <AgentLogo agent="claude-code" size={12} />
        <span className="au-tab-label">Summarize open PRs</span>
      </span>
      <span
        data-show="1 2 3"
        data-pop
        className="flex h-7 origin-left items-center gap-2 rounded-lg bg-muted px-2.5 text-[13px] leading-5 text-foreground"
      >
        <CalendarGlyph size={12} />
        Automations
      </span>
    </WindowTabBar>
  );
}

/* ---------- Step 1: chat with the suggestion card ---------- */

function Composer() {
  return (
    <div className="absolute bottom-[46px] left-[120px] flex w-[660px] flex-col rounded-[14px] border-[0.5px] border-hairline bg-card shadow-[0_1px_2px_#00000080,0_6px_8px_-4px_#00000080]">
      <div className="h-[42px] shrink-0 px-4 pt-3.5 pb-1.5 text-[15px] leading-[22px] whitespace-nowrap text-muted-foreground">
        Ask anything… (/ for commands, @ for files and chats)
      </div>
      <div className="flex items-center gap-1 px-2 pt-1.5 pb-2">
        <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
          <Glyph strokeWidth={1.75}>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </Glyph>
        </span>
        <span className="flex h-8 items-center gap-1.5 rounded-md px-1.5 text-secondary-foreground">
          <Glyph size={13} strokeWidth={1.75}>
            <path
              d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Glyph>
          Default
          <Glyph size={11} className="text-muted-foreground">
            <path d="m6 9 6 6 6-6" />
          </Glyph>
        </span>
        <span className="flex h-8 items-center gap-1.5 px-1.5">
          <span className="size-1.5 shrink-0 rounded-full bg-success" />
          <span className="text-foreground">Personal</span>
          <span className="text-secondary-foreground">5h 13%</span>
        </span>
        <span className="grow" />
        <span className="flex h-8 items-center gap-1.5 px-2 text-[13px] leading-5">
          <AgentLogo agent="claude-code" size={12} />
          <span className="text-secondary-foreground">Opus 5.5</span>
          <span className="text-muted-foreground">Medium</span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-fill text-white shadow-[0_1px_2px_#00000066]">
          <Glyph size={14} strokeWidth={2.25}>
            <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </Glyph>
        </span>
      </div>
    </div>
  );
}

function SuggestionCard() {
  return (
    <div className="au-suggest flex gap-3 rounded-2xl border-[0.5px] border-hairline bg-card px-3.5 py-3 shadow-card">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border-[0.5px] border-[#3B9EFF4D] bg-[#3B9EFF1A] text-primary">
        <CalendarGlyph size={13} />
      </span>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="text-sm leading-5 font-medium text-foreground">This looks repeatable</div>
          <div className="text-[13px] leading-[19px] text-muted-foreground">{SUGGESTION}</div>
        </div>
        <div className="flex gap-1.5 text-[13px] leading-5 font-medium">
          <PrimaryButton>Create automation</PrimaryButton>
          <span className="flex h-9 items-center rounded-lg border-[0.5px] border-chip-edge bg-secondary px-3 text-foreground">
            Not now
          </span>
          <span className="flex h-9 items-center rounded-lg px-2.5 text-muted-foreground">Don't suggest this again</span>
        </div>
      </div>
    </div>
  );
}

function ChatView() {
  return (
    <div data-show="0" data-swap className="absolute inset-0">
      <div className="flex flex-col items-center pt-6">
        <div className="flex w-[660px] flex-col gap-3.5">
          <div className="flex justify-end">
            <div className="rounded-[14px] bg-muted px-3.5 py-2.5 text-sm leading-[21px] text-foreground">
              Summarize the open PRs in acme-shop.
            </div>
          </div>
          <div className="flex min-h-7 items-center justify-between px-1">
            <span className="text-[13px] leading-5 text-muted-foreground">
              Ran <span className="text-foreground">gh pr list --state open</span>
            </span>
            <span className="text-xs leading-5 text-muted-foreground">1.4s</span>
          </div>
          <div className="text-sm leading-[22px] text-foreground">
            Here is today's summary of open PRs. 3 need review, 1 has failing checks.
          </div>
          <SuggestionCard />
        </div>
      </div>
      <Composer />
    </div>
  );
}

/* ---------- Steps 2–4: the Automations panel ---------- */

function ListRow({
  title,
  pill,
  cron,
  runLine,
  selected,
}: {
  title: string;
  pill: ReactNode;
  cron: string;
  runLine: ReactNode;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-lg px-3 py-2.5',
        selected && 'border-[0.5px] border-chip-edge bg-muted shadow-[0_1px_2px_#00000066]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm leading-5 font-medium text-foreground">{title}</span>
        {pill}
      </div>
      <div className="text-xs leading-4 text-muted-foreground">{cron}</div>
      {runLine}
    </div>
  );
}

function Aside() {
  return (
    <div className="flex w-72 shrink-0 flex-col border-r-[0.5px] border-border">
      <div className="flex h-10 shrink-0 items-center gap-2 px-4 text-sm leading-5 font-medium text-foreground">
        <CalendarGlyph size={14} />
        Automations
      </div>
      <div className="flex flex-col gap-0.5 px-2 py-1">
        <ListRow
          selected
          title="Daily PR summary"
          pill={
            <span className="au-stack justify-items-end">
              <span data-show="0 1" data-swap>
                <Pill tone="warning">Needs approval</Pill>
              </span>
              <span data-show="2 3" data-swap>
                <Pill tone="success">Armed</Pill>
              </span>
            </span>
          }
          cron="Cron 0 9 * * 1-5 (Asia/Jakarta)"
          runLine={
            <div className="au-runline au-stack text-xs leading-4 text-muted-foreground">
              <span data-show="0 1" data-swap>
                No next run · Never run
              </span>
              <span data-show="2" data-swap>
                Next Mon, Nov 23, 9:00 AM · Last run <span className="text-primary">running</span>
              </span>
              <span data-show="3" data-swap>
                Next Tue, Nov 24, 9:00 AM · Last run <span className="text-success">succeeded</span>
              </span>
            </div>
          }
        />
        <ListRow
          title="Weekly dependency check"
          pill={<Pill tone="success">Armed</Pill>}
          cron="Cron 0 8 * * 1 (Asia/Jakarta)"
          runLine={
            <div className="text-xs leading-4 text-muted-foreground">
              Next Mon, Nov 23, 8:00 AM · Last run <span className="text-success">succeeded</span>
            </div>
          }
        />
      </div>
    </div>
  );
}

function Switch() {
  return (
    <span className="relative flex h-[18px] w-8 shrink-0 rounded-full bg-switch-track-off p-0.5">
      <span className="au-switch-on absolute inset-0 rounded-full bg-switch-track-on" />
      <span className="au-knob relative size-3.5 shrink-0 rounded-full bg-white" />
    </span>
  );
}

function PolicyCard() {
  return (
    <div className="flex flex-col overflow-clip rounded-xl border-[0.5px] border-hairline bg-card">
      <div className="flex items-center gap-2 border-b-[0.5px] border-border px-3.5 py-2.5">
        <Glyph size={15} strokeWidth={1.75} className="text-foreground">
          <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
          <path d="m9 12 2 2 4-4" />
        </Glyph>
        <span className="text-[13px] leading-5 font-medium text-foreground">Run policy</span>
        <span className="grow" />
        <span className="text-xs leading-5 text-muted-foreground">Revision 1</span>
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
        {POLICY_ROWS.map((row) => (
          <div key={row.label} className="flex">
            <span className="w-24 shrink-0 text-xs leading-[18px] text-muted-foreground">{row.label}</span>
            <span className="rounded-sm bg-muted px-1.5 font-mono text-[11px] leading-[18px] text-foreground">
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t-[0.5px] border-border px-3.5 py-2.5">
        <span className="grow text-xs leading-[18px] text-muted-foreground">
          Not approved yet. It will not run until you approve this revision.
        </span>
        <PrimaryButton>Approve and arm</PrimaryButton>
      </div>
    </div>
  );
}

function RunRow({ status, when, took, fresh }: { status: string; when: string; took: string; fresh?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-h-11 items-center border-b-[0.5px] border-border px-3 text-xs leading-[18px]',
        fresh && 'bg-[#22C55E0D]',
      )}
    >
      <span
        className={cn('w-20 shrink-0 font-medium', status === 'Failed' ? 'text-destructive' : 'text-success')}
      >
        {status}
      </span>
      <span className="grow text-foreground">{when}</span>
      <span className="text-muted-foreground">{took}</span>
    </div>
  );
}

function RunHistory() {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs leading-4 font-medium text-muted-foreground">Runs</div>
      <div className="rounded-lg border-[0.5px] border-hairline bg-card">
        {/* Four rows show. The oldest row stays below the clip. */}
        <div className="relative h-[177.5px] overflow-clip rounded-lg">
          <div className="au-runs-older absolute inset-x-0 top-[44.5px]">
            {OLDER_RUNS.map((run) => (
              <RunRow key={run.when} {...run} />
            ))}
          </div>
          <div data-show="3" className="absolute inset-x-0 top-0" style={delay(450)}>
            <RunRow fresh status="Succeeded" when="Mon, Nov 23, 9:00 AM" took="48 s" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Steps 2 and 4: the automation detail. */
function DetailView() {
  return (
    <div data-show="1 3" className="absolute inset-0 flex flex-col gap-5 py-6 pr-[76px] pl-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base leading-6 font-medium text-foreground">Daily PR summary</span>
          <span className="au-stack">
            <span data-show="0 1" data-swap>
              <Pill tone="warning">Needs approval</Pill>
            </span>
            <span data-show="2 3" data-swap>
              <Pill tone="success">Armed</Pill>
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-2 pr-1 text-[13px] leading-5 text-foreground">
            <Switch />
            Enabled
          </span>
          <SecondaryButton>Run now</SecondaryButton>
          <SecondaryButton>
            <Glyph size={13}>
              <circle cx="8" cy="15" r="4" strokeLinecap="round" />
              <path d="M10.85 12.15 19 4M18 5l2 2M15 8l2 2" strokeLinecap="round" />
            </Glyph>
            Secrets
          </SecondaryButton>
        </div>
      </div>
      <div className="au-stack items-start">
        <div data-show="0 1">
          <PolicyCard />
        </div>
        <div data-show="2 3" data-swap>
          <RunHistory />
        </div>
      </div>
    </div>
  );
}

function CanvasNode({
  className,
  icon,
  title,
  detail,
  status,
  children,
}: {
  className: string;
  icon?: ReactNode;
  title?: string;
  detail?: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'absolute flex h-16 items-center gap-2 rounded-xl border-[0.5px] border-hairline bg-card pr-1.5 pl-2.5',
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">{icon}</span>
      {title ? (
        <span className="flex min-w-0 grow flex-col">
          <span className="text-[13px] leading-[18px] font-medium text-foreground">{title}</span>
          <span className="truncate text-[11px] leading-4 text-muted-foreground">{detail}</span>
        </span>
      ) : null}
      {status}
      {children}
    </div>
  );
}

/** Step 3: the run canvas. Steps light up in order, then a dot moves along the live edge. */
function RunView() {
  return (
    <div data-show="2" className="absolute inset-0 flex flex-col gap-5 py-6 pr-[76px] pl-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground">
          <Glyph size={14}>
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </Glyph>
        </span>
        <span className="flex grow flex-col">
          <span className="text-sm leading-5 font-medium text-primary">Running</span>
          <span className="text-xs leading-4 text-muted-foreground">Scheduled · Mon, Nov 23, 9:00 AM · revision 1</span>
        </span>
        <SecondaryButton>Cancel run</SecondaryButton>
      </div>
      <div className="relative h-[420px] shrink-0 overflow-clip rounded-lg border-[0.5px] border-border" style={CANVAS_DOTS}>
        <svg width="512" height="420" viewBox="0 0 512 420" fill="none" aria-hidden="true" className="absolute top-0 left-0">
          <path d="M56 152 L92 152" stroke="var(--color-muted-foreground)" strokeWidth="2.25" />
          <path
            data-show="2"
            data-swap
            style={delay(400)}
            d="M284 152 C 312 152, 292 248, 320 248"
            stroke="var(--color-primary)"
            strokeWidth="2"
            strokeDasharray="6 5"
          />
          <path d="M500 280 C 520 280, 520 340, 540 340" stroke="var(--color-muted-foreground)" strokeWidth="1.5" opacity="0.3" />
        </svg>
        <CanvasNode className="top-[120px] left-[-120px] w-44" title="Scheduled" detail="Due 9:00 AM" status={<CheckCircle />} />
        <CanvasNode
          className="top-[120px] left-[92px] w-48"
          icon={
            <Glyph strokeWidth={1.75}>
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
            </Glyph>
          }
          title="Fetch open PRs"
          detail="HTTP · GET api.github.com"
          status={
            <span data-show="2" data-pop style={delay(250)} className="flex">
              <CheckCircle />
            </span>
          }
        />
        <CanvasNode
          className="top-[216px] left-[320px] w-45"
          icon={
            <Glyph strokeWidth={1.75}>
              <rect x="4" y="8" width="16" height="12" rx="3" />
              <path d="M12 4v4M9 13h.01M15 13h.01" />
            </Glyph>
          }
          title="Summarize"
          detail="Agent · claude"
          status={
            <span data-show="2" data-swap style={delay(900)} className="flex text-primary">
              <Glyph strokeWidth={2.5} className="au-spin">
                <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
              </Glyph>
            </span>
          }
        >
          {/* The blue ring of the running step. */}
          <span
            data-show="2"
            data-swap
            style={delay(900)}
            className="absolute -inset-px rounded-xl border border-[#3B9EFF8C] shadow-[0_0_0_3px_#3B9EFF26]"
          />
        </CanvasNode>
        <CanvasNode className="top-[308px] left-[540px] w-48 opacity-50" />
        <span className="au-dot absolute top-0 left-0 size-2">
          <span className="au-dot-fade block size-2 rounded-full bg-primary shadow-[0_0_0_3px_#3B9EFF33]" />
        </span>
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border-[0.5px] border-chip-edge bg-popover p-1 text-muted-foreground shadow-[0_4px_8px_-4px_#00000099]">
          <span className="flex size-8 items-center justify-center">
            <Glyph strokeWidth={1.75}>
              <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
            </Glyph>
          </span>
          <span className="flex size-8 items-center justify-center">
            <Glyph strokeWidth={1.75}>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4M8 11h6M11 8v6" />
            </Glyph>
          </span>
          <span className="flex size-8 items-center justify-center">
            <Glyph strokeWidth={1.75}>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4M8 11h6" />
            </Glyph>
          </span>
        </div>
      </div>
    </div>
  );
}

function AutomationsPanel() {
  return (
    <div data-show="1 2 3" data-swap className="absolute inset-0 flex">
      <Aside />
      <div className="relative min-w-0 grow">
        <DetailView />
        <RunView />
      </div>
    </div>
  );
}

export function AutomationScene({ step }: { step: TourStep }) {
  return (
    <div data-step={step} className="au-root relative flex min-h-0 flex-1 flex-col text-xs leading-4">
      <TabBar />
      <div className="relative min-h-0 flex-1">
        <ChatView />
        <AutomationsPanel />
      </div>
    </div>
  );
}

