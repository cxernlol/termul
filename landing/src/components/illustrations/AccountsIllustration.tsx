import { cn } from '@/lib/utils';
import type { IllustrationProps } from './types';
import './illustrations.css';

type Dot = readonly [cx: number, cy: number, r: number, fill: string];

const GRAY = '#767676';

/** Speaker dots on the left disc. */
const LEFT_DOTS: ReadonlyArray<Dot> = [
  [74.08, 262.5, 1.136, GRAY], [88.15, 262.5, 1.136, GRAY], [102.3, 262.5, 1.136, GRAY], [116.2, 262.5, 1.136, GRAY],
  [74.08, 271.8, 1.046, GRAY], [88.15, 271.8, 1.136, GRAY], [102.3, 271.8, 1.136, GRAY], [116.1, 271.8, 1.095, GRAY],
  [74.08, 280.7, 1.136, GRAY], [88.15, 280.7, 1.136, GRAY], [102.3, 280.7, 1.136, GRAY], [116.2, 280.7, 1.046, GRAY],
];

/** Speaker dots on the right disc. */
const RIGHT_DOTS: ReadonlyArray<Dot> = [
  [395.7, 262.5, 1.136, GRAY], [409.5, 262.5, 1.184, GRAY], [423.5, 262.5, 1.136, GRAY], [438.4, 262.5, 1.184, GRAY],
  [395.7, 271.8, 1.046, '#8F8F8F'], [409.5, 271.8, 1.136, GRAY], [423.5, 271.8, 1.136, GRAY], [438.4, 271.8, 1.136, GRAY],
  [395.7, 280.8, 1.075, '#8F8F8F'], [409.5, 280.7, 1.136, GRAY], [423.5, 280.7, 1.136, GRAY], [438.4, 280.8, 1.136, GRAY],
];

/** Speaker dots on the middle disc. */
const MIDDLE_DOTS: ReadonlyArray<Dot> = [
  [235.2, 201.4, 1.164, GRAY], [249, 201.4, 1.184, GRAY], [263, 201.4, 1.136, GRAY], [277, 201.4, 1.136, GRAY],
  [235.2, 210.2, 1.112, GRAY], [249, 210.2, 1.112, GRAY], [263, 210.2, 1.136, GRAY], [276.9, 210.2, 1.136, GRAY],
  [235.2, 219.9, 1.164, GRAY], [249, 219.9, 1.184, GRAY], [263.1, 219.9, 1.164, GRAY], [277, 219.9, 1.164, '#878787'],
];

function Dots({ dots }: { dots: ReadonlyArray<Dot> }) {
  return dots.map(([cx, cy, r, fill]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={fill} />);
}

/**
 * Many accounts card illustration (Paper: "Illustration · Accounts").
 * The viewBox is 512×512. Paper shows it in a 328×260 box (object-fit: contain),
 * with margins -30px top and -38px left and right.
 * One account reaches its limit and Troupe moves the chat to the next one.
 * The raised disc is the account in use. The still frame shows the middle disc in use.
 */
export function AccountsIllustration({ className, playing = false }: IllustrationProps) {
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
      {/* Left disc: the first account */}
      <g className="ill-anim ill-accounts-left">
        <ellipse cx="95" cy="273.2" rx="66.26" ry="28.76" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <path d="m28.74 273.2v30.53c0 16.38 29.7 29.63 66.24 29.63 36.61 0 66.37-13.76 66.37-29.63v-30.53" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <rect x="90.48" y="304.8" width="9.025" height="26" rx="4.278" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <Dots dots={LEFT_DOTS} />
        <path d="m90.75 314.4c1.984-0.384 4.864-0.384 7.552 0" fill="none" stroke="#9A9A9A" strokeWidth="0.5368" />
        <path d="m91.58 320.1c1.92-0.256 4.928-0.256 7.04 0" fill="none" stroke="#9A9A9A" strokeWidth="0.4278" />
        <path d="m91.58 325.2c1.92-0.256 4.928-0.256 7.04 0" fill="none" stroke="#9A9A9A" strokeWidth="0.4278" />
      </g>

      {/* Right disc: a spare account. It does not move. */}
      <g>
        <ellipse cx="416.4" cy="273.2" rx="66.04" ry="28.89" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <path d="m350.5 273.2v30.53c0 16.83 30.85 29.63 65.86 29.63 35.07 0 66.88-13.5 66.88-29.63v-30.53" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <rect x="412.4" y="304.8" width="8.714" height="26" rx="4.278" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <Dots dots={RIGHT_DOTS} />
        <path d="m413.3 320.7c2.176-0.448 5.312-0.448 7.488 0" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <path d="m412.8 325.2h8.128" fill="none" stroke="#767676" strokeWidth="0.5368" />
      </g>

      {/* Middle disc: the next account. It is raised (in use) in the still frame. */}
      <g className="ill-anim ill-accounts-middle">
        <ellipse cx="256" cy="211.4" rx="66.38" ry="28.38" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <path d="m189.4 211.4v31.62c0 16.32 30.78 29.57 66.5 29.57 35.9 0 66.37-13.31 66.37-29.57v-31.62" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <rect x="251.4" y="244.4" width="9.102" height="25.3" rx="4.278" fill="none" stroke="#767676" strokeWidth="0.7157" />
        <Dots dots={MIDDLE_DOTS} />
        <path d="m252.2 254.8h7.744" fill="none" stroke="#767676" strokeWidth="0.4278" />
        <path d="m252.2 259.5h7.744" fill="none" stroke="#767676" strokeWidth="0.4278" />
      </g>

      {/* Switch arrow: pathLength 1 lets it draw with stroke-dashoffset. */}
      <g className="ill-anim ill-accounts-arrow">
        <path
          className="ill-anim ill-accounts-arrow-shaft"
          d="m95.81 244.5c24.32-40.58 61.76-65.54 92.8-66.43 8.96-0.256 16.9 1.792 20.99 5.12"
          fill="none"
          stroke="#767676"
          strokeWidth="0.7555"
          pathLength={1}
          strokeDasharray="1"
        />
        <path
          className="ill-anim ill-accounts-arrow-head"
          d="m208.6 179.7 1.664 4.416-4.928 1.024"
          fill="none"
          stroke="#767676"
          strokeWidth="0.7555"
          pathLength={1}
          strokeDasharray="1"
        />
      </g>
    </svg>
  );
}
