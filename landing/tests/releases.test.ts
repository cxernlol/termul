import { afterEach, describe, expect, test } from 'bun:test';

import {
  fetchReleases,
  mergeReleases,
  parseNightlyVersion,
  pickAssets,
  toNightlyChannel,
  toStableChannel,
  type GitHubRelease,
  type ReleasesResponse,
} from '../functions/api/_releases';
import { getReleases } from '../functions/api/_releases-handler';

const asset = (name: string) => ({ name, browser_download_url: `https://example.test/${name}` });

const stableRelease: GitHubRelease = {
  tag_name: 'v0.4.60',
  name: 'Termul Manager v0.4.60',
  published_at: '2026-11-07T05:44:20Z',
  html_url: 'https://github.com/gnoviawan/troupe/releases/tag/v0.4.60',
  assets: [
    asset('Termul.Manager_0.4.60_aarch64.dmg'),
    asset('Termul.Manager_0.4.60_x64.dmg'),
    asset('Termul.Manager_0.4.60_x64-setup.exe'),
    asset('Termul.Manager_0.4.60_x64-setup.exe.sig'),
    asset('Termul.Manager_0.4.60_amd64.AppImage'),
    asset('Termul.Manager_0.4.60_amd64.AppImage.sig'),
    asset('Termul.Manager_aarch64.app.tar.gz'),
  ],
};

const nightlyRelease: GitHubRelease = {
  tag_name: 'nightly',
  name: 'Troupe Nightly (0.5.0-nightly.20261119.108.3e31072)',
  published_at: '2026-08-09T17:21:09Z',
  html_url: 'https://github.com/gnoviawan/troupe/releases/tag/nightly',
  assets: [
    asset('Troupe_0.5.0-nightly.20261118.107.104308a_aarch64.dmg'),
    asset('Troupe_0.5.0-nightly.20261118.107.104308a_x64.dmg'),
    asset('Troupe_0.5.0-nightly.20261119.108.3e31072_aarch64.dmg'),
    asset('Troupe_0.5.0-nightly.20261119.108.3e31072_amd64.AppImage'),
    asset('latest-nightly.json'),
  ],
};

describe('pickAssets', () => {
  test('picks files by ending, not by product name', () => {
    const picked = pickAssets(stableRelease.assets);
    expect(picked.macArm).toEndWith('Termul.Manager_0.4.60_aarch64.dmg');
    expect(picked.macIntel).toEndWith('Termul.Manager_0.4.60_x64.dmg');
    expect(picked.windows).toEndWith('_x64-setup.exe');
    expect(picked.linuxAppImage).toEndWith('_amd64.AppImage');
  });

  test('ignores signature files', () => {
    expect(pickAssets([asset('a_x64-setup.exe.sig')]).windows).toBeUndefined();
  });
});

describe('parseNightlyVersion', () => {
  test('reads base, date, build and commit', () => {
    expect(parseNightlyVersion('Troupe_0.5.0-nightly.20261119.108.3e31072_aarch64.dmg')).toEqual({
      base: '0.5.0',
      date: '20261119',
      build: 108,
      commit: '3e31072',
      full: '0.5.0-nightly.20261119.108.3e31072',
    });
  });

  test('returns null for other names', () => {
    expect(parseNightlyVersion('latest-nightly.json')).toBeNull();
  });
});

describe('channels', () => {
  test('stable channel', () => {
    const channel = toStableChannel(stableRelease);
    expect(channel.version).toBe('0.4.60');
    expect(channel.tag).toBe('v0.4.60');
    expect(channel.publishedAt).toBe('2026-11-07T05:44:20Z');
  });

  test('nightly channel uses only the newest build', () => {
    const channel = toNightlyChannel(nightlyRelease);
    expect(channel).not.toBeNull();
    expect(channel?.version).toBe('0.5.0-nightly');
    expect(channel?.build).toBe(108);
    expect(channel?.commit).toBe('3e31072');
    expect(channel?.publishedAt).toBe('2026-11-19T00:00:00.000Z');
    expect(channel?.assets.macArm).toContain('20261119.108');
    // Build 108 has no Intel file in this fixture; build 107's must not leak in.
    expect(channel?.assets.macIntel).toBeUndefined();
  });

  test('nightly without versioned files falls back to the release name', () => {
    const channel = toNightlyChannel({ ...nightlyRelease, assets: [] });
    expect(channel?.build).toBe(108);
    expect(channel?.assets).toEqual({});
  });

  test('nightly with no version anywhere is null', () => {
    expect(toNightlyChannel({ ...nightlyRelease, name: 'Nightly', assets: [] })).toBeNull();
  });
});

describe('fetchReleases', () => {
  test('one failing channel does not hide the other', async () => {
    const fakeFetch = async (url: string) => {
      if (url.endsWith('/latest')) return new Response(JSON.stringify(stableRelease), { status: 200 });
      return new Response('rate limited', { status: 403 });
    };
    const result = await fetchReleases(fakeFetch);
    expect(result.stable?.version).toBe('0.4.60');
    expect(result.nightly).toBeNull();
  });

  test('network errors give null channels', async () => {
    const result = await fetchReleases(async () => {
      throw new Error('offline');
    });
    expect(result.stable).toBeNull();
    expect(result.nightly).toBeNull();
  });
});

describe('mergeReleases', () => {
  const stable = toStableChannel(stableRelease);
  const nightly = toNightlyChannel(nightlyRelease);

  test('keeps the cached channel when the new fetch returns null', () => {
    const { body, partial } = mergeReleases(
      { stable, nightly: null, fetchedAt: 'new' },
      { stable: null, nightly, fetchedAt: 'old' },
    );
    expect(body.stable).toEqual(stable);
    expect(body.nightly).toEqual(nightly);
    expect(body.fetchedAt).toBe('new');
    expect(partial).toBe(true);
  });

  test('a full fetch replaces the cache and is not partial', () => {
    const { body, partial } = mergeReleases({ stable, nightly, fetchedAt: 'new' }, null);
    expect(body).toEqual({ stable, nightly, fetchedAt: 'new' });
    expect(partial).toBe(false);
  });
});

describe('getReleases (edge handler)', () => {
  const realFetch = globalThis.fetch;
  const realCaches = (globalThis as { caches?: unknown }).caches;

  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as { caches?: unknown }).caches = realCaches;
  });

  test('a failed nightly call keeps the cached nightly (Thermo finding)', async () => {
    const cachedNightly = toNightlyChannel(nightlyRelease);
    const store = new Map<string, Response>();
    // The cache holds a newer nightly than the build snapshot, and it is older than 10 minutes.
    store.set(
      'https://usetroupe.dev/api/releases',
      new Response(JSON.stringify({ stable: null, nightly: cachedNightly, fetchedAt: 'old' }), {
        headers: { 'X-Releases-Fetched': String(Date.now() - 11 * 60 * 1000) },
      }),
    );
    (globalThis as { caches?: unknown }).caches = {
      default: {
        match: async (request: Request) => store.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => void store.set(request.url, response),
      },
    };
    // GitHub answers the stable call; the nightly call is rate-limited.
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/latest')) return new Response(JSON.stringify(stableRelease), { status: 200 });
      return new Response('rate limited', { status: 403 });
    }) as typeof fetch;

    const response = await getReleases(new Request('https://usetroupe.dev/api/releases'));
    const body = (await response.json()) as ReleasesResponse;
    expect(body.stable?.version).toBe('0.4.60');
    expect(body.nightly).toEqual(cachedNightly);

    // The stored copy also keeps the nightly, and is due for a retry within about a minute.
    const stored = store.get('https://usetroupe.dev/api/releases')!;
    expect(((await stored.clone().json()) as ReleasesResponse).nightly).toEqual(cachedNightly);
    const fetchedAt = Number(stored.headers.get('X-Releases-Fetched'));
    expect(Date.now() - fetchedAt).toBeGreaterThan(8 * 60 * 1000);
  });

  test('a partial result is edge-cached for about a minute only (Thermo finding)', async () => {
    const store = new Map<string, Response>();
    store.set(
      'https://usetroupe.dev/api/releases',
      new Response(JSON.stringify({ stable: null, nightly: toNightlyChannel(nightlyRelease), fetchedAt: 'old' }), {
        headers: { 'X-Releases-Fetched': String(Date.now() - 11 * 60 * 1000) },
      }),
    );
    (globalThis as { caches?: unknown }).caches = {
      default: {
        match: async (request: Request) => store.get(request.url)?.clone(),
        put: async (request: Request, response: Response) => void store.set(request.url, response),
      },
    };
    let calls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      calls += 1;
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith('/latest')) return new Response(JSON.stringify(stableRelease), { status: 200 });
      return new Response('rate limited', { status: 403 });
    }) as typeof fetch;

    const maxAge = (response: Response, name: string) =>
      Number(new RegExp(`${name}=(\\d+)`).exec(response.headers.get('Cache-Control') ?? '')?.[1]);

    // The merged response: Cloudflare's edge must not keep it for 10 minutes.
    const first = await getReleases(new Request('https://usetroupe.dev/api/releases'));
    expect(maxAge(first, 's-maxage')).toBeLessThanOrEqual(60);
    expect(maxAge(first, 'stale-while-revalidate')).toBeLessThanOrEqual(60);

    // The next visit gets the stored partial copy: still a short edge cache, no new GitHub call.
    const before = calls;
    const second = await getReleases(new Request('https://usetroupe.dev/api/releases'));
    expect(second.headers.get('X-Releases-Cache')).toBe('hit');
    expect(calls).toBe(before);
    expect(maxAge(second, 's-maxage')).toBeLessThanOrEqual(60);
  });

  test('a full result keeps the 10 minute edge cache', async () => {
    (globalThis as { caches?: unknown }).caches = undefined;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      return new Response(JSON.stringify(url.endsWith('/latest') ? stableRelease : [nightlyRelease]), { status: 200 });
    }) as typeof fetch;

    const response = await getReleases(new Request('https://usetroupe.dev/api/releases'));
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=600');
  });
});
