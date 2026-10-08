import { describe, expect, it } from 'vitest';
import { lyricsHint } from '../src/queries';

describe('lyricsHint', () => {
  it('tells owners of an old Navidrome to update for .lrc files', () => {
    expect(lyricsHint({ type: 'navidrome', serverVersion: '0.53.3 (abc)' })).toMatch(/0\.53.*0\.55 or newer/);
  });
  it('otherwise explains .lrc files and the full scan', () => {
    expect(lyricsHint({ type: 'navidrome', serverVersion: '0.64.2 (10114574)' })).toMatch(/Full scan/);
    expect(lyricsHint(undefined)).toMatch(/\.lrc/);
  });
});
