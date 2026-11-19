import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return { width: size, height: size, 'aria-hidden': true, focusable: false, ...props };
}

/** Filled Apple logo (Simple Icons). */
export function AppleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(props)}>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** Filled GitHub logo (Simple Icons). */
export function GitHubIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(props)}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function WindowsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...base(props)}>
      <path d="M0 3.449 9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

export function LinuxIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...base(props)}>
      <path d="M12 3c-2.2 0-3.5 1.9-3.5 4.4 0 1.7-.6 3-1.7 4.5C5.4 13.7 4.5 15.6 5 17.6c.4 1.6 2 2.4 3.3 2.9.9.4 1.6 1 3.7 1s2.8-.6 3.7-1c1.3-.5 2.9-1.3 3.3-2.9.5-2-.4-3.9-1.8-5.7-1.1-1.5-1.7-2.8-1.7-4.5C15.5 4.9 14.2 3 12 3Z" />
      <path d="M10.2 8.2h.01M13.8 8.2h.01M10.5 10.8c.9.6 2.1.6 3 0" />
    </svg>
  );
}

export function ChevronIcon({ direction = 'down', ...props }: IconProps & { direction?: 'up' | 'down' | 'right' }) {
  const d = direction === 'up' ? 'M6 15l6-6 6 6' : direction === 'right' ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6';
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" {...base({ size: 14, ...props })}>
      <path d={d} />
    </svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" {...base(props)}>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...base(props)}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" {...base(props)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/*
 * Three lines that morph into an X while the trigger around it has
 * aria-expanded="true". Each outer line turns 45° about its own middle and
 * moves to the centre; the middle line shrinks to the centre point. CSS only,
 * so it follows the menu state with no React state. Translate and rotate
 * lengths are in the 14×14 viewBox units.
 */
const MORPH_LINE =
  'transition-[translate,rotate,scale,opacity] duration-400 ease-[cubic-bezier(0.19,1,0.22,1)] motion-reduce:transition-none';

export function MenuIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" {...base({ size: 20, ...props })}>
      <line
        x1={2}
        y1={3.5}
        x2={12}
        y2={3.5}
        className={`${MORPH_LINE} origin-[7px_3.5px] in-aria-expanded:translate-y-[3.5px] in-aria-expanded:rotate-45`}
      />
      <line
        x1={2}
        y1={7}
        x2={12}
        y2={7}
        className={`${MORPH_LINE} origin-[7px_7px] in-aria-expanded:scale-x-0 in-aria-expanded:opacity-0`}
      />
      <line
        x1={2}
        y1={10.5}
        x2={12}
        y2={10.5}
        className={`${MORPH_LINE} origin-[7px_10.5px] in-aria-expanded:-translate-y-[3.5px] in-aria-expanded:-rotate-45`}
      />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" {...base({ size: 14, ...props })}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...base({ size: 12, ...props })}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

/** The Troupe mark (from the app logo). */
export function TroupeMark(props: IconProps) {
  return (
    <svg viewBox="0 0 569 507" fillRule="evenodd" clipRule="evenodd" fill="currentColor" {...base({ size: 20, ...props })}>
      <g transform="matrix(1,0,0,1,-446.04,-826.589)">
        <g transform="matrix(2.925,0,0,2.925,37.282,448.302)">
          <g transform="matrix(1,0,0,1,-26.279,0)">
            <path d="M272.622,302.62L251.873,302.62C254.474,302.62 256.699,300.753 257.148,298.192L288.639,157.389L248.668,157.389L216.975,296.321C216.918,296.642 216.89,296.96 216.89,297.273C216.89,296.96 216.918,296.642 216.975,296.321L248.668,157.389L354.887,157.389C358.216,157.389 360.739,160.394 360.163,163.673L353.504,201.53C353.053,204.091 350.829,205.959 348.228,205.959L300.845,205.959L277.898,298.192C277.448,300.753 275.223,302.62 272.622,302.62Z" />
          </g>
          <path d="M146.496,133.765L139.837,171.622C139.261,174.901 141.784,177.907 145.113,177.907L190.062,177.907L167.442,268.284C166.865,271.563 169.388,274.568 172.717,274.568L223.11,274.568C225.71,274.568 227.935,272.701 228.385,270.14L258.769,135.621C259.346,132.342 256.824,129.337 253.494,129.337L151.772,129.337C149.171,129.337 146.947,131.204 146.496,133.765Z" />
        </g>
      </g>
    </svg>
  );
}

export function OsIcon({ os, ...props }: IconProps & { os: 'mac' | 'windows' | 'linux' | 'other' }) {
  if (os === 'windows') return <WindowsIcon {...props} />;
  if (os === 'linux') return <LinuxIcon {...props} />;
  return <AppleIcon {...props} />;
}
