import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { osLabel, pickDownload, type DownloadTarget, type Platform } from '@/lib/platform';
import { formatReleaseDate, formatShortReleaseDate, type ReleaseChannel } from '@/lib/releases';
import { usePlatform, useReleases } from '@/lib/use-releases';
import { RELEASES_PAGE_URL } from '@/lib/links';

export type ChannelId = 'stable' | 'nightly';

export type ChannelInfo = {
  id: ChannelId;
  title: string;
  description: string;
  /** "v0.4.60" or "v0.5.0-nightly" */
  versionLabel: string;
  /** "Nov 7, 2026" or "Build 108 · Nov 19, 2026" */
  metaLabel: string;
  /** "v0.4.60 · Nov 7" (the sheet's short form) */
  shortLabel: string;
  target: DownloadTarget;
  releaseUrl: string;
};

type DownloadContextValue = {
  platform: Platform;
  osName: string;
  channels: ChannelInfo[];
  getChannel: (id: ChannelId) => ChannelInfo | undefined;
  allReleasesUrl: string;
  /** Intel file for Macs, for the footer link. */
  intelUrl?: string;
};

const DownloadContext = createContext<DownloadContextValue | null>(null);

const COPY: Record<ChannelId, { title: string; description: string }> = {
  stable: { title: 'Stable', description: 'Production release. The most reliable.' },
  nightly: { title: 'Nightly', description: 'Built each night from the newest code. Can be unstable.' },
};

function toChannelInfo(id: ChannelId, channel: ReleaseChannel, platform: Platform): ChannelInfo {
  const date = formatReleaseDate(channel.publishedAt);
  const shortDate = formatShortReleaseDate(channel.publishedAt);
  return {
    id,
    ...COPY[id],
    versionLabel: `v${channel.version}`,
    metaLabel: channel.build ? `Build ${channel.build} · ${date}` : date,
    shortLabel: `v${channel.version} · ${shortDate}`,
    target: pickDownload(channel, platform),
    releaseUrl: channel.releaseUrl,
  };
}

/** Release data and the visitor's platform for every download control on the page. */
export function DownloadProvider({ children }: { children: ReactNode }) {
  const releases = useReleases();
  const platform = usePlatform();

  const value = useMemo<DownloadContextValue>(() => {
    const channels: ChannelInfo[] = [];
    if (releases.stable) channels.push(toChannelInfo('stable', releases.stable, platform));
    if (releases.nightly) channels.push(toChannelInfo('nightly', releases.nightly, platform));
    return {
      platform,
      osName: osLabel(platform.os),
      channels,
      getChannel: (id) => channels.find((channel) => channel.id === id),
      allReleasesUrl: RELEASES_PAGE_URL,
      intelUrl: releases.stable?.assets.macIntel,
    };
  }, [releases, platform]);

  return <DownloadContext value={value}>{children}</DownloadContext>;
}

export function useDownload(): DownloadContextValue {
  const context = useContext(DownloadContext);
  if (!context) throw new Error('useDownload must be used inside <DownloadProvider>');
  return context;
}
