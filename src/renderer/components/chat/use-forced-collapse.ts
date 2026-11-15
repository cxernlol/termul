import { useCallback, useEffect, useState } from 'react'

/**
 * Collapse state for a dock bar with a temporary "force collapsed" override
 * (the mobile dock collapses its plan bar while the
 * on-screen keyboard is up and an approval is pending).
 *
 * While `force` is true the bar renders collapsed. A header tap during that
 * window flips the rendered state and the choice sticks until the window ends.
 * When `force` ends, the bar shows the user's last own state: whatever they
 * last set, or `initialCollapsed` if they never touched it.
 */
export function useForcedCollapse(
  initialCollapsed: boolean,
  force: boolean
): { collapsed: boolean; toggle: () => void; setCollapsed: (next: boolean) => void } {
  const [collapsed, setCollapsedState] = useState(initialCollapsed)
  const [toggledDuringForce, setToggledDuringForce] = useState(false)

  // The mark only matters inside one force window.
  useEffect(() => {
    if (!force) setToggledDuringForce(false)
  }, [force])

  const effectiveCollapsed = force && !toggledDuringForce ? true : collapsed

  const toggle = useCallback(() => {
    setCollapsedState(!effectiveCollapsed)
    if (force) setToggledDuringForce(true)
  }, [effectiveCollapsed, force])

  // Programmatic open/close (a finished plan, or a new plan). A forced
  // collapse still wins until that window ends; the requested state shows after.
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
  }, [])

  return { collapsed: effectiveCollapsed, toggle, setCollapsed }
}
