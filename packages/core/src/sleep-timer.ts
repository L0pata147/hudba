import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { PlayerState } from './player';
import { playerStore } from './playback';

/**
 * Sleep timer: pauses playback after a number of minutes (fading the last
 * seconds out) or when the current song ends. Not persisted: it is for this
 * listening session.
 */
export interface SleepTimerState {
  /** epoch ms when playback pauses, for a timer in minutes */
  endsAt: number | null;
  /** pause when the song that is playing now ends */
  endOfSong: boolean;
  /** Pause in `minutes` minutes. */
  start(minutes: number): void;
  /** Pause when the current song ends. */
  startEndOfSong(): void;
  cancel(): void;
}

/** Seconds of fade-out before a timer in minutes pauses. */
export const SLEEP_FADE_SECONDS = 12;

interface Player {
  getState(): Pick<PlayerState, 'volume' | 'loadedUid' | 'status' | 'pause' | 'setVolume'>;
  subscribe(listener: (s: PlayerState, prev: PlayerState) => void): () => void;
}

export function createSleepTimer(player: Player, now: () => number = Date.now) {
  let tick: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  /** volume before the fade started, restored after pausing */
  let volumeBefore: number | null = null;

  const stopWatching = () => {
    if (tick) clearInterval(tick);
    tick = null;
    unsubscribe?.();
    unsubscribe = null;
  };
  const restoreVolume = () => {
    if (volumeBefore != null) player.getState().setVolume(volumeBefore);
    volumeBefore = null;
  };

  const store = createStore<SleepTimerState>()((set, get) => {
    const finish = () => {
      stopWatching();
      player.getState().pause();
      // the fade only lowered the volume for the timer; next time it plays normally
      restoreVolume();
      set({ endsAt: null, endOfSong: false });
    };
    return {
      endsAt: null,
      endOfSong: false,
      start(minutes) {
        get().cancel();
        set({ endsAt: now() + Math.max(1, minutes) * 60_000, endOfSong: false });
        tick = setInterval(() => {
          const endsAt = get().endsAt;
          if (endsAt == null) return;
          const left = (endsAt - now()) / 1000;
          if (left <= 0) return finish();
          if (left <= SLEEP_FADE_SECONDS && player.getState().status === 'playing') {
            if (volumeBefore == null) volumeBefore = player.getState().volume;
            player.getState().setVolume(volumeBefore * (left / SLEEP_FADE_SECONDS));
          }
        }, 500);
      },
      startEndOfSong() {
        get().cancel();
        const uid = player.getState().loadedUid;
        set({ endsAt: null, endOfSong: true });
        unsubscribe = player.subscribe((s) => {
          // the next song started, or the queue ran out
          if (s.loadedUid !== uid || s.status === 'ended' || s.status === 'idle') finish();
        });
      },
      cancel() {
        stopWatching();
        restoreVolume();
        set({ endsAt: null, endOfSong: false });
      },
    };
  });
  return store;
}

export const sleepTimerStore = createSleepTimer(playerStore);

export function useSleepTimer<T>(selector: (s: SleepTimerState) => T): T {
  return useStore(sleepTimerStore, selector);
}
