import snapshot from '../data/releases.snapshot.json';
import type { ReleasesResponse } from '../../functions/api/_releases';

export type {
  ReleaseAssets,
  ReleaseChannel,
  ReleasesResponse,
} from '../../functions/api/_releases';
export { RELEASES_URL } from '../../functions/api/_releases';

/** Build-time data. Used for prerender and when /api/releases fails. */
export const RELEASES_SNAPSHOT = snapshot as ReleasesResponse;

export async function fetchLiveReleases(signal?: AbortSignal): Promise<ReleasesResponse | null> {
  try {
    const response = await fetch('/api/releases', { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const data = (await response.json()) as ReleasesResponse;
    if (!data.stable && !data.nightly) return null;
    return data;
  } catch {
    return null;
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Nov 7, 2026" */
export function formatReleaseDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** "Nov 7" */
export function formatShortReleaseDate(iso: string): string {
  return SHORT_DATE_FORMAT.format(new Date(iso));
}
