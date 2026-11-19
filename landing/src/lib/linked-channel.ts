import { useSyncExternalStore } from 'react';

export type LinkedChannel = 'stable' | 'nightly';

/** Reads `?channel=` from a shared download link (DownloadSheet adds `?channel=nightly`). */
export function parseLinkedChannel(search: string): LinkedChannel | null {
  const value = new URLSearchParams(search).get('channel');
  return value === 'nightly' || value === 'stable' ? value : null;
}

const subscribeNever = () => () => {};
const readFromLocation = () => parseLinkedChannel(window.location.search);
const noLinkOnServer = () => null;

/**
 * The channel named in the page URL, or null. It is null in the prerendered
 * HTML and during hydration (the server snapshot), then the real value, so
 * hydration matches.
 */
export function useLinkedChannel(): LinkedChannel | null {
  return useSyncExternalStore(subscribeNever, readFromLocation, noLinkOnServer);
}
