import { useHead, useSeoMeta } from '@unhead/react';

const ORIGIN = 'https://usetroupe.dev';

/**
 * Per-route head tags. index.html holds the homepage tags; without this, a
 * shared /privacy/ link would show the homepage title, text and URL, and the
 * canonical would point at the homepage.
 */
export function usePageMeta({
  title,
  description,
  path,
  robots = 'index,follow',
}: {
  title: string;
  description: string;
  /**
   * Path with a trailing slash, as in the sitemap ("/privacy/"). Leave it out
   * on noindex pages (404, admin): they get no canonical and no og:url.
   */
  path?: string;
  robots?: string;
}) {
  const url = path ? `${ORIGIN}${path}` : undefined;
  useSeoMeta({
    title,
    description,
    robots,
    ogTitle: title,
    ogDescription: description,
    ogUrl: url,
    twitterTitle: title,
    twitterDescription: description,
  });
  useHead({ link: url ? [{ rel: 'canonical', href: url }] : [] });
}
