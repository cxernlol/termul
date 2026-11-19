import { describe, expect, test } from 'bun:test';

import { parseLinkedChannel } from '../src/lib/linked-channel';

describe('parseLinkedChannel', () => {
  test('reads the channel from a shared download link', () => {
    expect(parseLinkedChannel('?channel=nightly')).toBe('nightly');
    expect(parseLinkedChannel('?channel=stable')).toBe('stable');
  });

  test('ignores missing or unknown channels', () => {
    expect(parseLinkedChannel('')).toBeNull();
    expect(parseLinkedChannel('?channel=beta')).toBeNull();
    expect(parseLinkedChannel('?utm_source=x')).toBeNull();
  });
});
