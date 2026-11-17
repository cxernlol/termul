import type { SessionIndexEntry } from '@/lib/acp-history-persistence'

export function startedByLabeler(
  index: readonly SessionIndexEntry[]
): (entry: Pick<SessionIndexEntry, 'startedBy'>) => string | undefined {
  const titles = new Map(index.map((entry) => [entry.id, entry.title]))
  return (entry) => {
    const title = entry.startedBy ? titles.get(entry.startedBy) : undefined
    return title === undefined ? undefined : `Started by ${title}`
  }
}
