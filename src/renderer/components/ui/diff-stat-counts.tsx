interface DiffStatCountsProps {
  added: number
  removed: number
  /**
   * Leave out a side that is zero, and everything when both are zero.
   * Off by default: the chat panels show both sides whenever either is non-zero.
   */
  omitZero?: boolean
}

/**
 * Added / removed line counts: `+N` in success ink, `−M` (U+2212) in
 * destructive ink, one space apart. Renders the spans only, so the caller
 * owns the wrapper (font, size, alignment).
 */
export function DiffStatCounts({
  added,
  removed,
  omitZero = false
}: DiffStatCountsProps): React.JSX.Element | null {
  const showAdded = !omitZero || added > 0
  const showRemoved = !omitZero || removed > 0
  if (!showAdded && !showRemoved) return null
  return (
    <>
      {showAdded && <span className="text-success">+{added}</span>}
      {showAdded && showRemoved && ' '}
      {showRemoved && <span className="text-destructive">−{removed}</span>}
    </>
  )
}
