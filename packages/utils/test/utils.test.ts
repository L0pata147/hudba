import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { formatDuration, md5, moveItem, shuffleArray, validateServerUrl } from '../src';

describe('md5', () => {
  it.each(['', 'a', 'sonora123abcdef', 'heslo+žluťoučký kůň 🎵', 'x'.repeat(1000)])('matches node crypto for %s', (input) => {
    expect(md5(input)).toBe(createHash('md5').update(input, 'utf8').digest('hex'));
  });
});

describe('validateServerUrl', () => {
  it('adds https to public hosts and http to LAN hosts', () => {
    expect(validateServerUrl('music.example.com')).toMatchObject({ ok: true, url: 'https://music.example.com', insecure: false });
    expect(validateServerUrl('192.168.1.20:4533')).toMatchObject({ ok: true, url: 'http://192.168.1.20:4533', insecure: false });
  });
  it('strips web-ui and rest suffixes and trailing slashes', () => {
    expect(validateServerUrl('https://music.example.com/app/#/album').url).toBe('https://music.example.com');
    expect(validateServerUrl('https://example.com/navidrome/rest/').url).toBe('https://example.com/navidrome');
  });
  it('flags plain http to public hosts', () => {
    expect(validateServerUrl('http://music.example.com')).toMatchObject({ ok: true, insecure: true });
  });
  it('rejects garbage, other schemes and embedded credentials', () => {
    expect(validateServerUrl('').ok).toBe(false);
    expect(validateServerUrl('ftp://x.com').ok).toBe(false);
    expect(validateServerUrl('https://user:pass@x.com').ok).toBe(false);
    expect(validateServerUrl('http://').ok).toBe(false);
  });
});

describe('helpers', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(222)).toBe('3:42');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
  it('moves and shuffles without mutating', () => {
    const src = [1, 2, 3, 4];
    expect(moveItem(src, 0, 2)).toEqual([2, 3, 1, 4]);
    const shuffled = shuffleArray(src);
    expect(shuffled.slice().sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4]);
  });
});
