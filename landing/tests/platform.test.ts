import { describe, expect, test } from 'bun:test';

import {
  archFromHint,
  archFromRenderer,
  detectPlatform,
  osFromUserAgent,
  pickDownload,
} from '../src/lib/platform';
import type { ReleaseChannel } from '../src/lib/releases';

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const LINUX_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const channel: ReleaseChannel = {
  version: '0.4.60',
  tag: 'v0.4.60',
  publishedAt: '2026-11-07T05:44:20Z',
  releaseUrl: 'https://github.com/gnoviawan/troupe/releases/tag/v0.4.60',
  assets: {
    macArm: 'https://x/arm.dmg',
    macIntel: 'https://x/x64.dmg',
    windows: 'https://x/setup.exe',
    linuxAppImage: 'https://x/app.AppImage',
  },
};

describe('osFromUserAgent', () => {
  test('desktop systems', () => {
    expect(osFromUserAgent(MAC_UA)).toBe('mac');
    expect(osFromUserAgent(WIN_UA)).toBe('windows');
    expect(osFromUserAgent(LINUX_UA)).toBe('linux');
  });

  test('phones and iPads are "other"', () => {
    expect(osFromUserAgent(IPHONE_UA)).toBe('other');
    expect(osFromUserAgent(MAC_UA, 5)).toBe('other');
  });
});

describe('chip', () => {
  test('client hints', () => {
    expect(archFromHint('arm')).toBe('arm');
    expect(archFromHint('x86')).toBe('x64');
    expect(archFromHint(undefined)).toBe('unknown');
  });

  test('WebGL renderer', () => {
    expect(archFromRenderer('Apple M2 Pro')).toBe('arm');
    expect(archFromRenderer('Apple GPU')).toBe('arm');
    expect(archFromRenderer('Intel(R) Iris(TM) Plus Graphics')).toBe('x64');
    expect(archFromRenderer(null)).toBe('unknown');
  });
});

describe('detectPlatform', () => {
  test('uses high-entropy hints when present', async () => {
    const result = await detectPlatform({
      userAgent: MAC_UA,
      userAgentData: {
        platform: 'macOS',
        getHighEntropyValues: async () => ({ platform: 'macOS', architecture: 'arm' }),
      },
    });
    expect(result).toEqual({ os: 'mac', arch: 'arm' });
  });

  test('falls back to the WebGL renderer on Safari', async () => {
    const result = await detectPlatform({ userAgent: MAC_UA, maxTouchPoints: 0 }, () => 'Apple M3');
    expect(result).toEqual({ os: 'mac', arch: 'arm' });
  });

  test('unknown Mac chip stays unknown', async () => {
    const result = await detectPlatform({ userAgent: MAC_UA }, () => null);
    expect(result).toEqual({ os: 'mac', arch: 'unknown' });
  });
});

describe('pickDownload', () => {
  test('Mac with unknown chip gets Apple silicon', () => {
    expect(pickDownload(channel, { os: 'mac', arch: 'unknown' })).toEqual({ url: 'https://x/arm.dmg', fileLabel: 'Apple silicon' });
  });

  test('Intel Mac', () => {
    expect(pickDownload(channel, { os: 'mac', arch: 'x64' }).url).toBe('https://x/x64.dmg');
  });

  test('Windows and Linux', () => {
    expect(pickDownload(channel, { os: 'windows', arch: 'x64' }).url).toBe('https://x/setup.exe');
    expect(pickDownload(channel, { os: 'linux', arch: 'x64' }).url).toBe('https://x/app.AppImage');
  });

  test('missing file falls back to the release page', () => {
    const noFiles = { ...channel, assets: {} };
    expect(pickDownload(noFiles, { os: 'windows', arch: 'x64' })).toEqual({
      url: channel.releaseUrl,
      fileLabel: 'Release page',
    });
  });
});
