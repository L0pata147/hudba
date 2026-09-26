/**
 * Radio recommendation math — pure functions, no I/O.
 *
 * A "profile" describes what the radio is about (artists, genres, moods,
 * tempo, era). Candidates are scored against it, then picked with weighted
 * randomness plus diversity rules, so the result is similar but not
 * predictable.
 */
import type { Song } from '@sonora/types';

export type RadioVariety = 'close' | 'balanced' | 'explore';

/** Weights are 0..1 (max-normalized). Keys: artist ids, lowercase names/genres/moods. */
export interface RadioProfile {
  artists: Record<string, number>;
  artistNames: Record<string, number>;
  genres: Record<string, number>;
  moods: Record<string, number>;
  bpm?: number;
  year?: number;
  /** Original spelling of genres (keys of `genres` are lowercase). */
  genreLabels?: Record<string, string>;
}

export const EMPTY_PROFILE: RadioProfile = { artists: {}, artistNames: {}, genres: {}, moods: {} };

const norm = (s: string) => s.trim().toLowerCase();

function normalize(map: Record<string, number>): Record<string, number> {
  const max = Math.max(0, ...Object.values(map));
  if (max <= 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) if (v > 0) out[k] = v / max;
  return out;
}

function median(values: number[]): number | undefined {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return undefined;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1]! + v[mid]!) / 2;
}

export function songGenres(s: Song): string[] {
  const list = s.genres?.length ? s.genres : s.genre ? [s.genre] : [];
  return list.map(norm).filter(Boolean);
}

export function songArtistIds(s: Song): string[] {
  const ids = s.artists.map((a) => a.id).filter(Boolean);
  if (s.artistId && !ids.includes(s.artistId)) ids.unshift(s.artistId);
  return ids;
}

/** The artist used for diversity rules (first credited artist, or the name). */
export function primaryArtistKey(s: Song): string {
  return s.artistId ?? s.artists[0]?.id ?? `name:${norm(s.artist)}`;
}

/** Builds a profile from seed songs (optionally weighted per song). */
export function buildProfile(songs: readonly Song[], weightOf: (s: Song) => number = () => 1): RadioProfile {
  const artists: Record<string, number> = {};
  const artistNames: Record<string, number> = {};
  const genres: Record<string, number> = {};
  const moods: Record<string, number> = {};
  const genreLabels: Record<string, string> = {};
  for (const s of songs) {
    for (const g of s.genres?.length ? s.genres : s.genre ? [s.genre] : []) genreLabels[norm(g)] ??= g;
    const w = weightOf(s);
    for (const id of songArtistIds(s)) artists[id] = (artists[id] ?? 0) + w;
    artistNames[norm(s.artist)] = (artistNames[norm(s.artist)] ?? 0) + w;
    const gs = songGenres(s);
    for (const g of gs) genres[g] = (genres[g] ?? 0) + w / Math.max(1, gs.length);
    for (const m of s.moods ?? []) moods[norm(m)] = (moods[norm(m)] ?? 0) + w;
  }
  return {
    artists: normalize(artists),
    artistNames: normalize(artistNames),
    genres: normalize(genres),
    moods: normalize(moods),
    bpm: median(songs.map((s) => s.bpm ?? 0)),
    year: median(songs.map((s) => s.year ?? 0)),
    genreLabels,
  };
}

/** Mixes two profiles: `wb` is the share of `b` (0..1). Used for gentle drift. */
export function blendProfiles(a: RadioProfile, b: RadioProfile, wb: number): RadioProfile {
  const mix = (x: Record<string, number>, y: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) out[k] = (x[k] ?? 0) * (1 - wb) + (y[k] ?? 0) * wb;
    return normalize(out);
  };
  const num = (x?: number, y?: number) => (x == null ? y : y == null ? x : x * (1 - wb) + y * wb);
  return {
    artists: mix(a.artists, b.artists),
    artistNames: mix(a.artistNames, b.artistNames),
    genres: mix(a.genres, b.genres),
    moods: mix(a.moods, b.moods),
    bpm: num(a.bpm, b.bpm),
    year: num(a.year, b.year),
    genreLabels: { ...b.genreLabels, ...a.genreLabels },
  };
}

export interface CandidateSignals {
  /** Song came from Navidrome's getSimilarSongs/getSimilarSongs2 for the current anchor. */
  serverSimilar?: boolean;
}

export interface ScoringContext {
  profile: RadioProfile;
  /** Artists related to the seed (from server similarity results), 0..1. */
  similarArtists: Record<string, number>;
  /** Per-artist feedback in this session: skips negative, completions/likes positive. */
  feedback: Record<string, number>;
}

export interface ScoreBreakdown {
  total: number;
  artist: number;
  genre: number;
  meta: number;
  server: number;
  preference: number;
}

/** Weights of the scoring formula (sum = 1 before feedback). */
export const WEIGHTS = { artist: 0.3, genre: 0.25, meta: 0.15, server: 0.15, preference: 0.15 } as const;

function overlap(profileMap: Record<string, number>, keys: string[]): number {
  if (!keys.length) return 0;
  let sum = 0;
  for (const k of keys) sum += profileMap[k] ?? 0;
  // Songs with many tags should not win just by listing more of them.
  return Math.min(1, sum / Math.sqrt(keys.length));
}

export function scoreSong(song: Song, ctx: ScoringContext, signals: CandidateSignals = {}): ScoreBreakdown {
  const { profile } = ctx;
  const ids = songArtistIds(song);

  // Artist: seed artists count fully, related artists partially, names as a fallback.
  let artist = 0;
  for (const id of ids) artist = Math.max(artist, profile.artists[id] ?? 0, (ctx.similarArtists[id] ?? 0) * 0.7);
  artist = Math.max(artist, (profile.artistNames[norm(song.artist)] ?? 0) * 0.9);

  const genre = overlap(profile.genres, songGenres(song));

  // Metadata: mood tags, tempo and era. Missing data is neutral (0.5), not a penalty.
  const moodKeys = (song.moods ?? []).map(norm);
  const mood = moodKeys.length && Object.keys(profile.moods).length ? overlap(profile.moods, moodKeys) : 0.5;
  const bpm = song.bpm && profile.bpm ? Math.exp(-Math.abs(song.bpm - profile.bpm) / 18) : 0.5;
  const year = song.year && profile.year ? Math.exp(-Math.abs(song.year - profile.year) / 12) : 0.5;
  const meta = 0.45 * mood + 0.35 * bpm + 0.2 * year;

  const server = signals.serverSimilar ? 1 : 0;

  // User preference: favorites > ratings > play count; unknown is mildly neutral.
  let preference = 0.3;
  if (song.starred) preference = 1;
  else if (song.userRating) preference = Math.max(0, (song.userRating - 1) / 4);
  else if (song.playCount) preference = Math.min(0.9, 0.3 + Math.log10(1 + song.playCount) / 3);

  let fb = 0;
  for (const id of ids) fb += ctx.feedback[id] ?? 0;
  fb = Math.max(-0.4, Math.min(0.2, fb));

  const total =
    WEIGHTS.artist * artist + WEIGHTS.genre * genre + WEIGHTS.meta * meta + WEIGHTS.server * server + WEIGHTS.preference * preference + fb;
  return { total, artist, genre, meta, server, preference };
}

export interface ScoredCandidate {
  song: Song;
  score: number;
}

const TEMPERATURE: Record<RadioVariety, number> = { close: 0.03, balanced: 0.05, explore: 0.09 };
/** Candidates scoring more than this below the best one are only reachable as surprises. */
const QUALITY_WINDOW: Record<RadioVariety, number> = { close: 0.2, balanced: 0.3, explore: 0.45 };
/** Chance per pick to draw a "pleasant surprise" from the wider pool. */
const SURPRISE: Record<RadioVariety, number> = { close: 0.03, balanced: 0.12, explore: 0.25 };
/** An artist may not repeat within this many picks (including recent radio tracks). */
export const ARTIST_GAP: Record<RadioVariety, number> = { close: 2, balanced: 3, explore: 4 };

export interface PickOptions {
  count: number;
  variety: RadioVariety;
  /** Primary artist keys of the most recent radio tracks (most recent last). */
  recentArtists?: string[];
  random?: () => number;
}

/**
 * Picks `count` songs without replacement using softmax-weighted randomness
 * (Efraimidis–Spirakis keys), an artist-gap diversity rule and occasional
 * surprise picks from the lower-scored part of the pool.
 */
export function pickCandidates(candidates: readonly ScoredCandidate[], opts: PickOptions): Song[] {
  const random = opts.random ?? Math.random;
  const temp = TEMPERATURE[opts.variety];
  const gap = ARTIST_GAP[opts.variety];
  const pool = [...candidates].sort((a, b) => b.score - a.score);
  if (!pool.length) return [];
  const picked: Song[] = [];
  const recent = [...(opts.recentArtists ?? [])];
  let lastAlbum: string | undefined;

  while (picked.length < opts.count && pool.length) {
    const surprise = random() < SURPRISE[opts.variety];
    const t = surprise ? temp * 3 : temp;
    const floor = pool[0]!.score - QUALITY_WINDOW[opts.variety] * (surprise ? 1.6 : 1);
    const blocked = new Set(recent.slice(-gap));
    let bestKey = -Infinity;
    let chosen = -1;
    // Pass 0: diversity + quality floor. Pass 1: diversity only. Pass 2: anything (tiny/uniform pools).
    for (let pass = 0; pass < 3 && chosen === -1; pass++) {
      pool.forEach((c, i) => {
        if (pass < 2 && (blocked.has(primaryArtistKey(c.song)) || (lastAlbum && c.song.albumId === lastAlbum))) return;
        if (pass === 0 && c.score < floor) return;
        const w = Math.exp((c.score - pool[0]!.score) / t);
        const key = Math.log(Math.max(random(), 1e-12)) / w;
        if (key > bestKey) {
          bestKey = key;
          chosen = i;
        }
      });
    }
    if (chosen === -1) break;
    const [c] = pool.splice(chosen, 1);
    picked.push(c!.song);
    recent.push(primaryArtistKey(c!.song));
    lastAlbum = c!.song.albumId;
  }
  return picked;
}
