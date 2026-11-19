#!/usr/bin/env bun

/**
 * Build-time release snapshot.
 *
 * Writes src/data/releases.snapshot.json from the GitHub releases API. The
 * prerendered HTML, the JSON-LD softwareVersion and the client fallback all
 * read this file. The page refreshes from /api/releases after hydration.
 *
 * A network or API error keeps the existing snapshot, so the build never
 * fails because GitHub is slow or rate-limited.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchReleases, type ReleasesResponse } from '../functions/api/_releases';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_FILE = resolve(__dirname, '../src/data/releases.snapshot.json');

/** The current snapshot, or null when there is none yet (read once, no exists check). */
function readSnapshot(): ReleasesResponse | null {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as ReleasesResponse;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const previous = readSnapshot();

  let fresh: ReleasesResponse | null = null;
  try {
    fresh = await fetchReleases(fetch, process.env.GITHUB_TOKEN);
  } catch (error) {
    console.warn('[sync-releases] GitHub request failed:', error);
  }

  const next: ReleasesResponse = {
    stable: fresh?.stable ?? previous?.stable ?? null,
    nightly: fresh?.nightly ?? previous?.nightly ?? null,
    fetchedAt: fresh?.stable || fresh?.nightly ? fresh.fetchedAt : (previous?.fetchedAt ?? new Date(0).toISOString()),
  };

  if (!next.stable && !next.nightly) {
    console.warn('[sync-releases] No release data. Keeping the page without versions.');
  }

  writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `[sync-releases] stable ${next.stable?.version ?? '-'}, nightly ${next.nightly?.version ?? '-'}${
      next.nightly?.build ? ` (build ${next.nightly.build})` : ''
    }`,
  );
}

await main();
