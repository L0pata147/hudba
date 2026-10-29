import { describe, expect, it } from 'vitest';
import { cleanYear, mapAlbum, mapSong } from '../src/navidrome/mappers';

describe('years', () => {
  it('drops the 1 January 1970 placeholder written by some tagging tools', () => {
    expect(cleanYear(1970, { year: 1970, month: 1, day: 1 })).toBeUndefined();
    expect(mapAlbum({ id: 'a', name: 'A', year: 1970, releaseDate: { year: 1970, month: 1, day: 1 } }).year).toBeUndefined();
    expect(mapSong({ id: 's', title: 'S', year: 1970, originalReleaseDate: { year: 1970, month: 1, day: 1 } }).year).toBeUndefined();
  });

  it('keeps real years, including 1970 albums tagged with just the year', () => {
    expect(cleanYear(1970, { year: 1970 })).toBe(1970);
    expect(cleanYear(1970)).toBe(1970);
    expect(cleanYear(1971, { year: 1971, month: 1, day: 1 })).toBe(1971);
    expect(mapAlbum({ id: 'a', name: 'A', year: 1999 }).year).toBe(1999);
    expect(cleanYear(0)).toBeUndefined();
  });
});
