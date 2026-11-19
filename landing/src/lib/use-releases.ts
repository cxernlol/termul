import { useEffect, useState } from 'react';

import { DEFAULT_PLATFORM, detectPlatform, type Platform } from './platform';
import { fetchLiveReleases, RELEASES_SNAPSHOT, type ReleasesResponse } from './releases';

/**
 * Release data: the build-time snapshot first (matches the prerendered HTML),
 * then the live /api/releases data after hydration. A failed request keeps
 * the snapshot.
 */
export function useReleases(): ReleasesResponse {
  const [releases, setReleases] = useState<ReleasesResponse>(RELEASES_SNAPSHOT);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLiveReleases(controller.signal).then((live) => {
      if (!live) return;
      setReleases((current) => ({
        stable: live.stable ?? current.stable,
        nightly: live.nightly ?? current.nightly,
        fetchedAt: live.fetchedAt,
      }));
    });
    return () => controller.abort();
  }, []);

  return releases;
}

/** The visitor's OS and chip. macOS until detection finishes after hydration. */
export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(DEFAULT_PLATFORM);

  useEffect(() => {
    let active = true;
    void detectPlatform().then((detected) => {
      if (active) setPlatform(detected);
    });
    return () => {
      active = false;
    };
  }, []);

  return platform;
}
