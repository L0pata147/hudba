import { describe, expect, it } from 'vitest';
import { DEFAULT_SMART_RULES, describeSmartRules, evaluateSmartPlaylist, normalizeSmartRules, type SmartRules } from '../src/smart-playlists';
import { seeded, song } from './fixtures';

const NOW = Date.parse('2026-06-01T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const rules = (r: Partial<SmartRules>): SmartRules => ({ ...DEFAULT_SMART_RULES, sort: 'title', ...r });

const library = [
  song('a', { title: 'A', genre: 'Rock', year: 1995, playCount: 12, lastPlayed: daysAgo(2), created: daysAgo(400), starred: true, userRating: 5, artist: 'Foo Fighters' }),
  song('b', { title: 'B', genres: ['Pop', 'Dance'], year: 2021, playCount: 0, created: daysAgo(5) }),
  song('c', { title: 'C', genre: 'rock', year: 1988, playCount: 3, lastPlayed: daysAgo(200), created: daysAgo(900), starred: true, userRating: 3 }),
  song('d', { title: 'D', genre: 'Jazz', playCount: 30, lastPlayed: daysAgo(10), created: daysAgo(20), artist: 'Miles Davis' }),
];
const ids = (r: Partial<SmartRules>) => evaluateSmartPlaylist(library, rules(r), NOW).map((s) => s.id);

describe('smart playlists', () => {
  it('filters by genre (any of, case-insensitive, all genres of a song)', () => {
    expect(ids({ genres: ['Rock'] })).toEqual(['a', 'c']);
    expect(ids({ genres: ['dance', 'jazz'] })).toEqual(['b', 'd']);
  });

  it('filters by years, favorites, rating and artist', () => {
    expect(ids({ yearFrom: 1990, yearTo: 2000 })).toEqual(['a']);
    expect(ids({ yearTo: 2000 })).toEqual(['a', 'c']);
    expect(ids({ favoritesOnly: true })).toEqual(['a', 'c']);
    expect(ids({ minRating: 4 })).toEqual(['a']);
    expect(ids({ artist: 'miles' })).toEqual(['d']);
  });

  it('filters by plays and by when songs were added or played', () => {
    expect(ids({ maxPlays: 0 })).toEqual(['b']);
    expect(ids({ minPlays: 10 })).toEqual(['a', 'd']);
    expect(ids({ addedWithinDays: 30 })).toEqual(['b', 'd']);
    expect(ids({ playedWithinDays: 7 })).toEqual(['a']);
    // never played counts as "not played for a while"
    expect(ids({ notPlayedForDays: 60 })).toEqual(['b', 'c']);
    expect(ids({ favoritesOnly: true, notPlayedForDays: 60 })).toEqual(['c']);
  });

  it('sorts and limits', () => {
    expect(ids({ sort: 'most-played' })).toEqual(['d', 'a', 'c', 'b']);
    expect(ids({ sort: 'recently-added', limit: 2 })).toEqual(['b', 'd']);
    expect(ids({ sort: 'recently-played' })).toEqual(['a', 'd', 'c', 'b']);
    expect(ids({ sort: 'oldest' })).toEqual(['c', 'a', 'b', 'd']);
    const shuffled = evaluateSmartPlaylist(library, rules({ sort: 'random' }), NOW, seeded(3)).map((s) => s.id);
    expect([...shuffled].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('repairs stored rules and describes them', () => {
    const r = normalizeSmartRules({ genres: ['Rock', 3], sort: 'nope', limit: -5, minRating: 9, yearFrom: '1990' });
    expect(r).toMatchObject({ genres: ['Rock'], sort: 'random', limit: 1, minRating: 5, favoritesOnly: false });
    expect(r.yearFrom).toBeUndefined();
    expect(describeSmartRules(rules({ genres: ['Rock'], yearFrom: 1990, yearTo: 1999, favoritesOnly: true, sort: 'most-played', limit: 50 }))).toBe(
      'Rock · 1990–1999 · favorites · most played · up to 50 songs',
    );
  });
});
