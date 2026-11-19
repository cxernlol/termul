import type { ComponentType, ReactNode } from 'react';

export type TourStep = 0 | 1 | 2 | 3;

export type TourBackground = 'pastel' | 'orange' | 'green' | 'dusk';

/**
 * The contract every feature tour tab follows.
 *
 * `Scene` draws the app window content for one tab at the design size
 * (window 900×640, see AppWindow). It receives the current keyframe and must
 * render every part for every step, switching parts with `data-step` driven
 * CSS transitions (transform + opacity, 200–300 ms, ease-out
 * cubic-bezier(0.23,1,0.32,1); moves on screen 400–500 ms ease-in-out).
 * No JavaScript animation. Copy and UI come from the Paper frames
 * "Feature tour · All states (full stage)".
 */
export type TourTab = {
  id: string;
  label: string;
  icon: ReactNode;
  title: string;
  description: string;
  /** Four step captions, one per keyframe. */
  steps: [string, string, string, string];
  /** Optional row under the steps (for example agent logos). */
  footer?: ReactNode;
  background: TourBackground;
  /**
   * 'window' (default): the host draws the 900×640 app window at 40,40 and the
   * Scene fills it. 'none': the host draws no window; the Scene covers the
   * whole 888×640 stage and draws its own window or device.
   */
  frame?: 'window' | 'none';
  Scene: ComponentType<{ step: TourStep }>;
};
