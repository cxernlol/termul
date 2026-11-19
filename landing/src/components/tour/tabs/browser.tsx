import type { CSSProperties, ReactNode } from 'react';

import { AgentLogo } from '@/components/ui/AgentLogo';
import { cn } from '@/lib/utils';
import { TrafficLights, WindowTab } from '../app-ui';
import type { TourStep } from '../types';
import './browser.css';

/*
 * Browser tab (Paper "Feature tour · All states", Browser 1/4–4/4).
 * Step 1: the agent starts to use the browser (full-width chat).
 * Step 2: the window splits; a visible agent tab shows the signup page.
 * Step 3: the agent asks before it submits a password.
 * Step 4: the fix is done and checked; a screenshot is in the reply.
 * All parts are in the DOM. browser.css shows them per step.
 * The web page in the browser pane is drawn with plain elements.
 */

const PROMPT = 'Check the signup flow on localhost:5173 and fix what breaks.';
const INTRO = "I'll open the signup page and try it like a new user.";
const REPLY =
  'Signup failed when the name field was empty. I made it optional and checked again in the browser: it works now.';

/** Delay for one part, in ms (see `--d` in browser.css). */
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/** The red fill of the Stop button (Paper token destructive-fill). */
const DESTRUCTIVE_FILL = 'bg-[oklch(54.9%_0.208_25.3)]';

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

const Globe = ({ size, className }: { size: number; className?: string }) => (
  <Glyph size={size} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
  </Glyph>
);

const Shield = ({ size, className, children }: { size: number; className?: string; children: ReactNode }) => (
  <Glyph size={size} className={className}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
    {children}
  </Glyph>
);

const PlusGlyph = () => (
  <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
    <Glyph strokeWidth={1.75}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </Glyph>
  </span>
);

const StopSquare = () => <span className="size-2.5 shrink-0 rounded-[2px] bg-white" />;

function Account({ usage }: { usage: string }) {
  return (
    <span className="flex h-8 items-center gap-1.5 px-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-success" />
      <span className="text-foreground">Personal</span>
      <span className="text-secondary-foreground">{usage}</span>
    </span>
  );
}

/** "The agent is using the browser." with Stop (BrowserAgentIndicator). */
function AgentBar({ className, ...props }: { className?: string; 'data-show'?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn('flex items-center gap-2 rounded-xl border-[0.5px] border-hairline bg-card py-1.5', className)}
      {...props}
    >
      <Globe size={13} className="text-primary" />
      <span className="grow text-xs leading-[18px] whitespace-pre text-muted-foreground">
        The agent is using the browser.
      </span>
      <span className={cn('flex h-6 items-center gap-1.5 rounded-md px-2', DESTRUCTIVE_FILL)}>
        <span className="size-2 shrink-0 rounded-[1px] bg-white" />
        <span className="text-xs leading-[18px] font-medium text-white">Stop</span>
      </span>
    </div>
  );
}

function ToolRow({ children, took }: { children: ReactNode; took?: string }) {
  return (
    <div className="flex min-h-7 items-center justify-between px-1 text-xs leading-[18px] text-muted-foreground">
      <span>{children}</span>
      {took ? <span>{took}</span> : null}
    </div>
  );
}

const Strong = ({ children }: { children: ReactNode }) => <span className="text-foreground">{children}</span>;

/* ---------- Step 1: one chat, full width ---------- */

function WideComposer() {
  return (
    <div className="flex flex-col rounded-[14px] border-[0.5px] border-hairline bg-card shadow-[0_1px_2px_#00000080,0_6px_8px_-4px_#00000080]">
      <div className="h-[42px] shrink-0 px-4 pt-3.5 pb-1.5 text-[15px] leading-[22px] whitespace-nowrap text-muted-foreground">
        Ask anything… (/ for commands, @ for files and chats)
      </div>
      <div className="flex items-center gap-1 px-2 pt-1.5 pb-2">
        <PlusGlyph />
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
        <Account usage="5h 13%" />
        <span className="grow" />
        <span className="flex h-8 items-center gap-1.5 px-2 text-[13px] leading-5">
          <AgentLogo agent="claude-code" size={12} />
          <span className="text-secondary-foreground">Opus 5.5</span>
          <span className="text-muted-foreground">Medium</span>
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-fill">
          <StopSquare />
        </span>
      </div>
    </div>
  );
}

/** The running tool row. A shine layer moves over the same text. */
function OpeningRow() {
  const text = (
    <>
      <span>Opening</span>
      <span className="pl-1">localhost:5173/signup</span>
      <span>…</span>
    </>
  );
  return (
    <div className="relative flex min-h-7 items-center px-1 text-[13px] leading-5">
      <span className="text-muted-foreground">Opening</span>
      <span className="pl-1 text-foreground">localhost:5173/signup</span>
      <span className="text-muted-foreground">…</span>
      <span className="br-shine absolute inset-0 flex items-center px-1">{text}</span>
    </div>
  );
}

function SingleView() {
  return (
    <div data-show="0" data-swap className="absolute inset-0 flex flex-col">
      <div className="h-10 shrink-0 border-b-[0.5px] border-border" />
      <div className="flex flex-col items-center pt-6">
        <div className="flex w-[660px] flex-col gap-3.5">
          <div className="flex justify-end">
            <div className="rounded-[14px] bg-muted px-3.5 py-2.5 text-sm leading-[21px] text-foreground">{PROMPT}</div>
          </div>
          <div className="text-sm leading-[22px] text-foreground">{INTRO}</div>
          <div className="br-enter" style={delay(300)}>
            <OpeningRow />
          </div>
        </div>
      </div>
      <div className="absolute bottom-[46px] left-[120px] flex w-[660px] flex-col gap-2">
        <AgentBar className="br-enter px-3" style={delay(600)} />
        <WideComposer />
      </div>
    </div>
  );
}

/* ---------- Steps 2–4: chat pane + browser pane ---------- */

function NarrowComposer() {
  return (
    <div className="flex flex-col rounded-[14px] border-[0.5px] border-hairline bg-card shadow-[0_1px_2px_#00000080,0_6px_8px_-4px_#00000080]">
      <div className="h-[42px] shrink-0 overflow-clip px-3.5 pt-3 pb-1 text-sm leading-[22px] whitespace-nowrap text-muted-foreground">
        Ask anything…
      </div>
      <div className="flex items-center gap-0.5 px-1.5 pt-1 pb-1.5">
        <PlusGlyph />
        <Account usage="5h 14%" />
        <span className="grow" />
        <span className="flex h-8 items-center gap-1.5 px-1.5 text-secondary-foreground">
          <AgentLogo agent="claude-code" size={12} />
          Opus 5.5
        </span>
        <span className="relative size-8 shrink-0">
          {/* Stop while the agent works, Send when it is done. */}
          <span
            data-show="0 1 2"
            data-swap
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary-fill shadow-[inset_0_1px_0_#FFFFFF29,0_1px_2px_#00000073]"
          >
            <StopSquare />
          </span>
          <span
            data-show="3"
            data-swap
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary-fill text-white shadow-[0_1px_2px_#00000066]"
          >
            <Glyph size={14} strokeWidth={2.25}>
              <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </Glyph>
          </span>
        </span>
      </div>
    </div>
  );
}

/** Step 3: the agent asks before it submits a password (BrowserConsentCard). */
function ConsentCard() {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border-[0.5px] border-[#EAB30540] bg-card p-3 shadow-card">
      <div className="flex items-start gap-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#EAB3051F] text-warning">
          <Shield size={13}>
            <path d="M12 9v4M12 16h.01" />
          </Shield>
        </span>
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] leading-[18px] font-medium text-foreground">Allow the agent to submit a password?</div>
          <div className="text-xs leading-[17px] text-muted-foreground">
            Claude wants to submit a password on localhost:5173.
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-[3px] pl-[34px] text-xs leading-[17px]">
        <div className="flex">
          <span className="w-[72px] shrink-0 text-muted-foreground">Site</span>
          <span className="text-foreground">localhost:5173</span>
        </div>
        <div className="flex">
          <span className="w-[72px] shrink-0 text-muted-foreground">Agent says</span>
          <span className="text-foreground">"Signing up a test user"</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-[34px] text-xs leading-4 font-medium">
        <span className="flex h-8 items-center gap-1.5 rounded-lg bg-primary-fill px-2.5 text-white shadow-[inset_0_1px_0_#FFFFFF29,0_1px_2px_#00000073]">
          <Shield size={12}>
            <path d="m9 12 2 2 4-4" />
          </Shield>
          Allow once
        </span>
        <span className="flex h-8 items-center rounded-lg border-[0.5px] border-chip-edge bg-secondary px-2.5 text-foreground">
          Always allow on this site for this project
        </span>
        <span className="flex h-8 items-center rounded-lg px-2.5 text-muted-foreground">Deny</span>
      </div>
    </div>
  );
}

/** Step 4: the screenshot the agent took, as a small image of the welcome page. */
function ScreenshotThumb() {
  return (
    <div className="flex h-28 w-45 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-hairline bg-[#F7F7F5]">
      <div className="flex w-[110px] shrink-0 flex-col gap-[5px] rounded-md bg-white p-2.5">
        <div className="text-[8px] leading-2.5 font-semibold text-[#1A1A1A]">Welcome, Ana</div>
        <div className="h-1.5 rounded-[2px] bg-[#E8E8E8]" />
        <div className="h-1.5 w-[60%] rounded-[2px] bg-[#E8E8E8]" />
      </div>
    </div>
  );
}

function ChatPane() {
  return (
    <div data-show="1 2 3" data-swap className="relative flex w-[340px] shrink-0 flex-col border-r-[0.5px] border-border">
      <div className="h-10 shrink-0 border-b-[0.5px] border-border" />
      <div className="flex flex-col gap-3 px-4 py-[18px]">
        <div className="flex justify-end">
          <div className="max-w-[260px] rounded-[14px] bg-muted px-3 py-[9px] text-[13px] leading-5 text-foreground">
            {PROMPT}
          </div>
        </div>
        <div data-show="0 1 3" data-swap className="text-[13px] leading-5 text-foreground">
          {INTRO}
        </div>
        <div className="br-shift flex flex-col">
          <ToolRow took="0.8s">
            Opened <Strong>localhost:5173/signup</Strong>
          </ToolRow>
          <div className="br-stack">
            <div data-show="0 1" data-swap>
              <ToolRow>
                Filling <Strong>Email</Strong>…
              </ToolRow>
            </div>
            <div data-show="2" data-swap>
              <ToolRow>
                Waiting to submit <Strong>Password</Strong>…
              </ToolRow>
            </div>
            <div data-show="3" data-swap>
              <ToolRow took="0.3s">
                Edited <Strong>signup-schema.ts</Strong> <span className="text-success">+3</span>{' '}
                <span className="text-destructive">−1</span>
              </ToolRow>
            </div>
          </div>
          <div className="br-stack items-start">
            <div data-show="2" className="pt-3" style={delay(150)}>
              <ConsentCard />
            </div>
            <div className="flex flex-col">
              <div data-show="3" style={delay(150)}>
                <ToolRow took="0.6s">
                  Clicked <Strong>Sign up</Strong>
                </ToolRow>
              </div>
              <div data-show="3" style={delay(250)}>
                <ToolRow took="0.3s">
                  Took <Strong>screenshot</Strong>
                </ToolRow>
              </div>
              <div data-show="3" className="pt-3" style={delay(400)}>
                <ScreenshotThumb />
              </div>
              <div data-show="3" className="pt-3 text-[13px] leading-5 text-foreground" style={delay(550)}>
                {REPLY}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-[46px] flex flex-col gap-2">
        <AgentBar data-show="1 2" className="pr-1.5 pl-3" />
        <NarrowComposer />
      </div>
    </div>
  );
}

function AgentTab() {
  return (
    <span className="relative isolate flex h-7 items-center gap-1.5 px-2 text-xs leading-4">
      <span className="br-tab-fill absolute inset-0 -z-10 rounded-lg bg-muted" />
      <Globe size={12} className="text-muted-foreground" />
      <span className="br-stack whitespace-nowrap text-foreground">
        <span data-show="0 1 2" data-swap>
          Sign up · Acme
        </span>
        <span data-show="3" data-swap>
          Welcome · Acme
        </span>
      </span>
      <span className="br-tab-tail flex items-center gap-1.5">
        <span className="flex h-4 items-center rounded-sm bg-[#3B9EFF26] px-1 text-[9px] leading-4 font-semibold tracking-wider text-primary uppercase">
          Agent
        </span>
        <span className="flex size-4 shrink-0 items-center justify-center">
          <span className="size-[7px] rounded-[1px] bg-destructive" />
        </span>
      </span>
    </span>
  );
}

function BrowserControls() {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b-[0.5px] border-border bg-card px-2 text-muted-foreground">
      <Glyph size={14}>
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </Glyph>
      <Glyph size={14}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </Glyph>
      <Glyph size={14}>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
      </Glyph>
      <span className="flex h-7 grow items-center gap-1.5 rounded-md bg-background px-2">
        <Glyph size={14}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
        </Glyph>
        <span className="br-stack text-[13px] leading-5 text-foreground">
          <span data-show="0 1 2" data-swap>
            http://localhost:5173/signup
          </span>
          <span data-show="3" data-swap>
            http://localhost:5173/welcome
          </span>
        </span>
      </span>
    </div>
  );
}

/** A text field on the demo signup page. `focus` lists the steps with the blue focus edge. */
function Field({ label, focus, children }: { label: string; focus: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs leading-4 text-[#6B6B6B]">{label}</div>
      <div className="relative flex h-9 shrink-0 items-center rounded-md border border-[#DCDCDC] px-2.5">
        <span data-show={focus} data-swap className="absolute -inset-px rounded-md border border-[#2563EB]" />
        {children}
      </div>
    </div>
  );
}

const PageButton = ({ children }: { children: ReactNode }) => (
  <div className="flex h-9 shrink-0 items-center justify-center rounded-md bg-[#1A1A1A] text-[13px] leading-4 font-medium text-white">
    {children}
  </div>
);

function SignupForm() {
  return (
    <div className="flex w-[300px] flex-col gap-2.5 rounded-xl bg-white p-[22px] shadow-[0_1px_3px_#0000001F]">
      <div className="text-lg leading-6 font-semibold text-[#1A1A1A]">Create your account</div>
      <Field label="Email" focus="0 1">
        <span className="relative text-[13px] leading-4 text-[#1A1A1A]">ana@acme.dev</span>
      </Field>
      <Field label="Password" focus="2">
        <span
          data-show="2"
          data-swap
          style={delay(150)}
          className="relative text-base leading-[34px] tracking-[0.15em] text-[#1A1A1A]"
        >
          ••••••••••
        </span>
      </Field>
      <PageButton>Sign up</PageButton>
    </div>
  );
}

function WelcomeCard() {
  return (
    <div className="flex w-[300px] flex-col gap-3 rounded-xl bg-white p-[22px] shadow-[0_1px_3px_#0000001F]">
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16A34A]">
          <Glyph strokeWidth={2.5}>
            <path d="m5 12 5 5 9-10" />
          </Glyph>
        </span>
        <span className="text-lg leading-6 font-semibold text-[#1A1A1A]">Welcome, Ana</span>
      </div>
      <div className="text-[13px] leading-[19px] text-[#6B6B6B]">
        Your account is ready. We sent a confirmation to ana@acme.dev.
      </div>
      <PageButton>Go to dashboard</PageButton>
    </div>
  );
}

/** Iris: the dither grid over the page, with a clear circle at the agent pointer. */
function Iris() {
  return (
    <>
      <div data-show="1 2" data-swap className="br-iris-fade absolute inset-0">
        <div className="br-iris">
          <div className="br-iris-grid" />
        </div>
      </div>
      <div data-show="1 2" data-swap className="absolute inset-0">
        <svg width="560" height="524" viewBox="0 0 560 524" aria-hidden="true" className="br-pointer absolute top-0 left-0">
          <path
            d="M250 150 l0 17 l4.5 -4.2 l3.2 7 l2.6 -1.2 l-3.1 -6.9 l6.2 -0.2 z"
            fill="#111111"
            stroke="#FFFFFF"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
}

function BrowserPane() {
  return (
    <div data-show="1 2 3" data-slide className="flex min-w-0 grow flex-col">
      <div className="flex h-10 shrink-0 items-center border-b-[0.5px] border-border px-2.5">
        <AgentTab />
      </div>
      <BrowserControls />
      <div className="relative flex grow justify-center overflow-clip bg-[#F7F7F5] pt-16">
        <div className="br-stack h-fit items-start">
          <div data-show="0 1 2" data-swap>
            <SignupForm />
          </div>
          <div data-show="3" style={delay(150)}>
            <WelcomeCard />
          </div>
        </div>
        <Iris />
      </div>
    </div>
  );
}

export function BrowserScene({ step }: { step: TourStep }) {
  return (
    <div data-step={step} className="br-root relative min-h-0 flex-1 text-xs leading-4">
      <SingleView />
      <div className="absolute inset-0 flex">
        <ChatPane />
        <BrowserPane />
      </div>
      {/* Window chrome that stays the same on all steps. */}
      <div className="pointer-events-none absolute top-0 left-3 flex h-10 items-center gap-2">
        <TrafficLights />
        <span className="w-3 shrink-0" />
        <span className="br-chat-tab flex">
          <WindowTab active icon={<AgentLogo agent="claude-code" size={12} />}>
            Fix the signup flow
          </WindowTab>
        </span>
      </div>
    </div>
  );
}

