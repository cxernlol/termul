import type { ReleaseAssets, ReleaseChannel } from './releases';

export type Os = 'mac' | 'windows' | 'linux' | 'other';
export type Arch = 'arm' | 'x64' | 'unknown';
export type Platform = { os: Os; arch: Arch };

/** The prerendered HTML and the first client render show macOS. */
export const DEFAULT_PLATFORM: Platform = { os: 'mac', arch: 'unknown' };

type HighEntropy = { platform?: string; architecture?: string };
type NavigatorLike = {
  userAgent: string;
  maxTouchPoints?: number;
  userAgentData?: {
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<HighEntropy>;
  };
};

export function osFromUserAgent(userAgent: string, maxTouchPoints = 0): Os {
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return 'other';
  // iPadOS asks for the desktop site and reports "Macintosh", but has touch.
  if (/Macintosh|Mac OS X/i.test(userAgent)) return maxTouchPoints > 1 ? 'other' : 'mac';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Linux|X11|CrOS/i.test(userAgent)) return 'linux';
  return 'other';
}

export function osFromPlatformHint(platform: string | undefined): Os | null {
  switch ((platform ?? '').toLowerCase()) {
    case 'macos':
      return 'mac';
    case 'windows':
      return 'windows';
    case 'linux':
    case 'chrome os':
      return 'linux';
    case 'android':
    case 'ios':
      return 'other';
    default:
      return null;
  }
}

export function archFromHint(architecture: string | undefined): Arch {
  if (!architecture) return 'unknown';
  if (/arm/i.test(architecture)) return 'arm';
  if (/x86/i.test(architecture)) return 'x64';
  return 'unknown';
}

/** "Apple M2", "Apple GPU" mean Apple silicon; "Intel" means an Intel Mac. */
export function archFromRenderer(renderer: string | null | undefined): Arch {
  if (!renderer) return 'unknown';
  if (/Apple (M\d|GPU)/i.test(renderer)) return 'arm';
  if (/Intel|AMD|Radeon/i.test(renderer)) return 'x64';
  return 'unknown';
}

function readWebglRenderer(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return typeof renderer === 'string' ? renderer : null;
  } catch {
    return null;
  }
}

export async function detectPlatform(
  nav: NavigatorLike = navigator,
  readRenderer: () => string | null = readWebglRenderer,
): Promise<Platform> {
  let os: Os | null = osFromPlatformHint(nav.userAgentData?.platform);
  let arch: Arch = 'unknown';

  if (nav.userAgentData?.getHighEntropyValues) {
    try {
      const hints = await nav.userAgentData.getHighEntropyValues(['architecture', 'platform']);
      os = osFromPlatformHint(hints.platform) ?? os;
      arch = archFromHint(hints.architecture);
    } catch {
      // Hints are optional; fall back to the user agent below.
    }
  }

  os ??= osFromUserAgent(nav.userAgent, nav.maxTouchPoints ?? 0);
  if (os === 'mac' && arch === 'unknown') arch = archFromRenderer(readRenderer());
  return { os, arch };
}

export type DownloadTarget = {
  url: string;
  /** Short file description for the menu footer, for example "Apple silicon". */
  fileLabel: string;
};

const MAC_LABEL: Record<'arm' | 'x64', string> = { arm: 'Apple silicon', x64: 'Intel Mac' };

/**
 * The file for this visitor. On a Mac with an unknown chip, Apple silicon.
 * Falls back to the release page when the asset is missing.
 */
export function pickDownload(channel: ReleaseChannel, platform: Platform): DownloadTarget {
  const assets: ReleaseAssets = channel.assets;
  if (platform.os === 'windows' && assets.windows) return { url: assets.windows, fileLabel: 'Windows installer' };
  if (platform.os === 'linux' && assets.linuxAppImage) return { url: assets.linuxAppImage, fileLabel: 'Linux AppImage' };
  if (platform.os === 'mac' || platform.os === 'other') {
    const chip = platform.arch === 'x64' ? 'x64' : 'arm';
    const url = chip === 'x64' ? assets.macIntel : assets.macArm;
    if (url) return { url, fileLabel: MAC_LABEL[chip] };
  }
  return { url: channel.releaseUrl, fileLabel: 'Release page' };
}

export function osLabel(os: Os): string {
  switch (os) {
    case 'windows':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return 'macOS';
  }
}
