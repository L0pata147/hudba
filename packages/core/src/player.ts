/**
 * Platform-independent player: queue + playback state machine.
 *
 * The store never touches audio APIs directly. It drives an `AudioEngine`
 * (HTMLAudioElement on web/desktop, expo-audio on mobile) and receives
 * status/time callbacks from it. This keeps all the playback rules — queue
 * advancing, repeat, shuffle, "previous restarts the track", scrobble
 * thresholds, crossfade triggering, resume — in one tested place.
 */
import { createStore, type Mutate, type StoreApi } from 'zustand/vanilla';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { PlaybackContext, PlaybackStatus, QueueItem, RepeatMode, Song } from '@sonora/types';
import { clamp } from '@sonora/utils';
import {
  EMPTY_QUEUE,
  append,
  buildQueue,
  clearUpcoming,
  currentItem,
  insertNext,
  jumpToIndex,
  jumpToUid,
  moveQueueItem,
  nextIndex,
  persistableQueue,
  previousIndex,
  removeItem,
  setShuffle,
  updateSongs,
  type QueueState,
} from './queue';
import { createMemoryStorage } from './platform';

export type EngineStatus = Exclude<PlaybackStatus, 'idle'>;

export interface AudioEngineListener {
  onStatus(status: EngineStatus, error?: string): void;
  /** seconds */
  onTime(position: number, duration: number, buffered: number): void;
}

export interface LoadOptions {
  autoplay: boolean;
  /** seconds */
  startAt?: number;
  song: Song;
  /** Crossfade duration in seconds for this transition (0 = hard cut). */
  crossfade?: number;
}

export interface AudioEngine {
  setListener(listener: AudioEngineListener): void;
  load(src: string, opts: LoadOptions): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Hint to fetch the next track early (gapless-ish transitions). */
  preload?(src: string): void;
  stop(): void;
}

export interface PlayerDeps {
  getEngine(): AudioEngine | null;
  /** Resolves a playable URL (offline file or stream URL). */
  resolveSource(song: Song): Promise<string>;
  /** Called when a track actually starts playing (once per queue entry). */
  onTrackStart?(song: Song, context: PlaybackContext | null): void;
  /** Called once per queue entry when the scrobble threshold is reached. */
  onTrackListened?(song: Song, context: PlaybackContext | null): void;
  /** Whether to preload the next track (near-gapless). Defaults to true. */
  getPreload?(): boolean;
  /** Crossfade seconds (read on every transition so settings apply live). */
  getCrossfade?(): number;
  /** Error reporter for UI toasts. */
  onError?(message: string, song?: Song): void;
  storage?: StateStorage;
  storageKey?: string;
  random?: () => number;
  now?: () => number;
}

export interface PlayerState {
  queue: QueueState;
  repeat: RepeatMode;
  context: PlaybackContext | null;
  status: PlaybackStatus;
  /** seconds */
  position: number;
  /** seconds */
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  error: string | null;
  /** uid of the queue item currently loaded into the engine */
  loadedUid: string | null;

  playSongs(songs: readonly Song[], startIndex?: number, opts?: { context?: PlaybackContext; shuffle?: boolean }): void;
  playItem(uid: string): void;
  play(): void;
  pause(): void;
  togglePlay(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  seekBy(delta: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  setRepeat(mode: RepeatMode): void;
  cycleRepeat(): void;
  playNext(songs: readonly Song[]): void;
  addToQueue(songs: readonly Song[]): void;
  removeFromQueue(uid: string): void;
  moveInQueue(from: number, to: number): void;
  clearQueue(): void;
  stop(): void;
  updateSong(songId: string, patch: Partial<Song>): void;
  /** Replaces the queue without starting playback (resume from server). */
  restoreQueue(songs: readonly Song[], currentId: string | undefined, positionSeconds: number): void;

  /** Engine callbacks */
  handleEngineStatus(status: EngineStatus, error?: string): void;
  handleEngineTime(position: number, duration: number, buffered: number): void;
  /** Must be called once the engine exists, to push volume etc. */
  attachEngine(): void;
}

export const RESTART_THRESHOLD_SECONDS = 3;
const REPEAT_CYCLE: RepeatMode[] = ['off', 'all', 'one'];

/** Last.fm rule: half the track or 4 minutes, and only tracks longer than 30 s. */
export function scrobbleThreshold(duration: number): number {
  if (!duration || duration <= 30) return Math.max(1, duration * 0.5);
  return Math.min(duration / 2, 240);
}

export type PlayerStore = Mutate<StoreApi<PlayerState>, [['zustand/persist', unknown]]>;

export function createPlayerStore(deps: PlayerDeps): PlayerStore {
  // Per-entry bookkeeping that should not be persisted or cause re-renders.
  let startedUid: string | null = null;
  let listenedUid: string | null = null;
  let listenedSeconds = 0;
  let lastTime = 0;
  let loadToken = 0;
  let preloadedUid: string | null = null;

  const engine = () => deps.getEngine();

  const initializer = (set: StoreApi<PlayerState>['setState'], get: StoreApi<PlayerState>['getState']): PlayerState => {
    const loadCurrent = (autoplay: boolean, startAt = 0, crossfade = 0) => {
      const item = currentItem(get().queue);
      const eng = engine();
      if (!item) {
        eng?.stop();
        set({ status: 'idle', position: 0, duration: 0, buffered: 0, loadedUid: null });
        return;
      }
      const token = ++loadToken;
      listenedSeconds = 0;
      lastTime = startAt;
      listenedUid = null;
      startedUid = null;
      preloadedUid = null;
      set({
        status: autoplay ? 'loading' : 'paused',
        position: startAt,
        duration: item.song.duration || 0,
        buffered: 0,
        error: null,
        loadedUid: eng ? item.uid : null,
      });
      if (!eng) return;
      deps
        .resolveSource(item.song)
        .then((src) => {
          if (token !== loadToken) return; // a newer load superseded this one
          eng.load(src, { autoplay, startAt, song: item.song, crossfade });
        })
        .catch((err: unknown) => {
          if (token !== loadToken) return;
          const message = err instanceof Error ? err.message : 'Could not load this track';
          set({ status: 'error', error: message });
          deps.onError?.(message, item.song);
        });
    };

    const goTo = (index: number, autoplay: boolean, crossfade = 0) => {
      set({ queue: jumpToIndex(get().queue, index) });
      loadCurrent(autoplay, 0, crossfade);
    };

    const isActive = () => {
      const s = get().status;
      return s === 'playing' || s === 'loading' || s === 'buffering';
    };

    const advanceAfterEnd = (crossfade = 0) => {
      const { queue, repeat } = get();
      const idx = nextIndex(queue, repeat, true);
      if (idx === -1) {
        // End of queue: rewind to the start but stay paused, like most players.
        engine()?.pause();
        set({ queue: jumpToIndex(queue, 0), status: 'ended', position: 0 });
        const first = currentItem(get().queue);
        if (first && first.uid !== get().loadedUid) loadCurrent(false);
        else engine()?.seek(0);
        return;
      }
      if (idx === queue.index) {
        // repeat-one: restart the same entry and count it as a new play.
        startedUid = null;
        listenedUid = null;
        listenedSeconds = 0;
        lastTime = 0;
        engine()?.seek(0);
        engine()?.play();
        return;
      }
      goTo(idx, true, crossfade);
    };

    return {
      queue: EMPTY_QUEUE,
      repeat: 'off',
      context: null,
      status: 'idle',
      position: 0,
      duration: 0,
      buffered: 0,
      volume: 0.8,
      muted: false,
      error: null,
      loadedUid: null,

      playSongs(songs, startIndex = 0, opts = {}) {
        if (!songs.length) return;
        const shuffle = opts.shuffle ?? get().queue.shuffled;
        set({ queue: buildQueue(songs, startIndex, { shuffle, random: deps.random }), context: opts.context ?? null });
        loadCurrent(true);
      },

      playItem(uid) {
        const q = jumpToUid(get().queue, uid);
        if (q === get().queue && currentItem(q)?.uid !== uid) return;
        set({ queue: q });
        loadCurrent(true);
      },

      play() {
        const { queue, loadedUid, position, status } = get();
        const item = currentItem(queue);
        if (!item) return;
        if (loadedUid !== item.uid || status === 'error') {
          loadCurrent(true, position);
          return;
        }
        if (status === 'ended') engine()?.seek(0);
        engine()?.play();
      },

      pause() {
        engine()?.pause();
        if (get().status === 'loading' || get().status === 'buffering') set({ status: 'paused' });
      },

      togglePlay() {
        if (isActive()) get().pause();
        else get().play();
      },

      next() {
        const { queue, repeat } = get();
        if (!queue.items.length) return;
        const idx = nextIndex(queue, repeat, false);
        if (idx === -1) {
          // Skipping past the last track stops at the beginning of the queue.
          engine()?.pause();
          set({ queue: jumpToIndex(queue, 0) });
          loadCurrent(false);
          return;
        }
        goTo(idx, true);
      },

      previous() {
        const { queue, repeat, position } = get();
        if (!queue.items.length) return;
        if (position > RESTART_THRESHOLD_SECONDS || (queue.index === 0 && repeat !== 'all')) {
          get().seek(0);
          if (!isActive()) get().play();
          return;
        }
        goTo(previousIndex(queue, repeat), true);
      },

      seek(seconds) {
        const { duration, loadedUid, queue } = get();
        const target = clamp(seconds, 0, duration > 0 ? duration : Number.MAX_SAFE_INTEGER);
        lastTime = target;
        set({ position: target });
        if (loadedUid && loadedUid === currentItem(queue)?.uid) engine()?.seek(target);
      },

      seekBy(delta) {
        get().seek(get().position + delta);
      },

      setVolume(volume) {
        const v = clamp(volume, 0, 1);
        set({ volume: v, muted: v === 0 ? get().muted : false });
        engine()?.setVolume(v);
        if (v > 0) engine()?.setMuted(false);
      },

      toggleMute() {
        const muted = !get().muted;
        set({ muted });
        engine()?.setMuted(muted);
      },

      toggleShuffle() {
        set({ queue: setShuffle(get().queue, !get().queue.shuffled, deps.random) });
        preloadedUid = null;
      },

      setRepeat(mode) {
        set({ repeat: mode });
      },

      cycleRepeat() {
        const i = REPEAT_CYCLE.indexOf(get().repeat);
        set({ repeat: REPEAT_CYCLE[(i + 1) % REPEAT_CYCLE.length] ?? 'off' });
      },

      playNext(songs) {
        const wasEmpty = !get().queue.items.length;
        set({ queue: insertNext(get().queue, songs) });
        preloadedUid = null;
        if (wasEmpty) loadCurrent(true);
      },

      addToQueue(songs) {
        const wasEmpty = !get().queue.items.length;
        set({ queue: append(get().queue, songs) });
        if (wasEmpty) loadCurrent(true);
      },

      removeFromQueue(uid) {
        const before = get().queue;
        const wasCurrent = currentItem(before)?.uid === uid;
        const wasActive = isActive();
        set({ queue: removeItem(before, uid) });
        preloadedUid = null;
        if (wasCurrent) loadCurrent(wasActive);
      },

      moveInQueue(from, to) {
        set({ queue: moveQueueItem(get().queue, from, to) });
        preloadedUid = null;
      },

      clearQueue() {
        set({ queue: clearUpcoming(get().queue) });
        preloadedUid = null;
      },

      stop() {
        loadToken++;
        engine()?.stop();
        set({ queue: EMPTY_QUEUE, status: 'idle', position: 0, duration: 0, buffered: 0, loadedUid: null, context: null, error: null });
      },

      updateSong(songId, patch) {
        set({ queue: updateSongs(get().queue, (s) => (s.id === songId ? { ...s, ...patch } : s)) });
      },

      restoreQueue(songs, currentId, positionSeconds) {
        if (!songs.length) return;
        const idx = Math.max(0, currentId ? songs.findIndex((s) => s.id === currentId) : 0);
        loadToken++;
        engine()?.stop();
        set({
          queue: buildQueue(songs, idx, { shuffle: false }),
          status: 'paused',
          position: positionSeconds,
          duration: songs[idx]?.duration ?? 0,
          loadedUid: null,
          context: { type: 'queue', name: 'Resumed queue' },
        });
      },

      handleEngineStatus(status, error) {
        const item = currentItem(get().queue);
        if (status === 'ended') {
          advanceAfterEnd();
          return;
        }
        if (status === 'error') {
          const message = error ?? 'Playback failed';
          set({ status: 'error', error: message });
          deps.onError?.(message, item?.song);
          return;
        }
        if (status === 'playing' && item && startedUid !== item.uid) {
          startedUid = item.uid;
          deps.onTrackStart?.(item.song, get().context);
        }
        set({ status, error: null });
      },

      handleEngineTime(position, duration, buffered) {
        const state = get();
        // While a new source is loading, late updates from the previous track are ignored.
        if (state.status === 'loading') return;
        const item = currentItem(state.queue);
        const dur = duration > 0 && Number.isFinite(duration) ? duration : state.duration;
        // Count real listening time only (ignore seeks).
        const delta = position - lastTime;
        if (delta > 0 && delta < 2.5 && state.status === 'playing') listenedSeconds += delta;
        lastTime = position;
        set({ position, duration: dur, buffered });
        if (!item) return;

        if (listenedUid !== item.uid && dur > 0 && listenedSeconds >= scrobbleThreshold(dur)) {
          listenedUid = item.uid;
          deps.onTrackListened?.(item.song, state.context);
        }

        const remaining = dur - position;
        const nextIdx = nextIndex(state.queue, state.repeat, true);
        const nextItem: QueueItem | undefined = nextIdx >= 0 && nextIdx !== state.queue.index ? state.queue.items[nextIdx] : undefined;

        // Preload the following track ~20 s before the end.
        if (nextItem && (deps.getPreload?.() ?? true) && dur > 0 && remaining < 20 && preloadedUid !== nextItem.uid) {
          preloadedUid = nextItem.uid;
          const eng = engine();
          if (eng?.preload) deps.resolveSource(nextItem.song).then((src) => eng.preload?.(src)).catch(() => undefined);
        }

        // Crossfade: start the next track early and let the engine fade between them.
        const crossfade = deps.getCrossfade?.() ?? 0;
        if (crossfade > 0 && nextItem && state.status === 'playing' && dur > crossfade * 2 && remaining <= crossfade && remaining > 0) {
          // The engine keeps the old source fading out and must not report its "ended" event.
          advanceAfterEnd(crossfade);
        }
      },

      attachEngine() {
        const eng = engine();
        if (!eng) return;
        eng.setVolume(get().volume);
        eng.setMuted(get().muted);
      },
    };
  };

  const storage = deps.storage ?? createMemoryStorage();
  return createStore<PlayerState>()(
    persist(initializer, {
      name: deps.storageKey ?? 'sonora.player',
      version: 1,
      storage: createJSONStorage(() => storage),
      skipHydration: true,
      partialize: (s) => ({
        queue: persistableQueue(s.queue),
        repeat: s.repeat,
        context: s.context,
        position: s.position,
        duration: s.duration,
        volume: s.volume,
        muted: s.muted,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PlayerState>;
        const queue = p.queue && Array.isArray(p.queue.items) ? p.queue : current.queue;
        return {
          ...current,
          ...p,
          queue,
          status: currentItem(queue) ? 'paused' : 'idle',
          loadedUid: null,
          error: null,
          buffered: 0,
        };
      },
    }),
  );
}
