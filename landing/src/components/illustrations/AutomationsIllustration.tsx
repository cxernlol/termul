import { cn } from '@/lib/utils';
import type { IllustrationProps } from './types';
import './illustrations.css';

type Dot = readonly [cx: number, cy: number, r: number, fill: string];

const MUTED = '#8F9297';
const LIGHT = '#B9BCBF';
const SMALL = 0.2229;
const MEDIUM = 0.2972;

/** Dot pattern on the third block (the step in the middle). */
const STEP_DOTS: ReadonlyArray<Dot> = [
  [329.5, 208.8, MEDIUM, MUTED], [323, 212.8, SMALL, LIGHT], [315.5, 217.2, SMALL, LIGHT],
  [308.8, 221, SMALL, LIGHT], [302.2, 224.6, SMALL, LIGHT], [329.5, 217, MEDIUM, MUTED],
  [322.4, 221, SMALL, LIGHT], [315.3, 224.8, SMALL, LIGHT], [308.8, 228.7, SMALL, LIGHT],
  [336.6, 213.3, SMALL, LIGHT], [343.4, 217, SMALL, LIGHT], [350.2, 220.7, SMALL, LIGHT],
  [356.8, 224.3, SMALL, LIGHT], [336.6, 221, 0.4066, MUTED], [343.4, 224.8, SMALL, LIGHT],
  [350.2, 228.5, SMALL, LIGHT], [329.5, 224.6, MEDIUM, MUTED], [322.1, 229.3, SMALL, LIGHT],
  [315.3, 233.4, SMALL, LIGHT], [329.5, 233.2, MEDIUM, MUTED], [336.6, 229.3, SMALL, LIGHT],
  [336.2, 236.3, SMALL, LIGHT], [322.1, 236.6, SMALL, LIGHT], [329.5, 241.1, SMALL, LIGHT],
];

/** Dot pattern on the second block (the first step). */
const FIRST_STEP_DOTS: ReadonlyArray<Dot> = [
  [183.8, 274.5, MEDIUM, MUTED], [176.8, 278.1, SMALL, LIGHT], [170.1, 281.7, SMALL, LIGHT],
  [163.4, 286.2, SMALL, LIGHT], [191, 270.3, MEDIUM, MUTED], [198.3, 274.5, SMALL, LIGHT],
  [205.1, 278.1, SMALL, LIGHT], [211.8, 281.9, SMALL, LIGHT], [191, 278.1, MEDIUM, MUTED],
  [183.8, 281.9, SMALL, MUTED], [176.5, 286.2, SMALL, LIGHT], [169.7, 290.2, SMALL, LIGHT],
  [198.3, 281.9, SMALL, LIGHT], [205.1, 286.2, SMALL, LIGHT], [211.8, 290.2, SMALL, LIGHT],
  [191, 286.2, MEDIUM, MUTED], [183.6, 290.2, SMALL, LIGHT], [176.8, 293.8, SMALL, LIGHT],
  [198.4, 290.2, SMALL, LIGHT], [190.9, 293.8, MEDIUM, MUTED], [183.6, 297.7, SMALL, LIGHT],
  [198.4, 297.7, SMALL, LIGHT], [191, 302.5, SMALL, LIGHT],
];

/** Dot pattern on the last block (the step that gets the check). */
const LAST_STEP_DOTS: ReadonlyArray<Dot> = [
  [446.2, 157.1, SMALL, LIGHT], [439.4, 161, SMALL, LIGHT], [432.6, 164.7, SMALL, LIGHT],
  [425.9, 168.5, SMALL, LIGHT], [418.8, 172.5, SMALL, LIGHT], [453.4, 161, SMALL, LIGHT],
  [460.1, 164.7, SMALL, LIGHT], [467.1, 168.5, SMALL, LIGHT], [473.9, 173, MEDIUM, MUTED],
  [446.2, 168.5, MEDIUM, LIGHT], [438.9, 172.5, SMALL, LIGHT], [432, 176.5, SMALL, LIGHT],
  [425.9, 176.3, SMALL, LIGHT], [467.1, 176.5, SMALL, LIGHT], [460.1, 180.2, SMALL, LIGHT],
  [453.4, 184.2, SMALL, LIGHT], [446.2, 188.1, SMALL, LIGHT],
];

function Dots({ dots }: { dots: ReadonlyArray<Dot> }) {
  return dots.map(([cx, cy, r, fill]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={fill} />);
}

/**
 * Automations card illustration (Paper: "Illustration · Automations").
 * The viewBox is 512×512. Paper shows it in a 328×260 box (object-fit: contain),
 * with margins -30px top and -38px left and right.
 * A run moves from the clock (the trigger) through the steps. The last step gets its check.
 * The still frame (paused or reduced motion) is the Paper static node.
 */
export function AutomationsIllustration({ className, playing = false }: IllustrationProps) {
  return (
    <svg
      width="328"
      height="260"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-playing={playing ? 'true' : 'false'}
      className={cn('ill-root', className)}
    >
      {/* Clock block (the trigger) */}
      <path d="m69.18 305.7-44.48 25.09c-0.64 0.384-0.896 0.896-0.896 1.408v3.008c0 0.512 0.256 0.96 0.896 1.344l44.74 25.09c1.088 0.64 2.304 0.64 3.392 0l44.54-25.22c0.704-0.32 0.96-0.768 0.96-1.28v-3.2c0-0.512-0.256-0.96-0.96-1.344l-44.67-24.9c-1.088-0.576-2.432-0.576-3.52 0z" fill="none" stroke="#8F9297" strokeWidth="0.64" />
      <path d="m23.81 331.9 45.38 26.24c1.28 0.704 2.624 0.704 3.904 0l45.06-26.24" fill="none" stroke="#8F9297" strokeWidth="0.512" />
      <ellipse cx="70.81" cy="330.5" rx="19.07" ry="13.08" fill="none" stroke="#8F9297" strokeWidth="0.512" />
      <ellipse cx="70.81" cy="330.5" rx="2.058" ry="1.414" fill="none" stroke="#8F9297" strokeWidth="0.64" />
      <path d="m63.55 326.1 5.824 3.264" fill="none" stroke="#8F9297" strokeWidth="0.512" />
      <path d="m81.86 324.2-9.408 5.248" fill="none" stroke="#8F9297" strokeWidth="0.64" />

      {/* First step block */}
      <path d="m189.3 263-39.17 22.27c-0.64 0.384-0.896 0.832-0.896 1.28v3.008c0 0.448 0.256 0.896 0.896 1.28l38.85 21.63c1.088 0.64 2.368 0.64 3.456 0l39.49-22.34c0.64-0.32 0.896-0.704 0.896-1.152v-3.008c0-0.512-0.256-0.896-0.896-1.216l-39.42-21.76c-0.96-0.576-2.176-0.576-3.2 0z" fill="none" stroke="#8F9297" strokeWidth="0.64" />
      <path d="m149.2 286.5 39.81 22.72c1.152 0.64 2.496 0.64 3.648 0l39.94-22.85" fill="none" stroke="#8F9297" strokeWidth="0.512" />

      {/* Run dot: the outer group fades, the inner group moves along the path. */}
      <g className="ill-anim ill-auto-dot">
        <g className="ill-anim ill-auto-dot-move">
          <circle cx="261.3" cy="253.7" r="3.791" fill="none" stroke="#8F9297" strokeWidth="0.64" />
        </g>
      </g>

      {/* Dashed segments 1 to 3 */}
      <path className="ill-anim ill-auto-seg ill-auto-seg-1" d="m107.1 323.6 51.46-27.71" fill="none" stroke="#B9BCBF" strokeWidth="0.512" strokeDasharray="3.264 3.264" />
      <path className="ill-anim ill-auto-seg ill-auto-seg-2" d="m218.3 275.9 38.59-20.8" fill="none" stroke="#B9BCBF" strokeWidth="0.512" strokeDasharray="3.264 3.264" />
      <path className="ill-anim ill-auto-seg ill-auto-seg-3" d="m265.4 251.7 31.94-17.02" fill="none" stroke="#B9BCBF" strokeWidth="0.512" strokeDasharray="3.264 3.264" />

      {/* Middle step block */}
      <path d="m327.6 201.9-38.91 22.08c-0.64 0.32-0.832 0.704-0.832 1.152v3.456c0 0.448 0.256 0.832 0.832 1.152l38.72 21.44c1.152 0.64 2.496 0.64 3.584 0l38.66-21.7c0.576-0.32 0.832-0.704 0.832-1.152v-3.712c0-0.448-0.256-0.832-0.832-1.152l-38.53-21.57c-1.088-0.576-2.432-0.576-3.52 0z" fill="none" stroke="#8F9297" strokeWidth="0.64" />
      <path d="m288.1 225 39.55 22.91c1.152 0.64 2.496 0.64 3.648 0l39.1-22.78" fill="none" stroke="#8F9297" strokeWidth="0.512" />
      <Dots dots={STEP_DOTS} />
      <Dots dots={FIRST_STEP_DOTS} />

      {/* Dashed segment 4 */}
      <path className="ill-anim ill-auto-seg ill-auto-seg-4" d="m355.9 214.2 59.14-32.13" fill="none" stroke="#B9BCBF" strokeWidth="0.512" strokeDasharray="3.904 3.904" />

      {/* Last step block */}
      <path d="m445.1 149.6-39.17 22.53c-0.576 0.32-0.768 0.64-0.768 1.024v2.816c0 0.384 0.256 0.768 0.768 1.088l38.78 21.7c1.216 0.64 2.496 0.64 3.648 0l39.3-21.95c0.576-0.32 0.832-0.64 0.832-1.024v-3.072c0-0.384-0.256-0.768-0.832-1.088l-39.74-22.02c-0.832-0.384-1.92-0.384-2.816 0z" fill="none" stroke="#8F9297" strokeWidth="0.64" />
      <path d="m405.1 173.1 39.68 22.72c1.088 0.64 2.368 0.64 3.456 0l40.13-22.66" fill="none" stroke="#8F9297" strokeWidth="0.512" />
      <Dots dots={LAST_STEP_DOTS} />

      {/* Check on the last step */}
      <path className="ill-anim ill-auto-check" d="m437.4 172.7 7.936 5.44 10.43-11.46" fill="none" stroke="#8F9297" strokeWidth="0.64" />
    </svg>
  );
}
