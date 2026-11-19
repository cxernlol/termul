#!/usr/bin/env bun

/**
 * Build-time testimonial snapshot.
 *
 * 1. Reads the approved testimonials from the live database
 *    (GET https://usetroupe.dev/api/testimonials).
 * 2. Saves each avatar as a small 96×96 WebP in public/media/testimonials/
 *    (the page shows them at 32px; uploads can be 1–2 MB photos).
 * 3. Writes src/data/testimonials.snapshot.json with the local avatar paths.
 *
 * The prerendered homepage shows this snapshot; after hydration the page asks
 * /api/testimonials again for newer approvals. A network or API error keeps
 * the existing snapshot and avatar files, so the build never fails because
 * the API is down.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import type { PublicTestimonial } from '../src/types/testimonials';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_FILE = resolve(__dirname, '../src/data/testimonials.snapshot.json');
const AVATAR_DIR = resolve(__dirname, '../public/media/testimonials');
const AVATAR_PUBLIC_PATH = '/media/testimonials';
const SITE = process.env.TESTIMONIALS_SITE ?? 'https://usetroupe.dev';
const AVATAR_PX = 96; // 3× the 32px avatar
const HEADERS = { 'User-Agent': 'usetroupe.dev build' };

/** Field limits, the same as the submit API (functions/api/_lib.ts). */
const MAX_LENGTH = { quote: 500, name: 80, role: 120 } as const;
const ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

function isAvatarUrl(value: string): boolean {
  if (value === '' || value.startsWith('/api/testimonials/avatar/')) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The API data goes into a file in the repo, so it is checked before use: an
 * id that is safe as a file name, text within the API's own limits, an avatar
 * from our API or https. Only the known fields are kept.
 */
function toTestimonial(value: unknown): PublicTestimonial | null {
  if (!value || typeof value !== 'object') return null;
  const { id, quote, name, role, avatarUrl } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
  if (typeof quote !== 'string' || quote.length === 0 || quote.length > MAX_LENGTH.quote) return null;
  if (typeof name !== 'string' || name.length === 0 || name.length > MAX_LENGTH.name) return null;
  if (typeof role !== 'string' || role.length === 0 || role.length > MAX_LENGTH.role) return null;
  if (typeof avatarUrl !== 'string' || !isAvatarUrl(avatarUrl)) return null;
  return { id, quote, name, role, avatarUrl };
}

/** The current snapshot, or an empty list when there is none yet (read once, no exists check). */
function readSnapshot(): PublicTestimonial[] {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as PublicTestimonial[];
  } catch {
    return [];
  }
}

/** Safe file name from the testimonial id (a UUID). */
function avatarFileName(id: string): string {
  return `${id.replace(/[^a-zA-Z0-9-]/g, '')}.webp`;
}

/** Downloads and shrinks one avatar. Returns the local public path, or null. */
async function saveSmallAvatar(item: PublicTestimonial): Promise<string | null> {
  if (!item.avatarUrl) return null;
  const file = resolve(AVATAR_DIR, avatarFileName(item.id));
  const publicPath = `${AVATAR_PUBLIC_PATH}/${avatarFileName(item.id)}`;
  try {
    const url = new URL(item.avatarUrl, SITE);
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const input = Buffer.from(await response.arrayBuffer());
    const output = await sharp(input, { animated: false })
      .rotate()
      .resize(AVATAR_PX, AVATAR_PX, { fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer();
    writeFileSync(file, output);
    return publicPath;
  } catch (error) {
    console.warn(`[sync-testimonials] Avatar for ${item.id} failed:`, error);
    // Keep an earlier copy if there is one.
    return existsSync(file) ? publicPath : null;
  }
}

async function main(): Promise<void> {
  const previous = readSnapshot();

  let list: PublicTestimonial[] | null = null;
  try {
    const response = await fetch(`${SITE}/api/testimonials`, { headers: { ...HEADERS, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { testimonials?: unknown };
    const items: unknown[] = Array.isArray(payload.testimonials) ? payload.testimonials : [];
    const approved = items.map(toTestimonial).filter((item) => item !== null);
    if (approved.length < items.length) {
      console.warn(`[sync-testimonials] Skipped ${items.length - approved.length} testimonials that failed the check.`);
    }
    if (approved.length > 0) list = approved;
    else console.warn('[sync-testimonials] The API returned no approved testimonials. Keeping the snapshot.');
  } catch (error) {
    console.warn('[sync-testimonials] Request failed. Keeping the snapshot:', error);
  }

  if (!list) {
    console.log(`[sync-testimonials] ${previous.length} testimonials (unchanged)`);
    return;
  }

  mkdirSync(AVATAR_DIR, { recursive: true });
  const next: PublicTestimonial[] = [];
  for (const item of list) {
    const local = await saveSmallAvatar(item);
    // No local copy: keep the API URL, so the avatar still shows.
    next.push({ ...item, avatarUrl: local ?? item.avatarUrl });
  }

  // Remove avatars of testimonials that are no longer approved.
  const keep = new Set(next.map((item) => avatarFileName(item.id)));
  for (const name of readdirSync(AVATAR_DIR)) {
    if (name.endsWith('.webp') && !keep.has(name)) rmSync(resolve(AVATAR_DIR, name));
  }

  writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(next, null, 2)}\n`);
  const local = next.filter((item) => item.avatarUrl.startsWith(AVATAR_PUBLIC_PATH)).length;
  console.log(`[sync-testimonials] ${next.length} approved testimonials, ${local} small avatars`);
}

await main();
