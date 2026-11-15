import { createContext, useContext } from 'react'

/**
 * How the Rail draws its rows (Sidebar V2). `expanded`: icon, label and
 * meta. `collapsed`: the same rows at the same heights, icon only, centred in
 * the 48px Rail. The Rail root provides it once; every Rail part reads it.
 */
type RailDensity = 'expanded' | 'collapsed'

const RailDensityContext = createContext<RailDensity>('expanded')

/** Sets the density for every Rail part inside it. */
export function RailDensityProvider({
  density,
  children
}: {
  density: RailDensity
  children: React.ReactNode
}): React.JSX.Element {
  return <RailDensityContext.Provider value={density}>{children}</RailDensityContext.Provider>
}

/** True when the Rail draws icon-only rows. Outside a provider: false. */
export function useRailCollapsed(): boolean {
  return useContext(RailDensityContext) === 'collapsed'
}
