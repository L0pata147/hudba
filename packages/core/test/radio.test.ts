import { describe, expect, it, vi } from 'vitest';
import type { Song } from '@sonora/types';
import { createPlayerStore, type AudioEngine, type AudioEngineListener } from '../src/player';
import { createMemoryStorage } from '../src/platform';
import { currentItem } from '../src/queue';
import { buildProfile, pickCandidates, primaryArtistKey, scoreSong, type ScoringContext } from '../src/radio/scoring';
import { BATCH_SIZE, LOW_WATER, createRadioStore, type RadioApi } from '../src/radio/engine';
import { seeded } from './fixtures';

/* ---------------------------------------------------------------- */
/* Synthetic library                                                 */
/* ---------------------------------------------------------------- */

const GENRES: Record<string, { genre: string; mood: string; bpm: number; year: number }> = {
  metallica: { genre: 'Metal', mood: 'Aggressive', bpm: 100, year: 1991 },
  maiden: { genre: 'Metal', mood: 'Aggressive', bpm: 140, year: 1982 },
  slayer: { genre: 'Metal', mood: 'Aggressive', bpm: 180, year: 1986 },
  daft: { genre: 'Electronic', mood: 'Happy', bpm: 116, year: 2013 },
  justice: { genre: 'Electronic', mood: 'Energetic', bpm: 125, year: 2007 },
  air: { genre: 'Electronic', mood: 'Chill', bpm: 90, year: 1998 },
  miles: { genre: 'Jazz', mood: 'Chill', bpm: 80, year: 1959 },
  coltrane: { genre: 'Jazz', mood: 'Chill', bpm: 85, year: 1965 },
};

function makeLibrary(perArtist = 8): Song[] {
  const out: Song[] = [];
  for (const [artist, m] of Object.entries(GENRES)) {
    for (let i = 0; i < perArtist; i++) {
      out.push({
        id: `${artist}-${i}`,
        title: `${artist} ${i}`,
        artist,
        artistId: `ar-${artist}`,
        artists: [{ id: `ar-${artist}`, name: artist }],
        album: `${artist} album ${i % 2}`,
        albumId: `al-${artist}-${i % 2}`,
        genre: m.genre,
        genres: [m.genre],
        moods: [m.mood],
        bpm: m.bpm,
        year: m.year,
        duration: 200,
        starred: false,
      });
    }
  }
  return out;
}

function fakeApi(library: Song[], opts: { failing?: () => boolean } = {}) {
  const calls: string[] = [];
  const guard = <T>(name: string, v: T): Promise<T> => {
    calls.push(name);
    if (opts.failing?.()) return Promise.reject(new Error('network down'));
    return Promise.resolve(v);
  };
  const rnd = seeded(99);
  const api: RadioApi = {
    // Mimics Navidrome: similar = same genre, preferring the same artist.
    similarSongs: (id, count) => {
      const s = library.find((x) => x.id === id)!;
      return guard('similarSongs', library.filter((x) => x.genre === s.genre && x.id !== id).slice(0, count));
    },
    similarToArtist: (artistId, count) => {
      const genre = library.find((x) => x.artistId === artistId)?.genre;
      return guard('similarToArtist', library.filter((x) => x.genre === genre).slice(0, count));
    },
    randomSongs: ({ size, genre }) =>
      guard(
        `random:${genre ?? '*'}`,
        library
          .filter((s) => !genre || s.genre?.toLowerCase() === genre.toLowerCase())
          .map((s) => ({ s, k: rnd() }))
          .sort((a, b) => a.k - b.k)
          .slice(0, size)
          .map((x) => x.s),
      ),
    starredSongs: () => guard('starred', library.filter((s) => s.starred)),
    seedSongs: (seed) => guard('seed', seed.kind === 'album' ? library.filter((s) => s.albumId === seed.id) : library.filter((s) => s.artistId === seed.id)),
  };
  return { api, calls };
}

class SilentEngine implements AudioEngine {
  listener?: AudioEngineListener;
  setListener(l: AudioEngineListener) {
    this.listener = l;
  }
  load(_src: string, o: { autoplay: boolean }) {
    if (o.autoplay) queueMicrotask(() => this.listener?.onStatus('playing'));
  }
  play() {
    this.listener?.onStatus('playing');
  }
  pause() {
    this.listener?.onStatus('paused');
  }
  seek() {}
  setVolume() {}
  setMuted() {}
  stop() {}
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function setup(library = makeLibrary(), apiOpts: Parameters<typeof fakeApi>[1] = {}, storage = createMemoryStorage()) {
  const engine = new SilentEngine();
  const player = createPlayerStore({ getEngine: () => engine, resolveSource: async (s) => `x://${s.id}`, storage });
  engine.setListener({
    onStatus: (st, e) => player.getState().handleEngineStatus(st, e),
    onTime: (p, d, b) => player.getState().handleEngineTime(p, d, b),
  });
  const { api, calls } = fakeApi(library, apiOpts);
  const timers: (() => void)[] = [];
  const radio = createRadioStore({
    api: () => api,
    player,
    history: () => [],
    storage,
    random: seeded(7),
    setTimer: (fn) => {
      timers.push(fn);
      return fn;
    },
    clearTimer: () => undefined,
  });
  return { player, radio, calls, library, timers, storage, api };
}

/** Simulates listening to the current track to the end. */
function finishTrack(player: ReturnType<typeof setup>['player']) {
  player.getState().handleEngineTime(190, 200, 200);
  player.getState().handleEngineStatus('ended');
}

const upcoming = (player: ReturnType<typeof setup>['player']) => {
  const q = player.getState().queue;
  return q.items.slice(q.index + 1);
};

/* ---------------------------------------------------------------- */

describe('radio scoring', () => {
  const lib = makeLibrary();
  const seed = lib.find((s) => s.id === 'metallica-0')!;
  const ctx: ScoringContext = { profile: buildProfile([seed]), similarArtists: { 'ar-maiden': 1 }, feedback: {} };
  const score = (id: string, serverSimilar = false) => scoreSong(lib.find((s) => s.id === id)!, ctx, { serverSimilar }).total;

  it('ranks same artist > similar artist > same genre > other genres', () => {
    expect(score('metallica-3')).toBeGreaterThan(score('maiden-1'));
    expect(score('maiden-1')).toBeGreaterThan(score('slayer-1'));
    expect(score('slayer-1')).toBeGreaterThan(score('daft-1'));
    expect(score('daft-1')).toBeGreaterThanOrEqual(score('miles-1') - 0.05);
  });

  it('rewards server similarity, favorites and ratings; penalises skipped artists', () => {
    expect(score('slayer-1', true)).toBeGreaterThan(score('slayer-1'));
    const song = lib.find((s) => s.id === 'slayer-2')!;
    const base = scoreSong(song, ctx).total;
    expect(scoreSong({ ...song, starred: true }, ctx).total).toBeGreaterThan(base);
    expect(scoreSong({ ...song, userRating: 5 }, ctx).total).toBeGreaterThan(base);
    expect(scoreSong(song, { ...ctx, feedback: { 'ar-slayer': -0.3 } }).total).toBeLessThan(base);
  });

  it('treats missing metadata as neutral instead of failing', () => {
    const bare: Song = { id: 'x', title: 'x', artist: 'Unknown', artists: [], duration: 100, starred: false };
    const r = scoreSong(bare, ctx);
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.meta).toBeCloseTo(0.5);
  });

  it('picks with weighted randomness, without duplicates, spreading artists', () => {
    const scored = lib.map((s) => ({ song: s, score: scoreSong(s, ctx).total }));
    const a = pickCandidates(scored, { count: 8, variety: 'balanced', random: seeded(1) });
    const b = pickCandidates(scored, { count: 8, variety: 'balanced', random: seeded(2) });
    expect(new Set(a.map((s) => s.id)).size).toBe(8);
    expect(a.map((s) => s.id)).not.toEqual(b.map((s) => s.id));
    // Artist gap of 3 for "balanced": no artist repeats within any window of 3.
    for (let i = 0; i + 2 < a.length; i++) expect(new Set(a.slice(i, i + 3).map(primaryArtistKey)).size).toBe(3);
    // Similar music dominates.
    expect(a.filter((s) => s.genre === 'Metal').length).toBeGreaterThanOrEqual(5);
  });

  it('"explore" reaches further than "close"', () => {
    const scored = lib.map((s) => ({ song: s, score: scoreSong(s, ctx).total }));
    let closeOther = 0;
    let exploreOther = 0;
    for (let i = 0; i < 30; i++) {
      closeOther += pickCandidates(scored, { count: 6, variety: 'close', random: seeded(i + 1) }).filter((s) => s.genre !== 'Metal').length;
      exploreOther += pickCandidates(scored, { count: 6, variety: 'explore', random: seeded(i + 1) }).filter((s) => s.genre !== 'Metal').length;
    }
    expect(exploreOther).toBeGreaterThan(closeOther);
  });
});

describe('radio engine', () => {
  it('plays the seed immediately and fills the queue in the background', async () => {
    const { player, radio, library } = setup();
    const seed = library.find((s) => s.id === 'daft-0')!;
    const started = radio.getState().start({ kind: 'song', id: seed.id, name: seed.title }, { song: seed });
    // Synchronously: the seed is already the current track, context is radio.
    expect(currentItem(player.getState().queue)?.song.id).toBe('daft-0');
    expect(player.getState().context?.type).toBe('radio');
    await started;
    await flush();
    const next = upcoming(player);
    expect(next).toHaveLength(BATCH_SIZE);
    expect(next.every((i) => i.radio && !i.manual)).toBe(true);
    expect(next.some((i) => i.song.id === 'daft-0')).toBe(false);
    expect(next.filter((i) => i.song.genre === 'Electronic').length).toBeGreaterThanOrEqual(5);
    expect(radio.getState().status).toBe('ready');
  });

  it('keeps refilling as songs end or are skipped, without repeating songs', async () => {
    const { player, radio, library } = setup();
    const seed = library.find((s) => s.id === 'miles-0')!;
    await radio.getState().start({ kind: 'song', id: seed.id, name: seed.title }, { song: seed });
    await flush();
    const played: string[] = [currentItem(player.getState().queue)!.song.id];
    for (let i = 0; i < 40; i++) {
      if (i % 3 === 0) player.getState().next(); // manual skip
      else finishTrack(player);
      await flush();
      played.push(currentItem(player.getState().queue)!.song.id);
      expect(upcoming(player).length).toBeGreaterThanOrEqual(LOW_WATER - 1);
    }
    expect(new Set(played).size).toBe(played.length);
  });

  it('works with a tiny library by relaxing the no-repeat rule, never repeating back-to-back', async () => {
    const tiny = makeLibrary(1).slice(0, 4);
    const { player, radio } = setup(tiny);
    await radio.getState().start({ kind: 'song', id: tiny[0]!.id, name: 'x' }, { song: tiny[0]! });
    await flush();
    let prev = currentItem(player.getState().queue)!.song.id;
    for (let i = 0; i < 25; i++) {
      finishTrack(player);
      await flush();
      const cur = currentItem(player.getState().queue)!.song.id;
      expect(cur).not.toBe(prev);
      prev = cur;
    }
    expect(player.getState().status).not.toBe('ended');
  });

  it('respects manual queue items', async () => {
    const { player, radio, library } = setup();
    const seed = library[0]!;
    await radio.getState().start({ kind: 'song', id: seed.id, name: seed.title }, { song: seed });
    await flush();
    const mine = library.find((s) => s.id === 'coltrane-5')!;
    player.getState().playNext([mine]);
    expect(upcoming(player)[0]?.song.id).toBe('coltrane-5');
    radio.getState().refresh();
    await flush();
    expect(upcoming(player)[0]).toMatchObject({ manual: true, song: { id: 'coltrane-5' } });
    expect(upcoming(player).slice(1).every((i) => i.radio)).toBe(true);
    // The manual pick plays next and radio carries on afterwards.
    finishTrack(player);
    await flush();
    expect(currentItem(player.getState().queue)?.song.id).toBe('coltrane-5');
    expect(player.getState().context?.type).toBe('radio');
  });

  it('starts from an album and uses more than one artist', async () => {
    const { player, radio } = setup();
    await radio.getState().start({ kind: 'album', id: 'al-justice-0', name: 'Cross' });
    await flush();
    const cur = currentItem(player.getState().queue)!.song;
    expect(cur.albumId).toBe('al-justice-0');
    const artists = new Set(upcoming(player).map((i) => i.song.artist));
    expect(artists.size).toBeGreaterThan(1);
  });

  it('ends when the user plays something else, and stop() keeps manual items', async () => {
    const { player, radio, library } = setup();
    await radio.getState().start({ kind: 'song', id: library[0]!.id, name: 'x' }, { song: library[0]! });
    await flush();
    player.getState().playNext([library[40]!]);
    radio.getState().stop();
    expect(radio.getState().session).toBeNull();
    expect(upcoming(player).map((i) => i.song.id)).toEqual([library[40]!.id]);

    await radio.getState().start({ kind: 'song', id: library[1]!.id, name: 'x' }, { song: library[1]! });
    await flush();
    player.getState().playSongs([library[50]!], 0, { context: { type: 'album', id: 'a' } });
    expect(radio.getState().session).toBeNull();
  });

  it('survives an offline server: plays the seed, reports, retries with backoff, then recovers', async () => {
    let down = true;
    const notify = vi.fn();
    const { player, radio, library, timers } = setup(undefined, { failing: () => down });
    await radio.getState().start({ kind: 'song', id: library[0]!.id, name: 'x' }, { song: library[0]! });
    await flush();
    // Playback of the chosen song is unaffected.
    expect(currentItem(player.getState().queue)?.song.id).toBe(library[0]!.id);
    expect(player.getState().status).toBe('playing');
    expect(radio.getState().status).toBe('error');
    expect(upcoming(player)).toHaveLength(0);
    expect(timers).toHaveLength(1); // one retry scheduled, no request storm
    radio.getState().ensureFilled();
    expect(timers).toHaveLength(1);
    void notify;
    down = false;
    timers.splice(0).forEach((t) => t());
    await flush();
    expect(radio.getState().status).toBe('ready');
    expect(upcoming(player)).toHaveLength(BATCH_SIZE);
  });

  it('continues after an app restart', async () => {
    const storage = createMemoryStorage();
    const a = setup(undefined, {}, storage);
    await a.radio.getState().start({ kind: 'song', id: a.library[0]!.id, name: 'Seed' }, { song: a.library[0]! });
    await flush();
    const seen = a.radio.getState().session!.seen.length;

    const b = setup(undefined, {}, storage);
    await b.player.persist.rehydrate();
    await b.radio.persist.rehydrate();
    expect(b.radio.getState().session?.seed.name).toBe('Seed');
    expect(b.player.getState().context?.type).toBe('radio');
    // Drain the queue: the restored session keeps adding new songs.
    b.player.getState().clearUpcomingRadio();
    b.radio.getState().ensureFilled();
    await flush();
    expect(upcoming(b.player).length).toBe(BATCH_SIZE);
    expect(b.radio.getState().session!.seen.length).toBeGreaterThan(seen);
  });

  it('learns from skips', async () => {
    const { player, radio, library } = setup();
    await radio.getState().start({ kind: 'song', id: 'daft-0', name: 'x' }, { song: library.find((s) => s.id === 'daft-0')! });
    await flush();
    finishTrack(player); // now on a radio item
    await flush();
    const skippedArtist = currentItem(player.getState().queue)!.song.artistId!;
    player.getState().handleEngineTime(5, 200, 200);
    player.getState().next();
    await flush();
    expect(radio.getState().session!.feedback[skippedArtist]).toBeLessThan(0);
  });

  it('uses few API requests (pool reuse)', async () => {
    const { player, radio, library, calls } = setup();
    await radio.getState().start({ kind: 'song', id: library[0]!.id, name: 'x' }, { song: library[0]! });
    await flush();
    for (let i = 0; i < 16; i++) {
      finishTrack(player);
      await flush();
    }
    // 17 songs played; requests stay small (similar per new anchor + occasional genre/random fetches).
    expect(calls.length).toBeLessThan(40);
  });
});

vi.setConfig({ testTimeout: 15_000 });

describe('radio seeds', () => {
  it('genre/artist seeds play songs from the seed itself, not only neighbours', async () => {
    const lib = makeLibrary();
    const { player, radio, api } = setup(lib);
    api.seedSongs = async () => lib.filter((s) => s.genre === 'Jazz');
    await radio.getState().start({ kind: 'genre', id: 'Jazz', name: 'Jazz' });
    await flush();
    const firstBatch = upcoming(player).map((i) => i.song);
    expect(firstBatch.filter((s) => s.genre === 'Jazz').length).toBeGreaterThanOrEqual(3);
    expect(radio.getState().session?.seed.coverArtId).toBe(currentItem(player.getState().queue)?.song.coverArtId);
  });
});

describe('radio history window', () => {
  it('skips songs played in the last hours but allows older plays', async () => {
    const lib = makeLibrary();
    const jazz = lib.filter((s) => s.genre === 'Jazz');
    const nowMs = Date.parse('2026-01-01T20:00:00Z');
    const history = [
      ...jazz.slice(0, 8).map((song) => ({ song, playedAt: new Date(nowMs - 3600_000).toISOString() })), // 1 h ago
      ...jazz.slice(8).map((song) => ({ song, playedAt: new Date(nowMs - 3 * 24 * 3600_000).toISOString() })), // 3 days ago
    ];
    const engine = new SilentEngine();
    const player = createPlayerStore({ getEngine: () => engine, resolveSource: async (s) => s.id });
    engine.setListener({ onStatus: (st) => player.getState().handleEngineStatus(st), onTime: () => undefined });
    const { api } = fakeApi(lib);
    const radio = createRadioStore({ api: () => api, player, history: () => history, random: seeded(3), now: () => nowMs, setTimer: () => 0, clearTimer: () => undefined });
    const seed = jazz[0]!;
    await radio.getState().start({ kind: 'song', id: seed.id, name: seed.title }, { song: seed });
    await flush();
    const picked = upcoming(player).map((i) => i.song.id);
    for (const s of jazz.slice(1, 8)) expect(picked).not.toContain(s.id);
    expect(picked.some((id) => jazz.slice(8).some((s) => s.id === id))).toBe(true);
  });
});
