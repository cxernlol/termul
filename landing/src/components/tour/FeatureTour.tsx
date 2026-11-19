import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs';

import { Stage } from '@/components/app-ui/Window';
import { Container } from '@/components/sections/Container';
import { cn } from '@/lib/utils';
import { PauseGlyph, PlayGlyph } from './icons';
import type { TourStep, TourTab } from './types';
import { TAB_MS, useTourTimeline } from './use-tour-timeline';
import './tour.css';

/**
 * "Watch the troupe do the work": real Troupe screens that play on their own.
 * Auto-advance stops on hover, on keyboard focus inside, off screen, in a
 * hidden browser tab, with reduced motion, and with the Pause button.
 */
export function FeatureTour({ tabs }: { tabs: TourTab[] }) {
  const { state, running, step, pause, resume, select, toggleUserPause } = useTourTimeline(tabs.length);
  const rootRef = useRef<HTMLElement>(null);
  // Motion on tab change (panel cross-fade, pill slide) is off for the first
  // render and for a tab reached with the arrow keys. Each tab start has its
  // own runId; we keep the runId that an arrow key started, so the next
  // automatic tab (a new runId) animates again without an extra effect.
  const [ready, setReady] = useState(false);
  const [keyboardRun, setKeyboardRun] = useState(-1);
  const instant = !ready || keyboardRun === state.runId;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Pause when less than a quarter of the tour is on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => (entry?.isIntersecting ? resume('offscreen') : pause('offscreen')),
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [pause, resume]);

  const onFocus = (event: FocusEvent) => {
    if ((event.target as Element).matches(':focus-visible')) pause('focus');
  };
  const onBlur = (event: FocusEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resume('focus');
  };

  const userPaused = state.pausedBy.includes('user');
  const active = tabs[state.tab];

  return (
    <section
      ref={rootRef}
      id="tour"
      aria-labelledby="tour-title"
      className="scroll-mt-6 pt-[72px] pb-10 md:pt-36 md:pb-0"
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <Container className="flex flex-col gap-6 md:gap-8">
        <header className="flex flex-col gap-2.5 md:items-center md:gap-3 md:pb-4 md:text-center">
          <h2
            id="tour-title"
            className="text-[28px] leading-[34px] font-medium tracking-[-0.02em] text-foreground md:text-[44px] md:leading-[52px] md:tracking-[-0.03em]"
          >
            <span className="md:text-muted-foreground">Watch the troupe</span> do the work
          </h2>
          <p className="text-base leading-6 text-muted-foreground md:max-w-[560px] md:text-[17px] md:leading-[26px]">
            Real Troupe screens, playing on their own. Pick a tab to jump in.
          </p>
        </header>

        <Tabs
          value={active?.id}
          onValueChange={(value, details) => {
            const index = tabs.findIndex((tab) => tab.id === value);
            // select() starts run state.runId + 1 for a new tab.
            setKeyboardRun(details.reason === 'list-navigation' ? state.runId + 1 : -1);
            select(index);
          }}
          className="flex flex-col gap-6 md:gap-8"
        >
          <div className="-mx-6 flex items-center justify-between gap-4 border-b-[0.5px] border-border md:mx-0 md:border-b-0">
            <div className="scrollbar-none overflow-x-auto px-6 md:px-0">
              <TabsList
                aria-label="Troupe features"
                className="relative flex w-max gap-1 rounded-xl border-[0.5px] border-hairline bg-card p-1 shadow-card"
              >
                {/* The selected-tab pill slides to the active tab (UI SDK writes --active-tab-*). */}
                <TabsIndicator
                  data-instant={instant}
                  className="tour-indicator absolute top-0 left-0 rounded-lg border-[0.5px] border-[#3C3D3F] bg-muted shadow-card"
                />
                {tabs.map((tab, index) => {
                  const selected = index === state.tab;
                  return (
                    <TabsTab
                      key={tab.id}
                      value={tab.id}
                      className={cn(
                        'relative z-10 flex h-11 shrink-0 cursor-pointer items-center gap-2 overflow-clip rounded-lg pr-3.5 pl-3 text-[15px] leading-5 font-medium tracking-[-0.01em] outline-hidden focus-ring select-none transition-colors duration-150 md:h-9 md:text-[13px]',
                        selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {tab.icon}
                      {tab.label}
                      {selected ? (
                        <span
                          key={state.runId}
                          aria-hidden="true"
                          data-paused={!running}
                          className="tour-progress absolute bottom-0 left-0 h-0.5 w-full bg-primary"
                          style={{ animationDuration: `${TAB_MS}ms` }}
                        />
                      ) : null}
                    </TabsTab>
                  );
                })}
              </TabsList>
            </div>
            <button
              type="button"
              onClick={toggleUserPause}
              aria-pressed={userPaused}
              className="press mr-6 hidden h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border-[0.5px] border-chip-edge bg-secondary px-3 text-[13px] leading-5 font-medium text-foreground shadow-card hover:bg-muted md:mr-0 md:flex"
            >
              {userPaused ? <PlayGlyph /> : <PauseGlyph />}
              {userPaused ? 'Play' : 'Pause'}
            </button>
          </div>

          {/* Panels share one grid cell, so the leaving and the coming panel overlap while they cross-fade. */}
          <div
            className="tour-panels grid"
            data-instant={instant}
            onPointerEnter={(event) => event.pointerType === 'mouse' && pause('hover')}
            onPointerLeave={(event) => event.pointerType === 'mouse' && resume('hover')}
          >
            {tabs.map((tab, index) => (
              <TabsPanel
                key={tab.id}
                value={tab.id}
                className="tour-panel col-start-1 row-start-1 flex flex-col gap-6 rounded-xl outline-hidden focus-ring xl:flex-row xl:gap-10"
              >
                <TourCopy tab={tab} step={index === state.tab ? step : 0} />
                {index === state.tab ? <TourStage tab={tab} step={step as TourStep} running={running} /> : null}
              </TabsPanel>
            ))}
          </div>
        </Tabs>
      </Container>
    </section>
  );
}

function TourCopy({ tab, step }: { tab: TourTab; step: number }) {
  return (
    <div className="flex flex-col gap-6 md:gap-7 xl:w-[320px] xl:shrink-0 xl:pt-2">
      <div className="flex flex-col gap-3">
        <h3 className="text-[26px] leading-8 font-medium tracking-[-0.02em] text-foreground">{tab.title}</h3>
        <p className="text-[15px] leading-[23px] text-muted-foreground">{tab.description}</p>
      </div>
      <ol className="flex flex-col border-l-[0.5px] border-hairline">
        {tab.steps.map((caption, index) => {
          const current = index === step;
          return (
            <li key={caption} aria-current={current ? 'step' : undefined} className="relative flex gap-3 py-2.5 pl-4">
              <span
                className={cn(
                  'w-5 shrink-0 font-mono text-sm leading-[22px] md:text-xs md:leading-5',
                  current ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span
                className={cn(
                  'text-[15px] leading-[22px] transition-colors duration-200 md:text-sm md:leading-5',
                  current ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {caption}
              </span>
              {current ? (
                <span aria-hidden="true" className="absolute top-[9px] -left-px h-6 w-0.5 rounded-[1px] bg-primary md:top-2" />
              ) : null}
            </li>
          );
        })}
      </ol>
      {tab.footer ? <div className="flex items-center gap-2 text-sm leading-5 text-muted-foreground md:text-[13px]">{tab.footer}</div> : null}
    </div>
  );
}

/**
 * The photo stage (888×640) with the app window (900×640 at 40,40).
 * Phone: the whole stage, scaled down to the screen width (`.shot-fit`, index.css).
 */
function TourStage({ tab, step, running }: { tab: TourTab; step: TourStep; running: boolean }) {
  const { Scene } = tab;
  return (
    <div
      aria-hidden="true"
      // Loops in the scenes (spinners, shine) stop while the tour is paused or off screen.
      data-running={running}
      className="tour-stage @container relative aspect-[888/640] overflow-clip rounded-xl border-[0.5px] border-hairline md:aspect-auto md:h-[640px] md:rounded-none md:border-0 xl:w-[888px] xl:shrink-0"
    >
      <Stage
        background={tab.background}
        className="shot-fit absolute top-0 left-0 h-[640px] w-[888px] [--shot-w:888px] md:static md:w-full md:rounded-2xl md:border-[0.5px] md:border-hairline md:shadow-[0_1px_2px_#00000080,0_3px_4px_-2px_#00000080]"
      >
        {tab.frame === 'none' ? (
          <div data-step={step} className="absolute inset-0">
            <Scene step={step} />
          </div>
        ) : (
          <div
            data-step={step}
            className="absolute top-10 left-10 flex h-[640px] w-[900px] flex-col overflow-clip rounded-[10px] border border-hairline bg-background shadow-[0_24px_48px_-12px_#00000099]"
          >
            <Scene step={step} />
          </div>
        )}
      </Stage>
    </div>
  );
}
