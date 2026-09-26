/**
 * Radio controller: turns a seed (song, album, artist, playlist or genre)
 * into an endless, self-refilling queue.
 *
 * - Playback starts immediately; recommendations are generated in the
 *   background and appended as `radio` queue items.
 * - When fewer than LOW_WATER radio songs are left, the next batch is added.
 * - Manual queue items ("Play next", "Add to queue") are never touched.
 * - The session (seed, taste profile, already-queued songs, feedback) is
 *   persisted, so Radio continues after an app restart.
 */
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { HistoryEntry, QueueItem, Song } from '@sonora/types';
import { randomString, uniqueBy } from '@sonora/utils';
import { currentItem } from '../queue';
import { createMemoryStorage } from '../platform';
import type { PlayerStore } from '../player';
import {
  blendProfiles,
  buildProfile,
  pickCandidates,
  primaryArtistKey,
  scoreSong,
  songArtistIds,
  songGenres,
  type RadioProfile,
  type RadioVariety,
} from './scoring';

export type RadioSeed =
  | { kind: 'song'; id: string; name: string; subtitle?: string; coverArtId?: string }
  | { kind: 'album' | 'artist' | 'playlist' | 'genre'; id: string; name: string; subtitle?: string; coverArtId?: string };

/** Only the API calls Radio needs — easy to fake in tests. */
export interface RadioApi {
  similarSongs(songId: string, count: number): Promise<Song[]>;
  similarToArtist(artistId: string, count: number): Promise<Song[]>;
  randomSongs(opts: { size: number; genre?: string }): Promise<Song[]>;
  starredSongs(): Promise<Song[]>;
  seedSongs(seed: RadioSeed): Promise<Song[]>;
}

export interface RadioSession {
  id: string;
  seed: RadioSeed;
  variety: RadioVariety;
  startedAt: string;
  /** Profile of the seed — the radio's "home". */
  baseProfile: RadioProfile;
  /** Current profile: the seed blended with what was actually listened to. */
  profile: RadioProfile;
  similarArtists: Record<string, number>;
  feedback: Record<string, number>;
  /** Song ids Radio has already queued in this session (never repeated unless the library runs dry). */
  seen: string[];
  /** Primary artists of the latest radio picks, for the diversity rule. */
  recentArtists: string[];
  /** Recently completed songs; the newest one anchors server similarity lookups. */
  anchors: Song[];
}

export type RadioStatus = 'idle' | 'loading' | 'ready' | 'error' | 'exhausted';

export interface RadioState {
  session: RadioSession | null;
  status: RadioStatus;
  error: string | null;
  start(seed: RadioSeed, opts?: { song?: Song; variety?: RadioVariety }): Promise<void>;
  stop(): void;
  setVariety(variety: RadioVariety): void;
  /** Re-centres the radio on the song that is playing now. */
  steerFromCurrent(): void;
  /** Replaces the upcoming radio songs with a fresh selection. */
  refresh(): void;
  /** Checks the queue and adds songs if needed (called automatically). */
  ensureFilled(): void;
}

export interface RadioDeps {
  api: () => RadioApi | null;
  player: PlayerStore;
  history: () => HistoryEntry[];
  storage?: StateStorage;
  notify?: (kind: 'error' | 'info', message: string) => void;
  random?: () => number;
  now?: () => number;
  /** Scheduler for retries (overridable in tests). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export const LOW_WATER = 3;
export const BATCH_SIZE = 8;
const SEEN_CAP = 1500;
const RETRY_DELAYS = [5_000, 15_000, 30_000, 60_000, 120_000];
const DRIFT: Record<RadioVariety, number> = { close: 0.15, balanced: 0.3, explore: 0.5 };

interface PoolEntry {
  song: Song;
  serverSimilar: boolean;
}

export type RadioStore = Mutate<StoreApi<RadioState>, [['zustand/persist', unknown]]>;

export function isRadioItem(item: QueueItem | undefined): boolean {
  return Boolean(item?.radio);
}

export function createRadioStore(deps: RadioDeps): RadioStore {
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));

  // In-memory only: rebuilt on demand after a restart.
  let pool = new Map<string, PoolEntry>();
  const fetchedAnchors = new Set<string>();
  let starredCache: { at: number; songs: Song[] } | null = null;
  let running: Promise<void> | null = null;
  let retryTimer: unknown = null;
  let failures = 0;

  const resetEphemeral = () => {
    pool = new Map();
    fetchedAnchors.clear();
    failures = 0;
    if (retryTimer) clearTimer(retryTimer);
    retryTimer = null;
  };

  const initializer = (set: StoreApi<RadioState>['setState'], get: StoreApi<RadioState>['getState']): RadioState => {
    const player = deps.player;

    const isActive = (): boolean => {
      const s = get().session;
      const ctx = player.getState().context;
      return Boolean(s && ctx?.type === 'radio' && ctx.id === s.id);
    };

    const patchSession = (patch: Partial<RadioSession>) => {
      const s = get().session;
      if (s) set({ session: { ...s, ...patch } });
    };

    const upcomingRadioCount = () => {
      const q = player.getState().queue;
      return q.items.slice(q.index + 1).filter((i) => i.radio).length;
    };

    const addToPool = (songs: Song[], serverSimilar: boolean) => {
      for (const song of songs) {
        const prev = pool.get(song.id);
        pool.set(song.id, { song, serverSimilar: serverSimilar || Boolean(prev?.serverSimilar) });
      }
    };

    /** Related artists learnt from server similarity results (decaying average). */
    const learnSimilarArtists = (songs: Song[]) => {
      const s = get().session;
      if (!s || !songs.length) return;
      const counts: Record<string, number> = {};
      for (const song of songs) for (const id of songArtistIds(song)) counts[id] = (counts[id] ?? 0) + 1;
      const max = Math.max(...Object.values(counts));
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(s.similarArtists)) next[k] = v * 0.8;
      for (const [k, v] of Object.entries(counts)) next[k] = Math.min(1, (next[k] ?? 0) + v / max);
      patchSession({ similarArtists: next });
    };

    const topGenres = (profile: RadioProfile, n: number) =>
      Object.entries(profile.genres)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([g]) => profile.genreLabels?.[g] ?? g);

    /** Exclusion sets from strict to relaxed, for small libraries / long sessions. */
    const exclusionLevels = (session: RadioSession): Set<string>[] => {
      const q = player.getState().queue;
      const t = now();
      // History is time-windowed: a song played this evening is skipped, last week's favourite may return.
      const playedWithin = (ms: number, max: number) =>
        deps
          .history()
          .slice(0, max)
          .filter((h) => t - new Date(h.playedAt).getTime() < ms)
          .map((h) => h.song.id);
      const current = currentItem(q)?.song.id;
      const upcoming = q.items.slice(Math.max(0, q.index)).map((i) => i.song.id);
      const recentQueue = q.items.slice(Math.max(0, q.index - 10), q.index).map((i) => i.song.id);
      return [
        // Strict: nothing already queued this session or played in the last 3 hours.
        new Set([...q.items.map((i) => i.song.id), ...session.seen, ...playedWithin(3 * 3600_000, 300)]),
        // Relaxed (long sessions / small libraries): nothing from the last ~60 picks or 30 minutes.
        new Set([...upcoming, ...recentQueue, ...session.seen.slice(-60), ...playedWithin(30 * 60_000, 50)]),
        // Last resort: just avoid what is queued and the last few songs.
        new Set([...upcoming, ...recentQueue, ...(current ? [current] : [])]),
      ];
    };

    const candidatesFor = (excluded: Set<string>) => [...pool.values()].filter((e) => !excluded.has(e.song.id));

    /** Fetches candidate sources, widening from "very similar" to "whole library". */
    const gatherCandidates = async (api: RadioApi, session: RadioSession, needed: number): Promise<PoolEntry[]> => {
      const strict = () => candidatesFor(exclusionLevels(get().session ?? session)[0]!);
      const errors: unknown[] = [];
      const attempt = async <T>(p: Promise<T>): Promise<T | null> => {
        try {
          return await p;
        } catch (e) {
          errors.push(e);
          return null;
        }
      };

      // 1) Server similarity for the newest anchor (song + its artist) — only once per anchor.
      const anchor = session.anchors.at(-1);
      if (anchor && !fetchedAnchors.has(anchor.id)) {
        fetchedAnchors.add(anchor.id);
        const [bySong, byArtist] = await Promise.all([
          attempt(api.similarSongs(anchor.id, 50)),
          anchor.artistId ? attempt(api.similarToArtist(anchor.artistId, 40)) : Promise.resolve(null),
        ]);
        const similar = uniqueBy([...(bySong ?? []), ...(byArtist ?? [])], (s) => s.id);
        addToPool(similar, true);
        learnSimilarArtists(similar.filter((s) => s.id !== anchor.id));
      }

      // 2) Same genres and the user's favorites, when the pool runs low.
      if (strict().length < needed * 3) {
        const genres = topGenres(get().session?.profile ?? session.profile, 2);
        const results = await Promise.all(genres.map((g) => attempt(api.randomSongs({ size: 40, genre: g }))));
        results.forEach((r) => r && addToPool(r, false));
        if (!starredCache || now() - starredCache.at > 10 * 60_000) {
          const starred = await attempt(api.starredSongs());
          if (starred) starredCache = { at: now(), songs: starred };
        }
        if (starredCache) addToPool(starredCache.songs, false);
      }

      // 3) Widen to the whole library (random sample) as a last resort / for surprises.
      if (strict().length < needed * 2) {
        const r = await attempt(api.randomSongs({ size: 80 }));
        if (r) addToPool(r, false);
      }

      if (!pool.size && errors.length) throw errors[0];

      // Choose the strictest exclusion level that still leaves enough songs.
      const levels = exclusionLevels(get().session ?? session);
      for (const level of levels) {
        const c = candidatesFor(level);
        if (c.length >= needed) return c;
      }
      return candidatesFor(levels[levels.length - 1]!);
    };

    const refill = async (count: number) => {
      const session = get().session;
      const api = deps.api();
      if (!session || !api || !isActive()) return;
      set({ status: 'loading' });
      try {
        const candidates = await gatherCandidates(api, session, count);
        const latest = get().session;
        if (!latest || latest.id !== session.id || !isActive()) return; // stopped meanwhile
        const scored = candidates.map((c) => ({
          song: c.song,
          score: scoreSong(c.song, { profile: latest.profile, similarArtists: latest.similarArtists, feedback: latest.feedback }, { serverSimilar: c.serverSimilar })
            .total,
        }));
        const picked = pickCandidates(scored, { count, variety: latest.variety, recentArtists: latest.recentArtists, random });
        if (!picked.length) {
          set({ status: 'exhausted', error: null });
          deps.notify?.('info', 'Radio has run out of songs to add from your library.');
          return;
        }
        for (const s of picked) pool.delete(s.id);
        const before = player.getState();
        const firstNewIndex = before.queue.items.length;
        player.getState().appendRadio(picked);
        // If playback had stopped at the end of the queue, continue with the new songs.
        if (before.status === 'ended') {
          const item = player.getState().queue.items[firstNewIndex];
          if (item) player.getState().playItem(item.uid);
        }
        patchSession({
          seen: [...latest.seen, ...picked.map((s) => s.id)].slice(-SEEN_CAP),
          recentArtists: [...latest.recentArtists, ...picked.map(primaryArtistKey)].slice(-12),
        });
        failures = 0;
        set({ status: 'ready', error: null });
      } catch (err) {
        failures++;
        const message = err instanceof Error ? err.message : 'Radio could not load songs';
        set({ status: 'error', error: message });
        if (failures === 1) deps.notify?.('error', 'Radio can’t reach your server right now — it will keep trying.');
        const delay = RETRY_DELAYS[Math.min(failures - 1, RETRY_DELAYS.length - 1)]!;
        retryTimer = setTimer(() => {
          retryTimer = null;
          get().ensureFilled();
        }, delay);
      }
    };

    const ensureFilled = () => {
      if (!isActive() || running || retryTimer) return;
      if (get().status === 'exhausted' && upcomingRadioCount() > 0) return;
      if (upcomingRadioCount() >= LOW_WATER) return;
      running = refill(BATCH_SIZE).finally(() => {
        running = null;
      });
    };

    return {
      session: null,
      status: 'idle',
      error: null,

      async start(seed, opts = {}) {
        const api = deps.api();
        if (!api) throw new Error('Not signed in');
        resetEphemeral();
        const id = `radio-${randomString(8)}`;
        const context = { type: 'radio' as const, id, name: `${seed.name} Radio` };
        const variety = opts.variety ?? get().session?.variety ?? 'balanced';
        set({ status: 'loading', error: null });

        let seedSongs: Song[];
        let first: Song | undefined = opts.song;
        if (seed.kind === 'song' && first) {
          // Start the chosen song right away; everything else happens in the background.
          seedSongs = [first];
          player.getState().playSongs([first], 0, { context, shuffle: false });
        } else {
          try {
            seedSongs = await api.seedSongs(seed);
          } catch (err) {
            set({ status: 'error', error: err instanceof Error ? err.message : 'Could not start radio' });
            throw err;
          }
          if (!seedSongs.length) {
            set({ status: 'exhausted' });
            throw new Error('There is nothing to base this radio on yet.');
          }
          // Start with a song from the seed, favouring favorites and frequently played tracks.
          first ??= pickCandidates(
            seedSongs.map((s) => ({ song: s, score: (s.starred ? 0.3 : 0) + Math.min(0.3, (s.playCount ?? 0) / 50) })),
            { count: 1, variety: 'explore', random },
          )[0];
          if (!first) return;
          player.getState().playSongs([first], 0, { context, shuffle: false });
        }

        const baseProfile = buildProfile(seedSongs);
        set({
          session: {
            id,
            seed: seed.coverArtId ? seed : { ...seed, coverArtId: first.coverArtId },
            variety,
            startedAt: new Date(now()).toISOString(),
            baseProfile,
            profile: baseProfile,
            similarArtists: {},
            feedback: {},
            // Only the first song counts as played; the other seed songs are prime candidates.
            seen: [first.id],
            recentArtists: [primaryArtistKey(first)],
            anchors: [first],
          },
        });
        // Seed songs (other album tracks, playlist entries) are good candidates too.
        addToPool(seedSongs.filter((s) => s.id !== first!.id), false);
        get().ensureFilled();
      },

      stop() {
        resetEphemeral();
        const s = get().session;
        set({ session: null, status: 'idle', error: null });
        const p = player.getState();
        if (s && p.context?.type === 'radio' && p.context.id === s.id) {
          p.clearUpcomingRadio();
          p.setContext({ type: 'queue', name: 'Queue' });
        }
      },

      setVariety(variety) {
        patchSession({ variety });
        get().refresh();
      },

      steerFromCurrent() {
        const s = get().session;
        const cur = currentItem(player.getState().queue)?.song;
        if (!s || !cur) return;
        const baseProfile = buildProfile([cur]);
        patchSession({
          seed: { kind: 'song', id: cur.id, name: cur.title, subtitle: cur.artist, coverArtId: cur.coverArtId },
          baseProfile,
          profile: baseProfile,
          similarArtists: {},
          anchors: [cur],
        });
        player.getState().setContext({ type: 'radio', id: s.id, name: `${cur.title} Radio` });
        pool = new Map();
        fetchedAnchors.clear();
        get().refresh();
      },

      refresh() {
        if (!isActive()) return;
        player.getState().clearUpcomingRadio();
        if (get().status === 'exhausted') set({ status: 'ready' });
        get().ensureFilled();
      },

      ensureFilled,
    };
  };

  const store = createStore<RadioState>()(
    persist(initializer, {
      name: 'sonora.radio',
      version: 1,
      storage: createJSONStorage(() => deps.storage ?? createMemoryStorage()),
      skipHydration: true,
      partialize: (s) => ({ session: s.session }),
      merge: (persisted, current) => ({ ...current, session: (persisted as { session?: RadioSession | null })?.session ?? null }),
    }),
  );

  // --- React to playback: session end, listening feedback, drift, refills ---
  let lastItem: QueueItem | undefined;
  let lastPosition = 0;
  let lastDuration = 0;
  deps.player.subscribe((p, prev) => {
    const state = store.getState();
    const session = state.session;
    if (!session) return;

    // Playing something else ends the radio session.
    if (p.context?.type !== 'radio' || p.context.id !== session.id) {
      if (prev.context?.type === 'radio' && prev.context.id === session.id) {
        resetEphemeral();
        store.setState({ session: null, status: 'idle', error: null });
      }
      return;
    }

    const cur = currentItem(p.queue);
    if (lastItem && cur && cur.uid !== lastItem.uid) {
      const finished = lastDuration > 0 && lastPosition >= Math.min(lastDuration * 0.5, 240);
      const skipped = !finished && lastPosition < Math.min(30, lastDuration * 0.4 || 30);
      const song = lastItem.song;
      const fb = { ...session.feedback };
      const artistIds = songArtistIds(song);
      const movedForward = p.queue.index > prev.queue.index || prev.queue.index === -1;
      if (skipped && movedForward && lastItem.radio) for (const id of artistIds) fb[id] = (fb[id] ?? 0) - 0.12;
      if (finished) for (const id of artistIds) fb[id] = (fb[id] ?? 0) + 0.04;
      let patch: Partial<RadioSession> = { feedback: fb };
      if (finished || song.starred) {
        // Gently drift towards what the listener actually enjoys.
        const anchors = uniqueBy([...session.anchors, song], (s) => s.id).slice(-6);
        patch = {
          ...patch,
          anchors,
          profile: blendProfiles(session.baseProfile, buildProfile(anchors), DRIFT[session.variety]),
        };
      }
      store.setState({ session: { ...session, ...patch } });
    }
    lastItem = cur;
    lastPosition = p.position;
    lastDuration = p.duration;
    state.ensureFilled();
  });

  return store;
}

/** Genres present in a song list, most common first (for Radio start suggestions). */
export function genresOf(songs: Song[]): string[] {
  const counts: Record<string, number> = {};
  for (const s of songs) for (const g of songGenres(s)) counts[g] = (counts[g] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);
}
