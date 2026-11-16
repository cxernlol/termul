import { useId } from 'react'
import { cn } from '@/lib/utils'

/** Connectors with a known logo. Matched on the server name. */
export type ConnectorBrand = 'gmail' | 'github' | 'notion'

/**
 * Sample logos on the foot row's Connectors button while no server is on
 * (Paper "Connect apps" reference): decoration only, so the user sees the
 * button opens apps. They are not connectors and carry no state.
 */
export const SAMPLE_CONNECTOR_BRANDS: readonly ConnectorBrand[] = ['gmail', 'github', 'notion']

/** The brand a connector name points to, or null for a letter tile. */
export function connectorBrand(name: string): ConnectorBrand | null {
  const key = name.toLowerCase()
  if (key.includes('gmail')) return 'gmail'
  if (key.includes('github')) return 'github'
  if (key.includes('notion')) return 'notion'
  return null
}

function GmailLogo({ size }: { size: number }): React.JSX.Element {
  // Gradient ids must be unique per instance: several logos share a page.
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 56.411 44.872" aria-hidden="true">
      <defs>
        <linearGradient
          id={`${id}-a`}
          x1="50.315"
          y1="5.767"
          x2="50.315"
          y2="44.87"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#60D673" />
          <stop offset="0.39" stopColor="#0EBC5F" />
          <stop offset="0.62" stopColor="#00A9BB" />
          <stop offset="1" stopColor="#3186FF" />
        </linearGradient>
        <linearGradient
          id={`${id}-b`}
          x1="0"
          y1="6.452"
          x2="56.411"
          y2="6.452"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.08" stopColor="#FF63A0" />
          <stop offset="0.3" stopColor="#FC413D" />
          <stop offset="0.72" stopColor="#FC5C30" />
          <stop offset="0.86" stopColor="#FEB10C" />
          <stop offset="0.96" stopColor="#FFDB0F" />
        </linearGradient>
      </defs>
      <path
        d="M44.225 5.767H56.405V41.024C56.405 43.148 54.683 44.87 52.559 44.87H46.149C44.088 44.87 44.225 43.2 44.225 42.947V5.767Z"
        fill={`url(#${id}-a)`}
      />
      <path
        d="M12.18 5.767H0V41.024C0 43.148 1.722 44.87 3.846 44.87H10.257C11.316 44.87 12.18 44.006 12.18 42.947V5.767Z"
        fill="#FC413D"
      />
      <path
        d="M10.008 1.428C7.434 -0.736 3.592 -0.404 1.428 2.171C-0.736 4.745 -0.403 8.587 2.172 10.751L26.556 31.248C27.512 32.051 28.9 32.051 29.855 31.248L54.24 10.751C56.814 8.587 57.147 4.745 54.983 2.171C52.818 -0.404 48.977 -0.736 46.403 1.428L28.205 16.724L10.008 1.428Z"
        fill={`url(#${id}-b)`}
      />
    </svg>
  )
}

function GithubLogo({ size }: { size: number }): React.JSX.Element {
  // Octicons mark-github (MIT).
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function NotionLogo({ size }: { size: number }): React.JSX.Element {
  // Hugeicons Notion02 (the project's icon set), drawn at logo size.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M2.5 3.5L16.5 2.5L21.5 5.5M2.5 3.5L6.5 6.5M2.5 3.5V16.5L6.5 21.5M21.5 5.5L6.5 6.5M21.5 5.5V19.5L6.5 21.5M6.5 6.5V21.5" />
      <path d="M12.4704 17.704L9.5 18.1M18.5 8.70001L16.2654 8.84899M17.5 8.76668V17L11.7148 9.15236L9.5 9.30001M11 9.20001V17.7" />
    </svg>
  )
}

/** A connector's brand logo; monochrome marks take the text colour. */
export function ConnectorLogo({
  brand,
  size,
  className
}: {
  brand: ConnectorBrand
  size: number
  className?: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-connector-logo={brand}
      className={cn('flex shrink-0 items-center justify-center text-foreground', className)}
      style={{ width: size, height: size }}
    >
      {brand === 'gmail' ? (
        <GmailLogo size={size} />
      ) : brand === 'github' ? (
        <GithubLogo size={size} />
      ) : (
        <NotionLogo size={size} />
      )}
    </span>
  )
}
