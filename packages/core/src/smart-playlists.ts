import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useStore } from 'zustand';
import type { Song } from '@sonora/types';
import { lazyStorage } from './platform';

/**
 * Smart playlists: saved rules (genres, years, favourites, play counts, when a
 * song was added or last played …) that pick songs from the whole library and
 * stay up to date by themselves. Navidrome only supports smart playlists as
 * files on the server, so the rules live on this device and are evaluated here;
 * the result can be saved to the server as an ordinary playlist.
 */
export type SmartSort = 'random' | 'most-played' | 'least-played' | 'recently-added' | 'recently-played' | 'newest' | 'oldest' | 'title' | 'artist';

export interface SmartRules {
  /** any of these genres (empty: all) */
  genres: string[];
  /** artist name contains (case-insensitive) */
  artist?: string;
  yearFrom?: number;
  yearTo?: number;
  favoritesOnly: boolean;
  /** user rating at least (1–5) */
  minRating?: number;
  minPlays?: number;
  maxPlays?: number;
  /** added to the library within the last N days */
  addedWithinDays?: number;
  /** played within the last N days */
  playedWithinDays?: number;
  /** not played for at least N days (never played counts) */
  notPlayedForDays?: number;
  sort: SmartSort;
  limit: number;
}

export interface SmartPlaylist {
  id: string;
  name: string;
  rules: SmartRules;
  createdAt: string;
}

export const SMART_SORTS: { id: SmartSort; label: string }[] = [
  { id: 'random', label: 'Random' },
  { id: 'most-played', label: 'Most played' },
  { id: 'least-played', label: 'Least played' },
  { id: 'recently-added', label: 'Recently added' },
  { id: 'recently-played', label: 'Recently played' },
  { id: 'newest', label: 'Newest release' },
  { id: 'oldest', label: 'Oldest release' },
  { id: 'title', label: 'Title' },
  { id: 'artist', label: 'Artist' },
];

export const DEFAULT_SMART_RULES: SmartRules = { genres: [], favoritesOnly: false, sort: 'random', limit: 100 };

/** Ready-made smart playlists to start from. */
export const SMART_TEMPLATES: { name: string; rules: SmartRules }[] = [
  { name: 'On repeat', rules: { ...DEFAULT_SMART_RULES, minPlays: 1, sort: 'most-played', limit: 50 } },
  { name: 'Recently added', rules: { ...DEFAULT_SMART_RULES, addedWithinDays: 30, sort: 'recently-added', limit: 100 } },
  { name: 'Forgotten favorites', rules: { ...DEFAULT_SMART_RULES, favoritesOnly: true, notPlayedForDays: 90, sort: 'random', limit: 50 } },
  { name: 'Never played', rules: { ...DEFAULT_SMART_RULES, maxPlays: 0, sort: 'random', limit: 100 } },
  { name: 'Top rated', rules: { ...DEFAULT_SMART_RULES, minRating: 4, sort: 'most-played', limit: 100 } },
];

const DAY = 86_400_000;
const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

/** The songs a smart playlist picks from the library, sorted and limited. */
export function evaluateSmartPlaylist(songs: readonly Song[], rules: SmartRules, now = Date.now(), random: () => number = Math.random): Song[] {
  const genres = rules.genres.map((g) => g.toLowerCase());
  const artist = rules.artist?.trim().toLowerCase();
  const picked = songs.filter((s) => {
    if (genres.length) {
      const own = (s.genres?.length ? s.genres : s.genre ? [s.genre] : []).map((g) => g.toLowerCase());
      if (!own.some((g) => genres.includes(g))) return false;
    }
    if (artist && !`${s.artist} ${s.albumArtist ?? ''}`.toLowerCase().includes(artist)) return false;
    if (rules.yearFrom != null && (s.year ?? 0) < rules.yearFrom) return false;
    if (rules.yearTo != null && (s.year == null || s.year > rules.yearTo)) return false;
    if (rules.favoritesOnly && !s.starred) return false;
    if (rules.minRating != null && (s.userRating ?? 0) < rules.minRating) return false;
    const plays = s.playCount ?? 0;
    if (rules.minPlays != null && plays < rules.minPlays) return false;
    if (rules.maxPlays != null && plays > rules.maxPlays) return false;
    if (rules.addedWithinDays != null && now - time(s.created) > rules.addedWithinDays * DAY) return false;
    const played = time(s.lastPlayed);
    if (rules.playedWithinDays != null && (!played || now - played > rules.playedWithinDays * DAY)) return false;
    if (rules.notPlayedForDays != null && played && now - played < rules.notPlayedForDays * DAY) return false;
    return true;
  });
  const by = (f: (s: Song) => number, dir: 1 | -1) => (a: Song, b: Song) => (f(a) - f(b)) * dir;
  switch (rules.sort) {
    case 'random': {
      for (let i = picked.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [picked[i], picked[j]] = [picked[j]!, picked[i]!];
      }
      break;
    }
    case 'most-played':
      picked.sort(by((s) => s.playCount ?? 0, -1));
      break;
    case 'least-played':
      picked.sort(by((s) => s.playCount ?? 0, 1));
      break;
    case 'recently-added':
      picked.sort(by((s) => time(s.created), -1));
      break;
    case 'recently-played':
      picked.sort(by((s) => time(s.lastPlayed), -1));
      break;
    case 'newest':
      picked.sort(by((s) => s.year ?? 0, -1));
      break;
    case 'oldest':
      picked.sort(by((s) => s.year ?? 9999, 1));
      break;
    case 'title':
      picked.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'artist':
      picked.sort((a, b) => a.artist.localeCompare(b.artist) || (a.album ?? '').localeCompare(b.album ?? '') || (a.track ?? 0) - (b.track ?? 0));
      break;
  }
  return picked.slice(0, Math.max(1, rules.limit));
}

/** One line describing the rules, e.g. "Rock, Pop · 1990–1999 · favorites · most played · 100 songs". */
export function describeSmartRules(r: SmartRules): string {
  const parts: string[] = [];
  if (r.genres.length) parts.push(r.genres.join(', '));
  if (r.artist?.trim()) parts.push(`artist “${r.artist.trim()}”`);
  if (r.yearFrom != null || r.yearTo != null) parts.push(`${r.yearFrom ?? '…'}–${r.yearTo ?? '…'}`);
  if (r.favoritesOnly) parts.push('favorites');
  if (r.minRating != null) parts.push(`rated ${r.minRating}★+`);
  if (r.minPlays != null && r.maxPlays != null) parts.push(`${r.minPlays}–${r.maxPlays} plays`);
  else if (r.minPlays != null) parts.push(`${r.minPlays}+ plays`);
  else if (r.maxPlays === 0) parts.push('never played');
  else if (r.maxPlays != null) parts.push(`at most ${r.maxPlays} plays`);
  if (r.addedWithinDays != null) parts.push(`added in the last ${r.addedWithinDays} days`);
  if (r.playedWithinDays != null) parts.push(`played in the last ${r.playedWithinDays} days`);
  if (r.notPlayedForDays != null) parts.push(`not played for ${r.notPlayedForDays} days`);
  parts.push(SMART_SORTS.find((s) => s.id === r.sort)?.label.toLowerCase() ?? r.sort);
  parts.push(`up to ${r.limit} songs`);
  return parts.join(' · ');
}

/** Repairs rules read from storage (missing or invalid fields). */
export function normalizeSmartRules(v: unknown): SmartRules {
  const r = (v ?? {}) as Partial<SmartRules>;
  const num = (x: unknown, min: number, max: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : undefined);
  return {
    genres: Array.isArray(r.genres) ? r.genres.filter((g): g is string => typeof g === 'string') : [],
    artist: typeof r.artist === 'string' && r.artist.trim() ? r.artist : undefined,
    yearFrom: num(r.yearFrom, 0, 9999),
    yearTo: num(r.yearTo, 0, 9999),
    favoritesOnly: r.favoritesOnly === true,
    minRating: num(r.minRating, 1, 5),
    minPlays: num(r.minPlays, 0, 1_000_000),
    maxPlays: num(r.maxPlays, 0, 1_000_000),
    addedWithinDays: num(r.addedWithinDays, 1, 100_000),
    playedWithinDays: num(r.playedWithinDays, 1, 100_000),
    notPlayedForDays: num(r.notPlayedForDays, 1, 100_000),
    sort: SMART_SORTS.some((s) => s.id === r.sort) ? (r.sort as SmartSort) : 'random',
    limit: num(r.limit, 1, 5000) ?? 100,
  };
}

const newId = () => `smart-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export interface SmartPlaylistsState {
  playlists: SmartPlaylist[];
  create(name: string, rules: SmartRules): SmartPlaylist;
  update(id: string, changes: { name?: string; rules?: SmartRules }): void;
  remove(id: string): void;
}

export const smartPlaylistsStore = createStore<SmartPlaylistsState>()(
  persist(
    (set) => ({
      playlists: [],
      create(name, rules) {
        const p: SmartPlaylist = { id: newId(), name: name.trim() || 'Smart playlist', rules: normalizeSmartRules(rules), createdAt: new Date().toISOString() };
        set((s) => ({ playlists: [...s.playlists, p] }));
        return p;
      },
      update(id, changes) {
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === id ? { ...p, name: changes.name?.trim() || p.name, rules: changes.rules ? normalizeSmartRules(changes.rules) : p.rules } : p,
          ),
        }));
      },
      remove(id) {
        set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }));
      },
    }),
    {
      name: 'sonora.smart-playlists',
      storage: createJSONStorage(() => lazyStorage),
      skipHydration: true,
      partialize: (s) => ({ playlists: s.playlists }),
      merge: (persisted, current) => {
        const list = ((persisted as { playlists?: unknown } | undefined)?.playlists ?? []) as Partial<SmartPlaylist>[];
        return {
          ...current,
          playlists: Array.isArray(list)
            ? list
                .filter((p) => typeof p?.id === 'string')
                .map((p) => ({ id: p.id!, name: String(p.name ?? 'Smart playlist'), rules: normalizeSmartRules(p.rules), createdAt: String(p.createdAt ?? '') }))
            : [],
        };
      },
    },
  ),
);

export function useSmartPlaylists<T>(selector: (s: SmartPlaylistsState) => T): T {
  return useStore(smartPlaylistsStore, selector);
}
