import { describe, expect, it } from 'vitest';
import type { HistoryEntry, Song } from '@sonora/types';
import { buildDailyMixes, localDay } from '../src/daily-mixes';
import { song } from './fixtures';

const NOW = Date.parse('2026-06-01T12:00:00Z');

/** 60 songs per genre over 6 artists; the first 20 of each genre have been played (more for rock). */
function library(): Song[] {
  const out: Song[] = [];
  for (const [g, plays] of [['Rock', 10], ['Jazz', 4], ['Pop', 1]] as const) {
    for (let i = 0; i < 60; i++) {
      out.push(song(`${g}-${i}`, { title: `${g} ${i}`, genre: g, artist: `${g} artist ${i % 6}`, albumId: `${g}-al-${i % 6}`, coverArtId: `${g}-al-${i % 6}`, playCount: i < 20 ? plays : 0, year: 1990 + (i % 20) }));
    }
  }
  // a genre you never play gets no mix
  for (let i = 0; i < 40; i++) out.push(song(`Polka-${i}`, { genre: 'Polka', artist: 'Polka band' }));
  return out;
}

describe('daily mixes', () => {
  it('makes one mix per genre you play, most played first, plus Discovery', () => {
    const mixes = buildDailyMixes(library(), [], { day: '2026-06-01', now: NOW, size: 30 });
    expect(mixes.map((m) => m.name)).toEqual(['Rock Mix', 'Jazz Mix', 'Pop Mix', 'Discovery Mix']);
    expect(mixes.map((m) => m.id)).toEqual(['genre:rock', 'genre:jazz', 'genre:pop', 'discover']);
    const rock = mixes[0]!;
    expect(rock.songs).toHaveLength(30);
    expect(rock.songs.every((s) => s.genre === 'Rock')).toBe(true);
    // mostly songs you know, some new ones
    const known = rock.songs.filter((s) => (s.playCount ?? 0) > 0).length;
    expect(known).toBeGreaterThanOrEqual(15);
    expect(known).toBeLessThan(30);
    expect(rock.description).toMatch(/^Rock artist \d, Rock artist \d, Rock artist \d and more$/);
    expect(rock.coverArtIds.length).toBe(4);
  });

  it('never repeats a song across mixes and spreads artists out', () => {
    const mixes = buildDailyMixes(library(), [], { day: '2026-06-01', now: NOW, size: 30 });
    const all = mixes.flatMap((m) => m.songs.map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    for (const m of mixes.filter((x) => x.id.startsWith('genre:'))) {
      const repeats = m.songs.filter((s, i) => i > 0 && s.artist === m.songs[i - 1]!.artist);
      expect(repeats).toEqual([]);
    }
    const discover = mixes.find((m) => m.id === 'discover')!;
    expect(discover.songs.every((s) => !s.playCount)).toBe(true);
  });

  it('is the same all day, different the next day or when remade', () => {
    const ids = (day: string, salt = 0) => buildDailyMixes(library(), [], { day, now: NOW, salt })[0]!.songs.map((s) => s.id);
    expect(ids('2026-06-01')).toEqual(ids('2026-06-01'));
    expect(ids('2026-06-02')).not.toEqual(ids('2026-06-01'));
    expect(ids('2026-06-01', 1)).not.toEqual(ids('2026-06-01'));
  });

  it('counts plays on this device, and leaves out what you heard today', () => {
    const lib = library();
    const polka = lib.find((s) => s.id === 'Polka-0')!;
    const history: HistoryEntry[] = Array.from({ length: 30 }, (_, i) => ({ song: polka, playedAt: new Date(NOW - (i + 2) * 86_400_000).toISOString() }));
    const today: HistoryEntry = { song: lib[0]!, playedAt: new Date(NOW - 3600_000).toISOString() };
    const mixes = buildDailyMixes(lib, [today, ...history], { day: '2026-06-01', now: NOW });
    expect(mixes.map((m) => m.id)).toContain('genre:polka');
    expect(mixes.flatMap((m) => m.songs).some((s) => s.id === lib[0]!.id)).toBe(false);
  });

  it('falls back to decades without genres, and makes nothing for an unplayed library', () => {
    const noGenres = library().map((s) => ({ ...s, genre: undefined, genres: undefined }));
    const names = buildDailyMixes(noGenres, [], { day: '2026-06-01', now: NOW }).map((m) => m.name);
    expect(names.slice(0, 2)).toEqual(expect.arrayContaining(['90s Mix', '2000s Mix']));
    const unplayed = library().map((s) => ({ ...s, playCount: 0 }));
    expect(buildDailyMixes(unplayed, [], { day: '2026-06-01', now: NOW })).toEqual([]);
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('same song in several files', () => {
  it('recognises copies across albums, remasters, live tags and featured artists', async () => {
    const { songKey } = await import('../src/song-key');
    const key = (artist: string, title: string) => songKey({ artist, title });
    expect(key('Queen', 'Bohemian Rhapsody')).toBe(key('Queen', 'Bohemian Rhapsody - Remastered 2011'));
    expect(key('Queen', 'Bohemian Rhapsody')).toBe(key('queen', 'Bohemian Rhapsody (Remastered)'));
    expect(key('Daft Punk', 'Get Lucky')).toBe(key('Daft Punk, Pharrell Williams', 'Get Lucky (feat. Pharrell Williams)'));
    expect(key('Kryštof', 'Ty a já')).toBe(key('Krystof', 'Ty a ja'));
    expect(key('Queen', 'Bohemian Rhapsody')).not.toBe(key('Queen', "Don't Stop Me Now"));
    expect(key('Queen', 'Intro')).not.toBe(key('Muse', 'Intro'));
  });

  it('puts one copy in the mixes, with the plays of all copies', () => {
    const lib = library();
    // every Rock song also on a "Greatest Hits" album, never played there
    const copies = lib.filter((s) => s.genre === 'Rock').map((s) => ({ ...s, id: `${s.id}-gh`, albumId: 'gh', playCount: 0, title: `${s.title} (Remastered)` }));
    const mixes = buildDailyMixes([...lib, ...copies], [], { day: '2026-06-01', now: NOW, size: 30 });
    const titles = mixes.flatMap((m) => m.songs.map((s) => s.title.replace(' (Remastered)', '')));
    expect(new Set(titles).size).toBe(titles.length);
    // the copies are not "new to you" in Discovery either
    expect(mixes.find((m) => m.id === 'discover')!.songs.some((s) => s.id.endsWith('-gh') && Number(s.id.split('-')[1]) < 20)).toBe(false);
  });
});
