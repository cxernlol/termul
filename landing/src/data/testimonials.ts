import snapshot from './testimonials.snapshot.json';
import type { PublicTestimonial } from '../types/testimonials';

/**
 * Approved testimonials from the live database (D1), as of the last build
 * (scripts/sync-testimonials.ts). The prerendered page shows them; after
 * hydration the page asks /api/testimonials for newer approvals.
 */
export type HomeTestimonial = PublicTestimonial;

export const TESTIMONIALS_SNAPSHOT: HomeTestimonial[] = snapshot;

export function initials(name: string): string {
  return (
    name
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
