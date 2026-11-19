import { describe, expect, test } from 'bun:test';

import {
  STEPS_PER_TAB,
  initTourState,
  tourReducer,
  visibleStep,
  type TourState,
} from '../src/components/tour/use-tour-timeline';

function tick(state: TourState, times = 1): TourState {
  let next = state;
  for (let i = 0; i < times; i += 1) next = tourReducer(next, { type: 'tick' });
  return next;
}

describe('tourReducer', () => {
  test('ticks through the steps of a tab, then starts the next tab', () => {
    const start = initTourState(5);
    expect(tick(start).step).toBe(1);

    const lastStep = tick(start, STEPS_PER_TAB - 1);
    expect(lastStep).toMatchObject({ tab: 0, step: STEPS_PER_TAB - 1, runId: 0 });

    const nextTab = tick(lastStep);
    expect(nextTab).toMatchObject({ tab: 1, step: 0, runId: 1 });
  });

  test('wraps from the last tab to the first', () => {
    const last = initTourState(3, 2);
    expect(tick(last, STEPS_PER_TAB)).toMatchObject({ tab: 0, step: 0 });
  });

  test('does not tick while paused, for any reason', () => {
    const paused = tourReducer(initTourState(5), { type: 'pause', reason: 'hover' });
    expect(tick(paused, 3)).toBe(paused);
  });

  test('keeps a list of pause reasons and runs only when all are gone', () => {
    let state = initTourState(5);
    state = tourReducer(state, { type: 'pause', reason: 'hover' });
    state = tourReducer(state, { type: 'pause', reason: 'offscreen' });
    state = tourReducer(state, { type: 'pause', reason: 'hover' });
    expect(state.pausedBy).toEqual(['hover', 'offscreen']);

    state = tourReducer(state, { type: 'resume', reason: 'hover' });
    expect(tick(state).step).toBe(0);

    state = tourReducer(state, { type: 'resume', reason: 'offscreen' });
    expect(tick(state).step).toBe(1);
  });

  test('select goes to step 0 of the chosen tab and restarts the progress run', () => {
    const state = tick(initTourState(5), 2);
    const selected = tourReducer(state, { type: 'select', tab: 3 });
    expect(selected).toMatchObject({ tab: 3, step: 0, runId: 1 });
  });

  test('select ignores the current tab and out-of-range tabs', () => {
    const state = tick(initTourState(5), 2);
    expect(tourReducer(state, { type: 'select', tab: 0 })).toBe(state);
    expect(tourReducer(state, { type: 'select', tab: -1 })).toBe(state);
    expect(tourReducer(state, { type: 'select', tab: 5 })).toBe(state);
  });

  test('the Pause button toggles a user pause', () => {
    const paused = tourReducer(initTourState(5), { type: 'toggle-user-pause' });
    expect(paused.pausedBy).toEqual(['user']);
    expect(tourReducer(paused, { type: 'toggle-user-pause' }).pausedBy).toEqual([]);
  });

  test('reduced motion shows the final keyframe', () => {
    const state = tourReducer(initTourState(5), { type: 'pause', reason: 'reduced-motion' });
    expect(visibleStep(state)).toBe(STEPS_PER_TAB - 1);
    expect(visibleStep(initTourState(5))).toBe(0);
  });
});
