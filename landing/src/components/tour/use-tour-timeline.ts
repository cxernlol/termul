import { useCallback, useEffect, useReducer, useRef } from 'react';

/** Keyframes per tab (Paper "Feature tour · Keyframes"). */
export const STEPS_PER_TAB = 4;
/** Time on each keyframe. One tab is about 9 s. */
export const STEP_MS = 2200;
export const TAB_MS = STEPS_PER_TAB * STEP_MS;

export type PauseReason = 'user' | 'hover' | 'focus' | 'offscreen' | 'hidden' | 'reduced-motion';

export type TourState = {
  tabCount: number;
  tab: number;
  step: number;
  /** Why auto-advance is stopped. Empty means it runs. */
  pausedBy: PauseReason[];
  /** Changes each time a tab starts, so the progress bar animation restarts. */
  runId: number;
};

export type TourAction =
  | { type: 'tick' }
  | { type: 'select'; tab: number }
  | { type: 'pause'; reason: PauseReason }
  | { type: 'resume'; reason: PauseReason }
  | { type: 'toggle-user-pause' };

export function initTourState(tabCount: number, tab = 0): TourState {
  return { tabCount, tab, step: 0, pausedBy: [], runId: 0 };
}

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'tick': {
      if (state.pausedBy.length > 0) return state;
      if (state.step < STEPS_PER_TAB - 1) return { ...state, step: state.step + 1 };
      return { ...state, tab: (state.tab + 1) % state.tabCount, step: 0, runId: state.runId + 1 };
    }
    case 'select':
      if (action.tab === state.tab || action.tab < 0 || action.tab >= state.tabCount) return state;
      return { ...state, tab: action.tab, step: 0, runId: state.runId + 1 };
    case 'pause':
      if (state.pausedBy.includes(action.reason)) return state;
      return { ...state, pausedBy: [...state.pausedBy, action.reason] };
    case 'resume':
      if (!state.pausedBy.includes(action.reason)) return state;
      return { ...state, pausedBy: state.pausedBy.filter((reason) => reason !== action.reason) };
    case 'toggle-user-pause':
      return state.pausedBy.includes('user')
        ? { ...state, pausedBy: state.pausedBy.filter((reason) => reason !== 'user') }
        : { ...state, pausedBy: [...state.pausedBy, 'user'] };
    default:
      return state;
  }
}

/** The visible step: the final still while reduced motion is on. */
export function visibleStep(state: TourState): number {
  return state.pausedBy.includes('reduced-motion') ? STEPS_PER_TAB - 1 : state.step;
}

export function useTourTimeline(tabCount: number) {
  const [state, dispatch] = useReducer(tourReducer, tabCount, (count) => initTourState(count));
  const running = state.pausedBy.length === 0;

  // Time left on the current keyframe. A pause keeps it, so the step timer
  // stays in line with the progress bar (which pauses in CSS).
  const remaining = useRef(STEP_MS);
  const stepKey = useRef('0:0');

  useEffect(() => {
    const key = `${state.tab}:${state.step}`;
    if (stepKey.current !== key) {
      stepKey.current = key;
      remaining.current = STEP_MS;
    }
    if (!running) return;
    const startedAt = performance.now();
    const timer = window.setTimeout(() => dispatch({ type: 'tick' }), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt));
    };
  }, [running, state.tab, state.step]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => dispatch({ type: query.matches ? 'pause' : 'resume', reason: 'reduced-motion' });
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const apply = () => dispatch({ type: document.hidden ? 'pause' : 'resume', reason: 'hidden' });
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, []);

  const pause = useCallback((reason: PauseReason) => dispatch({ type: 'pause', reason }), []);
  const resume = useCallback((reason: PauseReason) => dispatch({ type: 'resume', reason }), []);
  const select = useCallback((tab: number) => dispatch({ type: 'select', tab }), []);
  const toggleUserPause = useCallback(() => dispatch({ type: 'toggle-user-pause' }), []);

  return { state, running, step: visibleStep(state), pause, resume, select, toggleUserPause };
}
