import { fetchReleases, mergeReleases, type ReleasesResponse } from './_releases';

const CACHE_SECONDS = 600;
const STALE_SECONDS = 3600;
/** After a partial GitHub failure, try again after this many seconds. */
const RETRY_SECONDS = 60;

/**
 * `freshFor`: how long this body stays fresh, in seconds. Cloudflare's edge
 * cache gets the same time, so it does not keep a partial body (one channel
 * from the old cache) past the retry; otherwise the edge answers for 10
 * minutes and the worker never asks GitHub again.
 */
function respond(body: ReleasesResponse, cacheHit: boolean, freshFor: number): Response {
  const stale = freshFor <= RETRY_SECONDS ? RETRY_SECONDS : STALE_SECONDS;
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${Math.min(60, freshFor)}, s-maxage=${freshFor}, stale-while-revalidate=${stale}`,
      'X-Releases-Cache': cacheHit ? 'hit' : 'miss',
    },
  });
}

/**
 * GET /api/releases: the newest stable and nightly builds, cached at the edge.
 * If GitHub fails for one channel, that channel keeps its cached value. If it
 * fails for both, the last cached copy is served. With no cached copy, 503;
 * the page then keeps its build-time snapshot.
 */
export async function getReleases(request: Request, token?: string): Promise<Response> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(new URL('/api/releases', request.url).toString());

  const cached = cache ? await cache.match(cacheKey) : undefined;
  const previous = cached ? ((await cached.json().catch(() => null)) as ReleasesResponse | null) : null;
  if (cached && previous) {
    const fetchedAt = Number(cached.headers.get('X-Releases-Fetched') ?? 0);
    // Seconds left before the stored copy is due again (short for a partial copy).
    const freshFor = Math.ceil(CACHE_SECONDS - (Date.now() - fetchedAt) / 1000);
    if (freshFor > 0) return respond(previous, true, freshFor);
  }

  const fresh = await fetchReleases(fetch, token);
  if (!fresh.stable && !fresh.nightly) {
    // GitHub failed for both channels: serve the old copy, and try again soon.
    if (previous) return respond(previous, true, RETRY_SECONDS);
    return new Response(JSON.stringify({ error: 'Release data is not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const { body, partial } = mergeReleases(fresh, previous);
  // A merged (partial) result counts as fresh for RETRY_SECONDS only, in the
  // worker cache and at the edge, so the failed channel is asked for again soon.
  const freshFor = partial ? RETRY_SECONDS : CACHE_SECONDS;
  if (cache) {
    const stored = new Response(JSON.stringify(body), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS + STALE_SECONDS}`,
        'X-Releases-Fetched': String(Date.now() - (CACHE_SECONDS - freshFor) * 1000),
      },
    });
    await cache.put(cacheKey, stored);
  }
  return respond(body, false, freshFor);
}
