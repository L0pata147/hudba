import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useStore } from 'zustand';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HistoryEntry, Song } from '@sonora/types';
import { lazyStorage } from './platform';
import { sessionStore } from './session';
import { historyStore } from './history';
import { fetchLibrarySongs, keys, useLibrarySongs } from './queries';

/**
 * Daily mixes: a handful of playlists made each day from your own library,
 * one per kind of music you listen to most (genre, or decade when the
 * library has no genres) plus a Discovery mix. Each mix is mostly songs you
 * like with some you haven't played yet from the same corner of the library.
 * They are built on the device and stay the same for the whole day.
 */
export interface DailyMix {
  /** stable per cluster, e.g. "genre:rock", "decade:1990", "discover" */
  id: string;
  name: string;
  /** "Artist A, Artist B, Artist C and more" */
  description: string;
  songs: Song[];
  /** up to four album covers for the tile */
  coverArtIds: string[];
}

export interface DailyMixOptions {
  /** day the mixes are for (YYYY-MM-DD); the same day gives the same mixes */
  day: string;
  /** songs per mix */
  size?: number;
  /** most mixes (including Discovery) */
  max?: number;
  /** extra seed, changed by "make new mixes" */
  salt?: number;
  now?: number;
}

const DAY_MS = 86_400_000;
/** a cluster needs at least this many songs in the library to make a mix */
const MIN_CLUSTER = 8;

/** Local date as YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks `count` items, each with probability proportional to its weight, without repeats. */
function weightedSample<T>(items: readonly T[], weight: (t: T) => number, count: number, random: () => number): T[] {
  // Efraimidis–Spirakis: key = u^(1/w), keep the largest keys
  return items
    .map((item) => ({ item, key: Math.pow(random(), 1 / Math.max(1e-6, weight(item))) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((x) => x.item);
}

/** Shuffles, then reorders so the same artist doesn't come up twice within three songs when it can be avoided. */
function spreadArtists(songs: Song[], random: () => number): Song[] {
  const pool = [...songs];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const left = new Map<string, number>();
  for (const s of pool) left.set(s.artist, (left.get(s.artist) ?? 0) + 1);
  const out: Song[] = [];
  while (pool.length) {
    const recent = out.slice(-2).map((s) => s.artist);
    // the artist with the most songs left goes first, so no artist piles up at the end
    let idx = -1;
    for (let i = 0; i < pool.length; i++) {
      const a = pool[i]!.artist;
      if (recent.includes(a)) continue;
      if (idx < 0 || left.get(a)! > left.get(pool[idx]!.artist)!) idx = i;
    }
    const [next] = pool.splice(idx < 0 ? 0 : idx, 1);
    left.set(next!.artist, left.get(next!.artist)! - 1);
    out.push(next!);
  }
  return out;
}

const primaryGenre = (s: Song) => (s.genres?.[0] ?? s.genre ?? '').trim();

function describe(songs: readonly Song[], weightOf: (s: Song) => number): string {
  const byArtist = new Map<string, number>();
  for (const s of songs) byArtist.set(s.artist, (byArtist.get(s.artist) ?? 0) + 1 + weightOf(s));
  const top = [...byArtist.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a);
  if (!top.length) return '';
  return top.length > 3 ? `${top.slice(0, 3).join(', ')} and more` : top.join(', ');
}

function covers(songs: readonly Song[]): string[] {
  const out: string[] = [];
  for (const s of songs) {
    const id = s.coverArtId;
    if (id && !out.includes(id)) out.push(id);
    if (out.length === 4) break;
  }
  return out;
}

interface Cluster {
  id: string;
  name: string;
  songs: Song[];
  score: number;
}

export function buildDailyMixes(library: readonly Song[], history: readonly HistoryEntry[], opts: DailyMixOptions): DailyMix[] {
  const size = opts.size ?? 50;
  const max = opts.max ?? 6;
  const now = opts.now ?? Date.now();
  const songs = library.filter((s) => !s.liveStreamUrl);

  // how much you like each song: server play count, recent plays on this device, favourites, ratings
  const recentPlays = new Map<string, number>();
  const playedToday = new Set<string>();
  for (const e of history) {
    const at = Date.parse(e.playedAt) || 0;
    if (now - at < 90 * DAY_MS) recentPlays.set(e.song.id, (recentPlays.get(e.song.id) ?? 0) + 1);
    if (now - at < DAY_MS) playedToday.add(e.song.id);
  }
  const weight = new Map<string, number>();
  for (const s of songs) {
    const w = (s.playCount ?? 0) + 3 * (recentPlays.get(s.id) ?? 0) + (s.starred ? 4 : 0) + ((s.userRating ?? 0) >= 4 ? 3 : 0);
    if (w > 0) weight.set(s.id, w);
    const last = s.lastPlayed ? Date.parse(s.lastPlayed) : 0;
    if (last && now - last < DAY_MS) playedToday.add(s.id);
  }
  const weightOf = (s: Song) => weight.get(s.id) ?? 0;
  if (!weight.size) return [];

  // clusters: genres, or decades when there are fewer than two usable genres
  const group = (key: (s: Song) => string | null, label: (k: string, sample: Song) => string, prefix: string): Cluster[] => {
    const map = new Map<string, Cluster>();
    for (const s of songs) {
      const k = key(s);
      if (!k) continue;
      let c = map.get(k);
      if (!c) map.set(k, (c = { id: `${prefix}:${k}`, name: label(k, s), songs: [], score: 0 }));
      c.songs.push(s);
      c.score += weightOf(s);
    }
    return [...map.values()].filter((c) => c.score > 0 && c.songs.length >= MIN_CLUSTER).sort((a, b) => b.score - a.score);
  };
  let clusters = group(
    (s) => primaryGenre(s).toLowerCase() || null,
    (_k, s) => `${primaryGenre(s)} Mix`,
    'genre',
  );
  if (clusters.length < 2) {
    // too few genres tagged: decades, if they split the library better
    const decades = group(
      (s) => (s.year && s.year > 1900 ? String(Math.floor(s.year / 10) * 10) : null),
      (k) => `${Number(k) >= 2000 ? k : `${k.slice(2)}`}s Mix`,
      'decade',
    );
    if (decades.length > clusters.length) clusters = decades;
  }

  const used = new Set<string>();
  const mixes: DailyMix[] = [];
  const fresh = (s: Song) => !used.has(s.id) && !playedToday.has(s.id);

  for (const c of clusters.slice(0, Math.max(0, max - 1))) {
    const random = rng(hash(`${opts.day}|${opts.salt ?? 0}|${c.id}`));
    const artistWeight = new Map<string, number>();
    for (const s of c.songs) artistWeight.set(s.artist, (artistWeight.get(s.artist) ?? 0) + weightOf(s));
    const liked = c.songs.filter((s) => weightOf(s) > 0 && fresh(s));
    const unheard = c.songs.filter((s) => weightOf(s) === 0 && fresh(s));
    const wantFamiliar = Math.round(size * 0.6);
    let familiar = weightedSample(liked, (s) => Math.sqrt(weightOf(s)), wantFamiliar, random);
    // new to you, leaning towards artists you already play
    const discovery = weightedSample(unheard, (s) => 1 + (artistWeight.get(s.artist) ?? 0), size - familiar.length, random);
    if (familiar.length + discovery.length < size) {
      const taken = new Set(familiar.map((s) => s.id));
      familiar = familiar.concat(weightedSample(liked.filter((s) => !taken.has(s.id)), (s) => Math.sqrt(weightOf(s)), size - familiar.length - discovery.length, random));
    }
    const picked = familiar.concat(discovery);
    if (picked.length < MIN_CLUSTER) continue;
    picked.forEach((s) => used.add(s.id));
    const ordered = spreadArtists(picked, random);
    mixes.push({ id: c.id, name: c.name, description: describe(ordered, weightOf), songs: ordered, coverArtIds: covers(ordered) });
  }

  // Discovery: songs never played, by the artists you play most
  const artistTaste = new Map<string, number>();
  for (const s of songs) if (weightOf(s) > 0) artistTaste.set(s.artist, (artistTaste.get(s.artist) ?? 0) + weightOf(s));
  const random = rng(hash(`${opts.day}|${opts.salt ?? 0}|discover`));
  const candidates = songs.filter((s) => fresh(s) && weightOf(s) === 0 && (s.playCount ?? 0) === 0);
  const discover = weightedSample(candidates, (s) => 0.2 + (artistTaste.get(s.artist) ?? 0), size, random);
  if (discover.length >= MIN_CLUSTER && mixes.length < max) {
    const ordered = spreadArtists(discover, random);
    mixes.push({ id: 'discover', name: 'Discovery Mix', description: describe(ordered, (s) => artistTaste.get(s.artist) ?? 0), songs: ordered, coverArtIds: covers(ordered) });
  }
  return mixes;
}

/* ------------------------------------------------------------------ */
/* Today's mixes, kept for the whole day                               */
/* ------------------------------------------------------------------ */

export interface DailyMixesState {
  /** server|user the mixes were made for */
  scope: string;
  day: string;
  salt: number;
  mixes: DailyMix[];
  /** Stores freshly built mixes. */
  save(scope: string, day: string, salt: number, mixes: DailyMix[]): void;
}

export const dailyMixesStore = createStore<DailyMixesState>()(
  persist(
    (set) => ({
      scope: '',
      day: '',
      salt: 0,
      mixes: [],
      save(scope, day, salt, mixes) {
        set({ scope, day, salt, mixes });
      },
    }),
    {
      name: 'sonora.daily-mixes',
      storage: createJSONStorage(() => lazyStorage),
      skipHydration: true,
      partialize: ({ scope, day, salt, mixes }) => ({ scope, day, salt, mixes }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DailyMixesState>;
        return {
          ...current,
          scope: typeof p.scope === 'string' ? p.scope : '',
          day: typeof p.day === 'string' ? p.day : '',
          salt: typeof p.salt === 'number' ? p.salt : 0,
          mixes: Array.isArray(p.mixes) ? p.mixes.filter((m) => m && typeof m.id === 'string' && Array.isArray(m.songs)) : [],
        };
      },
    },
  ),
);

export function useDailyMixesStore<T>(selector: (s: DailyMixesState) => T): T {
  return useStore(dailyMixesStore, selector);
}

/**
 * Today's mixes. Built once a day (and for each server/user) from the whole
 * library; `remake()` builds a different set for today.
 */
export function useDailyMixes() {
  const scope = useStore(sessionStore, (s) => (s.session ? `${s.session.server.url}|${s.session.credentials.username}` : ''));
  const { mixes, day, salt, scope: madeFor } = useDailyMixesStore((s) => s);
  const today = localDay();
  const stale = Boolean(scope) && (madeFor !== scope || day !== today);
  const library = useLibrarySongs(stale);
  const qc = useQueryClient();
  const [remaking, setRemaking] = useState(false);

  useEffect(() => {
    if (!stale || !library.data) return;
    dailyMixesStore.getState().save(scope, today, 0, buildDailyMixes(library.data, historyStore.getState().entries, { day: today }));
  }, [stale, library.data, scope, today]);

  const remake = useCallback(async () => {
    if (!scope) return;
    setRemaking(true);
    try {
      const songs = await qc.fetchQuery({ queryKey: keys.librarySongs(scope), queryFn: ({ signal }) => fetchLibrarySongs(signal), staleTime: 10 * 60_000 });
      const next = salt + 1;
      dailyMixesStore.getState().save(scope, today, next, buildDailyMixes(songs, historyStore.getState().entries, { day: today, salt: next }));
    } finally {
      setRemaking(false);
    }
  }, [qc, scope, today, salt]);

  return {
    mixes: stale ? [] : mixes,
    loading: stale && !library.isError,
    error: stale && library.isError ? library.error : null,
    remaking,
    remake,
  };
}
