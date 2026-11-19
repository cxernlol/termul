import type { ReactNode } from 'react';

/** Tour tab icons (Paper "Tab bar"). 14px, 1.75 stroke, currentColor. */
function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export const KeyIcon = () => (
  <TabIcon>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.85 12.15 19 4" />
    <path d="m18 5 2 2" />
    <path d="m15 8 2 2" />
  </TabIcon>
);

export const CanvasIcon = () => (
  <TabIcon>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </TabIcon>
);

export const CalendarIcon = () => (
  <TabIcon>
    <rect x="3" y="4" width="18" height="17" rx="3" />
    <path d="M8 2v4M16 2v4M3 10h18" />
    <path d="M12 14v2.5l1.5 1" />
  </TabIcon>
);

export const GlobeIcon = () => (
  <TabIcon>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
  </TabIcon>
);

export const PhoneIcon = () => (
  <TabIcon>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </TabIcon>
);

export function PauseGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0" fill="currentColor">
      <rect x="2.5" y="2" width="2.5" height="8" rx="0.75" />
      <rect x="7" y="2" width="2.5" height="8" rx="0.75" />
    </svg>
  );
}

export function PlayGlyph() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0" fill="currentColor">
      <path d="M3.5 2.2v7.6c0 .5.5.8.9.5l5.6-3.8a.6.6 0 0 0 0-1L4.4 1.7c-.4-.3-.9 0-.9.5Z" />
    </svg>
  );
}
