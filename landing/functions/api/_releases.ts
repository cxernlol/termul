// Release data for the download menu. Pure code: no Workers types, so the
// Pages Function, the build-time snapshot script and the browser share it.

export type ReleaseAssets = {
  macArm?: string;
  macIntel?: string;
  windows?: string;
  linuxAppImage?: string;
};

export type ReleaseChannel = {
  /** "0.4.60" for stable, "0.5.0-nightly" for nightly. */
  version: string;
  /** Git tag: "v0.4.60" or "nightly". */
  tag: string;
  /** ISO date. For nightly, the build date from the version string. */
  publishedAt: string;
  /** Nightly run number, for example 108. */
  build?: number;
  /** Nightly short commit SHA. */
  commit?: string;
  releaseUrl: string;
  assets: ReleaseAssets;
};

export type ReleasesResponse = {
  stable: ReleaseChannel | null;
  nightly: ReleaseChannel | null;
  fetchedAt: string;
};

export type GitHubAsset = { name: string; browser_download_url: string };

export type GitHubRelease = {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  html_url: string;
  assets: GitHubAsset[];
};

export const REPO = 'gnoviawan/troupe';
export const RELEASES_URL = `https://github.com/${REPO}/releases`;

/**
 * Assets are picked by file name ending, not by product name. Stable files
 * still carry the old "Termul.Manager_" prefix; nightly files use "Troupe_".
 */
const ASSET_SUFFIX: Record<keyof ReleaseAssets, string> = {
  macArm: '_aarch64.dmg',
  macIntel: '_x64.dmg',
  windows: '_x64-setup.exe',
  linuxAppImage: '_amd64.AppImage',
};

export function pickAssets(assets: GitHubAsset[]): ReleaseAssets {
  const picked: ReleaseAssets = {};
  for (const key of Object.keys(ASSET_SUFFIX) as (keyof ReleaseAssets)[]) {
    const match = assets.find((asset) => asset.name.endsWith(ASSET_SUFFIX[key]));
    if (match) picked[key] = match.browser_download_url;
  }
  return picked;
}

export type NightlyVersion = {
  /** "0.5.0" */
  base: string;
  /** "20261119" */
  date: string;
  build: number;
  commit: string;
  /** "0.5.0-nightly.20261119.108.3e31072" */
  full: string;
};

const NIGHTLY_PATTERN = /(\d+\.\d+\.\d+)-nightly\.(\d{8})\.(\d+)\.([0-9a-f]{7,40})/;

export function parseNightlyVersion(text: string): NightlyVersion | null {
  const match = NIGHTLY_PATTERN.exec(text);
  if (!match) return null;
  const [full, base, date, build, commit] = match;
  return { base, date, build: Number(build), commit, full };
}

function dateFromStamp(stamp: string): string {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T00:00:00.000Z`;
}

export function toStableChannel(release: GitHubRelease): ReleaseChannel {
  return {
    version: release.tag_name.replace(/^v/, ''),
    tag: release.tag_name,
    publishedAt: release.published_at ?? new Date(0).toISOString(),
    releaseUrl: release.html_url,
    assets: pickAssets(release.assets),
  };
}

/**
 * The moving `nightly` release keeps files of more than one build. Use the
 * build with the highest run number, and only its files.
 */
export function toNightlyChannel(release: GitHubRelease): ReleaseChannel | null {
  let newest: NightlyVersion | null = null;
  for (const asset of release.assets) {
    const parsed = parseNightlyVersion(asset.name);
    if (parsed && (!newest || parsed.build > newest.build)) newest = parsed;
  }
  if (!newest) {
    newest = parseNightlyVersion(release.name ?? '');
  }
  if (!newest) return null;

  const current = newest;
  const assets = pickAssets(release.assets.filter((asset) => asset.name.includes(current.full)));
  return {
    version: `${current.base}-nightly`,
    tag: release.tag_name,
    publishedAt: dateFromStamp(current.date),
    build: current.build,
    commit: current.commit,
    releaseUrl: release.html_url,
    assets,
  };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function getRelease(fetchImpl: FetchLike, path: string, token?: string): Promise<GitHubRelease | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'usetroupe.dev',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/${path}`, { headers });
  if (!response.ok) return null;
  return (await response.json()) as GitHubRelease;
}

/**
 * Keeps each channel's last good value when a new fetch could not get it
 * (a rate limit or a 5xx on one of the two GitHub calls). Without this, a
 * partial failure would store `null` for that channel, and the page would
 * fall back to its older build snapshot. `partial` is true when a channel
 * came from `previous`, so the caller can try GitHub again sooner.
 */
export function mergeReleases(
  fresh: ReleasesResponse,
  previous: ReleasesResponse | null,
): { body: ReleasesResponse; partial: boolean } {
  const stable = fresh.stable ?? previous?.stable ?? null;
  const nightly = fresh.nightly ?? previous?.nightly ?? null;
  const partial = (!fresh.stable && stable !== null) || (!fresh.nightly && nightly !== null);
  return { body: { stable, nightly, fetchedAt: fresh.fetchedAt }, partial };
}

/** Each channel fails on its own: one GitHub error does not hide the other channel. */
export async function fetchReleases(fetchImpl: FetchLike, token?: string): Promise<ReleasesResponse> {
  const [stable, nightly] = await Promise.all([
    getRelease(fetchImpl, 'latest', token).then((r) => (r ? toStableChannel(r) : null)).catch(() => null),
    getRelease(fetchImpl, 'tags/nightly', token).then((r) => (r ? toNightlyChannel(r) : null)).catch(() => null),
  ]);
  return { stable, nightly, fetchedAt: new Date().toISOString() };
}
