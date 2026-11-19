import type { ReactNode } from 'react';

import { AgentLogo } from '@/components/ui/AgentLogo';
import { cn } from '@/lib/utils';
import { WindowTabBar, WindowTab } from '../app-ui';
import type { TourStep } from '../types';
import './canvas.css';

/*
 * Canvas tab of the feature tour. Source: Paper "Feature tour · All states
 * (full stage)", Canvas 1/4 to 4/4. All parts are in the DOM for all steps.
 * The `data-step` attribute on the root and canvas.css show or hide them.
 *
 * Step classes (see canvas.css):
 * - cv-s1: shows from step 2 (the "Home" frame and its layer row).
 * - cv-s2: shows from step 3 (frame children and their layer rows).
 * - cv-s3: shows in step 4 (selection box, Button row highlight).
 * - cv-s3-panel: shows in step 4 (the Design panel inspector).
 */

// Demo data -----------------------------------------------------------------

type LayerKind = 'frame' | 'text' | 'button' | 'image';

/** Layer rows in the Layers panel. `delay` sets the "one by one" order. */
const LAYERS: { name: string; kind: LayerKind; step: 's1' | 's2'; delay?: string; selected?: boolean }[] = [
  { name: 'Home', kind: 'frame', step: 's1' },
  { name: 'Heading', kind: 'text', step: 's2' },
  { name: 'Subtitle', kind: 'text', step: 's2', delay: 'cv-d1' },
  { name: 'Button', kind: 'button', step: 's2', delay: 'cv-d2', selected: true },
  { name: 'Image', kind: 'image', step: 's2', delay: 'cv-d3' },
];

/** Inspector sections for the selected button. */
const INSPECTOR: { title: string; fields: [label: string, value: string][] }[] = [
  { title: 'Position', fields: [['X', '22'], ['Y', '104']] },
  { title: 'Layout', fields: [['W', '92'], ['H', '28']] },
  { title: 'Appearance', fields: [['', '100%'], ['R', '6']] },
];

// Icons ---------------------------------------------------------------------

/** A 24-grid stroke icon. The color comes from `currentColor`. */
function Glyph({
  size,
  strokeWidth = 1.75,
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
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  );
}

/** The .figcraft file mark (a board on a stand). */
function FigcraftGlyph({ className }: { className?: string }) {
  return (
    <Glyph size={13} className={className}>
      <rect x="4" y="3" width="16" height="13" rx="2" />
      <path d="M8 21l4-5 4 5M9 8h6M9 11h4" />
    </Glyph>
  );
}

/** The chat tab "working" ring (static, as in Paper). */
function WorkingSpinner() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#3A3B3D" strokeWidth="2.5" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="text-muted-foreground"
      />
    </svg>
  );
}

function LayerGlyph({ kind }: { kind: LayerKind }) {
  return (
    <Glyph size={11} strokeWidth={2} className="text-muted-foreground">
      {kind === 'frame' ? <path d="M8 3v18M16 3v18M3 8h18M3 16h18" /> : null}
      {kind === 'text' ? <path d="M5 5h14M12 5v14" /> : null}
      {kind === 'button' ? <rect x="3" y="7" width="18" height="10" rx="3" /> : null}
      {kind === 'image' ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 16l5-5 5 5 3-3 5 5" />
        </>
      ) : null}
    </Glyph>
  );
}

// Window tab bar and canvas header ------------------------------------------

function TabBar() {
  return (
    <WindowTabBar>
      <WindowTab icon={<AgentLogo agent="claude-code" size={12} />}>
        Build the landing hero
        <WorkingSpinner />
      </WindowTab>
      <span className="flex h-7 items-center gap-2 rounded-lg bg-muted pr-2 pl-2.5 text-[13px] leading-5 text-foreground">
        <FigcraftGlyph className="text-foreground" />
        design.figcraft
        <Glyph size={10} strokeWidth={2.25} className="text-muted-foreground">
          <path d="M6 6l12 12M18 6L6 18" />
        </Glyph>
      </span>
    </WindowTabBar>
  );
}

function CanvasHeader() {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b-[0.5px] border-border pr-16 pl-3.5">
      <div className="flex items-center gap-2 text-[13px] leading-5">
        <FigcraftGlyph className="text-primary" />
        <span className="font-medium text-foreground">design.figcraft</span>
        <span className="text-muted-foreground">Ready</span>
      </div>
      <span className="flex h-[26px] items-center gap-1.5 rounded-md bg-muted px-2.5 text-[12px] leading-4 font-medium text-foreground shadow-[0_0_0_0.5px_#393A3C,0_1px_2px_#00000080]">
        <Glyph size={12} strokeWidth={1.9}>
          <path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
          <path d="M8 3v5h7V3M8 21v-6h8v6" />
        </Glyph>
        Save
      </span>
    </div>
  );
}

// Editor: rail, left panel, canvas, right panel -----------------------------

function RailItem({ label, active, children }: { label: string; active?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex w-12 flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] leading-3',
        active ? 'bg-[#4E8DF524] text-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
      {label}
    </div>
  );
}

function Rail() {
  return (
    <div className="flex w-[60px] shrink-0 flex-col items-center gap-2.5 border-r-[0.5px] border-border pt-2.5">
      <RailItem label="File" active>
        <Glyph size={15} className="text-primary">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </Glyph>
      </RailItem>
      <RailItem label="Assets">
        <Glyph size={15}>
          <path d="M12 3l3 3-3 3-3-3zM6 9l3 3-3 3-3-3zM18 9l3 3-3 3-3-3zM12 15l3 3-3 3-3-3z" />
        </Glyph>
      </RailItem>
      <RailItem label="Variables">
        <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
          <circle cx="8" cy="8" r="2.5" />
          <circle cx="16" cy="8" r="2.5" />
          <circle cx="8" cy="16" r="2.5" />
          <circle cx="16" cy="16" r="2.5" />
        </svg>
      </RailItem>
    </div>
  );
}

function LayersPanel() {
  return (
    <div className="flex w-[176px] shrink-0 flex-col border-r-[0.5px] border-border">
      <div className="flex flex-col gap-0.5 border-b-[0.5px] border-border px-3 pt-3 pb-2.5">
        <span className="text-[13px] leading-[18px] font-medium text-foreground">design</span>
        <span className="text-[11px] leading-4 text-muted-foreground">Troupe</span>
      </div>
      <div className="flex flex-col gap-1 border-b-[0.5px] border-border px-2 py-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] leading-4 font-medium text-foreground">Pages</span>
          <span className="text-[13px] leading-4 text-muted-foreground">+</span>
        </div>
        <div className="flex h-[26px] shrink-0 items-center rounded-md bg-muted px-2 text-[11px] leading-4 text-foreground">
          Page 1
        </div>
      </div>
      <div className="flex flex-col gap-0.5 px-2 py-2.5">
        <div className="px-1 pb-1 text-[11px] leading-4 font-medium text-foreground">Layers</div>
        {LAYERS.map((layer) => (
          <div
            key={layer.name}
            className={cn(
              'cv-in relative isolate flex h-[26px] shrink-0 items-center gap-1.5 rounded-md text-[11px] leading-4 text-foreground',
              layer.kind === 'frame' ? 'px-2' : 'pr-2 pl-6',
              `cv-${layer.step}`,
              layer.delay,
            )}
          >
            {layer.selected ? (
              <span className="cv-in cv-fade cv-s3 absolute inset-0 -z-10 rounded-md bg-[#4E8DF529]" />
            ) : null}
            <LayerGlyph kind={layer.kind} />
            {layer.name}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The "Home" frame the agent builds. Positions are frame-body px from Paper. */
function HomeFrame() {
  return (
    <div className="cv-in cv-s1 absolute top-[58px] left-10 flex w-[300px] flex-col gap-1.5">
      <span className="text-[10px] leading-3 text-muted-foreground">Home</span>
      <div className="relative h-[200px] shrink-0 bg-[#0B0C0E] shadow-[0_0_0_0.5px_#2E2F31]">
        <span className="cv-in cv-s2 absolute top-[30px] left-[22px] text-[22px] leading-[26px] font-semibold tracking-[-0.02em] whitespace-nowrap text-[#F4F4F5]">
          Ship faster
        </span>
        <span className="cv-in cv-s2 cv-d1 absolute top-[62px] left-[22px] w-[150px] text-[11px] leading-[15px] text-[#8F9297]">
          Run every agent from one app, on your desk or phone.
        </span>
        <span className="cv-in cv-s2 cv-d2 absolute top-[104px] left-[22px] flex h-7 w-[92px] items-center justify-center rounded-md bg-[#0E6ABE] text-[11px] leading-3.5 font-medium text-white">
          Get started
        </span>
        <span className="cv-in cv-s2 cv-d3 absolute top-[30px] left-[186px] flex h-[102px] w-[92px] items-center justify-center rounded-md bg-[#1E1F22]">
          <Glyph size={26} strokeWidth={1.5} className="text-[#5F6268]">
            <circle cx="9" cy="9" r="2" />
            <path d="M3 18l6-6 4 4 3-3 5 5" />
          </Glyph>
        </span>
        <SelectionBox />
      </div>
    </div>
  );
}

/** The green selection box and its 4 corner handles around the button. */
function SelectionBox() {
  const handle = 'absolute size-1.5 rounded-full bg-white shadow-[0_0_0_1.5px_#3ECF8E]';
  return (
    <span className="cv-in cv-fade cv-s3 absolute top-[103px] left-[21px] h-[30px] w-[94px] shadow-[0_0_0_1.5px_#3ECF8E]">
      <span className={cn(handle, '-top-[3px] -left-[3px]')} />
      <span className={cn(handle, '-top-[3px] -right-[3px]')} />
      <span className={cn(handle, '-bottom-[3px] -left-[3px]')} />
      <span className={cn(handle, '-right-[3px] -bottom-[3px]')} />
    </span>
  );
}

function ToolButton({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-[30px] w-8 shrink-0 items-center justify-center',
        active ? 'rounded-lg bg-primary-fill' : 'text-foreground',
      )}
    >
      {children}
    </span>
  );
}

function Toolbar() {
  return (
    <div className="absolute top-[452px] left-[62px] flex items-center gap-0.5 rounded-xl bg-popover p-1 shadow-[0_0_0_0.5px_#393A3C,0_6px_16px_#00000073]">
      <ToolButton active>
        <svg width={13} height={13} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
          <path d="M5 3l14 8-6 1.5L9.5 19z" fill="#FFFFFF" />
        </svg>
      </ToolButton>
      <ToolButton>
        <Glyph size={13} strokeWidth={1.8}>
          <path d="M8 3v18M16 3v18M3 8h18M3 16h18" />
        </Glyph>
      </ToolButton>
      <ToolButton>
        <Glyph size={13} strokeWidth={1.8}>
          <rect x="4" y="4" width="16" height="16" rx="1" />
        </Glyph>
      </ToolButton>
      <ToolButton>
        <Glyph size={13} strokeWidth={1.8}>
          <path d="M12 3l6 10-6 8-6-8z" />
          <circle cx="12" cy="13" r="1.5" />
        </Glyph>
      </ToolButton>
      <ToolButton>
        <Glyph size={13} strokeWidth={1.8}>
          <path d="M5 5h14M12 5v15" />
        </Glyph>
      </ToolButton>
      <ToolButton>
        <Glyph size={13} strokeWidth={1.8}>
          <path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.3-3.6A8 8 0 0 1 4 12z" />
        </Glyph>
      </ToolButton>
      <span className="mx-1 h-[18px] w-[0.5px] shrink-0 bg-[#3A3B3D]" />
      <ToolButton>
        <Glyph size={13} strokeWidth={1.8}>
          <path d="M4 20l4-1 11-11-3-3L5 16z" />
        </Glyph>
      </ToolButton>
      <ToolButton>
        <Glyph size={13} strokeWidth={1.8}>
          <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
        </Glyph>
      </ToolButton>
    </div>
  );
}

function CanvasArea() {
  return (
    <div className="relative min-w-0 flex-1 overflow-clip bg-[#151618]">
      <HomeFrame />
      <Toolbar />
      <span className="absolute top-[456px] right-3 flex size-[26px] items-center justify-center rounded-full bg-popover text-[12px] leading-3.5 font-medium text-foreground shadow-[0_0_0_0.5px_#393A3C]">
        ?
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex h-6 flex-1 basis-0 items-center gap-1.5 rounded-[5px] bg-muted px-2 text-[11px] leading-3.5">
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      <span className="text-foreground">{value}</span>
    </span>
  );
}

function DesignPanel() {
  return (
    <div className="flex w-[200px] shrink-0 flex-col border-l-[0.5px] border-border">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b-[0.5px] border-border px-3 text-[11px] leading-4">
        <span className="font-semibold text-foreground">Design</span>
        <span className="text-muted-foreground">Prototype</span>
        <span className="ml-auto text-muted-foreground">100%</span>
      </div>
      <div className="cv-in cv-s3-panel flex flex-col">
        <div className="flex h-[38px] shrink-0 items-center border-b-[0.5px] border-border px-3 text-[12px] leading-4 font-semibold text-foreground">
          Button
        </div>
        {INSPECTOR.map((section) => (
          <div key={section.title} className="flex flex-col gap-2 border-b-[0.5px] border-border px-3 py-2.5">
            <span className="text-[11px] leading-3.5 font-semibold text-foreground">{section.title}</span>
            <div className="flex gap-1.5">
              {section.fields.map(([label, value]) => (
                <Field key={label + value} label={label} value={value} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-2 px-3 py-2.5">
          <span className="text-[11px] leading-3.5 font-semibold text-foreground">Fill</span>
          <span className="flex h-6 shrink-0 items-center gap-2 rounded-[5px] bg-muted px-2 text-[11px] leading-3.5">
            <span className="size-3 shrink-0 rounded-[3px] bg-[#0E6ABE]" />
            <span className="text-foreground">0E6ABE</span>
            <span className="ml-auto text-muted-foreground">100%</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// Scene ---------------------------------------------------------------------

export function CanvasScene({ step }: { step: TourStep }) {
  return (
    <div data-step={step} className="cv flex min-h-0 flex-1 flex-col text-[12px] leading-4">
      <TabBar />
      <CanvasHeader />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <LayersPanel />
        <CanvasArea />
        <DesignPanel />
        {/* The window is wider than the stage. This strip sits off stage. */}
        <div className="w-[52px] shrink-0 border-l-[0.5px] border-border" />
      </div>
    </div>
  );
}

