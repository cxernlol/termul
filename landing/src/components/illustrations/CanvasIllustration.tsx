import { cn } from '@/lib/utils';
import type { IllustrationProps } from './types';
import './illustrations.css';

/** Board grid dots, in board space (before the iso matrix). */
const BOARD_DOTS: ReadonlyArray<readonly [number, number]> = [
  [35, 21], [49, 21], [63, 21], [77, 21], [91, 21], [105, 21], [119, 21], [133, 21],
  [147, 21], [161, 21], [175, 21], [189, 21], [203, 21], [217, 21], [231, 21], [247, 21],
  [247, 35], [247, 49], [247, 63], [247, 77], [247, 91], [247, 105], [247, 119], [247, 133],
  [247, 147], [247, 161], [247, 175], [247, 189], [247, 203],
  [231, 203], [217, 203], [203, 203], [189, 203], [175, 203],
  [33, 35], [33, 63], [33, 91], [33, 119], [33, 147], [33, 175],
];

/** Isometric matrix. All board parts use it. */
const ISO = 'matrix(0.866 0.5 -0.866 0.5 210 90)';

/**
 * Canvas card illustration (Paper: "Illustration · Canvas", 252×200).
 * The agent drags an image in, types the heading, then marks it with the pen.
 * The still frame (paused or reduced motion) is the composed final state.
 */
export function CanvasIllustration({ className, playing = false }: IllustrationProps) {
  return (
    <svg
      width="252"
      height="200"
      viewBox="37 65 392 311"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-playing={playing ? 'true' : 'false'}
      className={cn('ill-root', className)}
    >
      {/* Board */}
      <g>
        <g transform={ISO}>
          <rect x="25" y="12" width="230" height="202" fill="none" stroke="#8F9297" strokeWidth="0.75" />
          <g opacity="0.35">
            {BOARD_DOTS.map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.7" fill="#9EA2A7" />
            ))}
          </g>
        </g>
        <path d="M46.3 209.5V219.5L245.5 334.5L420.4 233.5V223.5M245.5 324.5V334.5" fill="none" stroke="#8F9297" strokeWidth="0.75" />
      </g>

      {/* Website frame */}
      <g>
        <g transform={ISO}>
          <path d="M40 24H72" fill="none" stroke="#75787B" strokeWidth="0.7" />
          <rect x="40" y="30" width="200" height="150" fill="none" stroke="#8F9297" strokeWidth="0.75" />
          <path d="M40 44H240" fill="none" stroke="#75787B" strokeWidth="0.65" />
          <rect x="48" y="34" width="14" height="6" rx="1.5" fill="none" stroke="#9EA2A7" strokeWidth="0.65" />
          <path d="M150 37H162M168 37H180M186 37H198" fill="none" stroke="#75787B" strokeWidth="0.65" />
          <rect x="206" y="33.5" width="26" height="8" rx="2" fill="none" stroke="#9EA2A7" strokeWidth="0.65" />
          <path d="M52 84H125M52 90H110" fill="none" stroke="#75787B" strokeWidth="0.65" />
          <rect x="52" y="98" width="40" height="11" rx="2.5" fill="none" stroke="#9EA2A7" strokeWidth="0.65" />
          <path d="M60 103.5H84" fill="none" stroke="#9EA2A7" strokeWidth="0.65" />
          <rect x="52" y="128" width="52" height="40" rx="3" fill="none" stroke="#75787B" strokeWidth="0.65" />
          <rect x="112" y="128" width="52" height="40" rx="3" fill="none" stroke="#75787B" strokeWidth="0.65" />
          <rect x="172" y="128" width="56" height="40" rx="3" fill="none" stroke="#75787B" strokeWidth="0.65" />
          <path d="M58 156H90M58 161H82M118 156H150M118 161H142M178 156H214M178 161H204" fill="none" stroke="#75787B" strokeWidth="0.65" />
        </g>
      </g>

      {/* Drop target: hidden in the still frame. It shows while the image is lifted. */}
      <g className="ill-anim ill-canvas-drag-hint" opacity="0">
        <g transform={ISO}>
          <rect x="140" y="60" width="88" height="58" rx="2" fill="none" stroke="#9C9EA1" strokeWidth="0.7" strokeLinecap="round" strokeDasharray="4 4" />
        </g>
      </g>

      {/* Lift guides: hidden in the still frame. They show while the image is lifted. */}
      <g className="ill-anim ill-canvas-drag-hint" opacity="0">
        <path d="M279.3 190V162M355.5 234V206M305.3 263V235M229.2 219V191" fill="none" stroke="#9C9EA1" strokeWidth="0.7" strokeLinecap="round" strokeDasharray="3 4" />
      </g>

      {/* Heading: two lines. Each line grows from the left when the agent types. */}
      <g className="ill-anim ill-canvas-heading">
        <g transform={ISO}>
          <g className="ill-anim ill-canvas-type ill-canvas-type-1">
            <path d="M52 62H122" fill="none" stroke="#B5B8BC" strokeWidth="0.85" strokeLinecap="round" />
          </g>
          <g className="ill-anim ill-canvas-type ill-canvas-type-2">
            <path d="M52 70H100" fill="none" stroke="#B5B8BC" strokeWidth="0.85" strokeLinecap="round" />
          </g>
        </g>
      </g>

      {/* Caret: hidden in the still frame. It follows the typed text. */}
      <g>
        <g transform={ISO}>
          <g className="ill-anim ill-canvas-caret" opacity="0">
            <g className="ill-anim ill-canvas-caret-move">
              <path d="M100 57V67" fill="none" stroke="#C9CCD0" strokeWidth="0.85" strokeLinecap="round" />
            </g>
          </g>
        </g>
      </g>

      {/* Image block: the outer group fades, the inner group lifts and drops. */}
      <g className="ill-anim ill-canvas-image">
        <g className="ill-anim ill-canvas-image-lift">
          <g transform={ISO}>
            <rect x="140" y="60" width="88" height="58" rx="2" fill="none" stroke="#9EA2A7" strokeWidth="0.75" />
            <circle cx="160" cy="76" r="5" fill="none" stroke="#9EA2A7" strokeWidth="0.65" />
            <path d="M146 112L170 88L186 102L198 92L222 112" fill="none" stroke="#9EA2A7" strokeWidth="0.65" />
          </g>
        </g>
      </g>

      {/* Selection box and size pill */}
      <g className="ill-anim ill-canvas-selection">
        <g transform={ISO}>
          <rect x="137" y="57" width="94" height="64" fill="none" stroke="#B5B8BC" strokeWidth="0.7" />
          <rect x="135" y="55" width="4" height="4" fill="none" stroke="#B5B8BC" strokeWidth="0.7" />
          <rect x="229" y="55" width="4" height="4" fill="none" stroke="#B5B8BC" strokeWidth="0.7" />
          <rect x="135" y="119" width="4" height="4" fill="none" stroke="#B5B8BC" strokeWidth="0.7" />
          <rect x="229" y="119" width="4" height="4" fill="none" stroke="#B5B8BC" strokeWidth="0.7" />
          <rect x="166" y="125" width="36" height="8" rx="4" fill="none" stroke="#8F9297" strokeWidth="0.65" />
          <path d="M173 129H195" fill="none" stroke="#8F9297" strokeWidth="0.65" strokeDasharray="2 2" />
        </g>
      </g>

      {/* Scribble: pathLength 1 lets the pen draw it with stroke-dashoffset. */}
      <g className="ill-anim ill-canvas-scribble">
        <g transform={ISO}>
          <path
            className="ill-anim ill-canvas-scribble-path"
            d="M49 77C64 81 84 74 100 78S125 80 132 74"
            fill="none"
            stroke="#B5B8BC"
            strokeWidth="0.85"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
          />
        </g>
      </g>

      {/* Toolbar: one outlined tool shows the active step. The pen is active in the still frame. */}
      <g>
        <g transform={ISO}>
          <rect x="70" y="190" width="98" height="18" rx="5" fill="none" stroke="#8F9297" strokeWidth="0.75" />
          <rect className="ill-anim ill-canvas-tool-move" x="74" y="192" width="14" height="14" rx="3" fill="none" stroke="#B5B8BC" strokeWidth="0.7" opacity="0" />
          <rect className="ill-anim ill-canvas-tool-pen" x="128" y="192" width="14" height="14" rx="3" fill="none" stroke="#B5B8BC" strokeWidth="0.7" />
          <rect className="ill-anim ill-canvas-tool-text" x="146" y="192" width="14" height="14" rx="3" fill="none" stroke="#B5B8BC" strokeWidth="0.7" opacity="0" />
          <path d="M78 195V204L80.5 201.5L82.5 205.5L84 204.8L82 200.8L85.5 200.5Z" fill="none" stroke="#9EA2A7" strokeWidth="0.6" strokeLinejoin="round" />
          <path d="M96 195V205M101 195V205M93.5 197.5H103.5M93.5 202.5H103.5" fill="none" stroke="#9EA2A7" strokeWidth="0.6" />
          <rect x="111" y="195" width="10" height="10" rx="1" fill="none" stroke="#9EA2A7" strokeWidth="0.6" />
          <path d="M131 205L135 195L139 205Q135 203 131 205ZM135 195V200" fill="none" stroke="#9EA2A7" strokeWidth="0.6" strokeLinejoin="round" />
          <path d="M148.5 195.5H157.5M153 195.5V205" fill="none" stroke="#9EA2A7" strokeWidth="0.6" />
        </g>
      </g>

      {/* Cursor */}
      <g className="ill-anim ill-canvas-cursor">
        <g transform="translate(257 193)">
          <path d="M0 0V18L5 13.6L8.7 21.5L11.7 20.1L8.1 12.4L14.5 12Z" fill="none" stroke="#B5B8BC" strokeWidth="0.75" strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
}
