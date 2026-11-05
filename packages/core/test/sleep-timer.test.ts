import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createSleepTimer, SLEEP_FADE_SECONDS } from '../src/sleep-timer';
import type { PlayerState } from '../src/player';

function fakePlayer() {
  return createStore<PlayerState>()(
    (set) =>
      ({
        volume: 0.8,
        loadedUid: 'a',
        status: 'playing',
        pause: () => set({ status: 'paused' }),
        setVolume: (volume: number) => set({ volume }),
      }) as unknown as PlayerState,
  );
}

describe('sleep timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fades out, pauses after the minutes and puts the volume back', () => {
    const player = fakePlayer();
    const timer = createSleepTimer(player, () => Date.now());
    timer.getState().start(1);
    expect(timer.getState().endsAt).toBe(Date.now() + 60_000);
    vi.advanceTimersByTime((60 - SLEEP_FADE_SECONDS / 2) * 1000);
    expect(player.getState().status).toBe('playing');
    expect(player.getState().volume).toBeGreaterThan(0.2);
    expect(player.getState().volume).toBeLessThan(0.6);
    vi.advanceTimersByTime(SLEEP_FADE_SECONDS * 1000);
    expect(player.getState().status).toBe('paused');
    expect(player.getState().volume).toBe(0.8);
    expect(timer.getState().endsAt).toBeNull();
  });

  it('pauses when the current song ends', () => {
    const player = fakePlayer();
    const timer = createSleepTimer(player);
    timer.getState().startEndOfSong();
    player.setState({ volume: 0.7 });
    expect(player.getState().status).toBe('playing');
    player.setState({ loadedUid: 'b' });
    expect(player.getState().status).toBe('paused');
    expect(timer.getState().endOfSong).toBe(false);
  });

  it('can be cancelled, also during the fade', () => {
    const player = fakePlayer();
    const timer = createSleepTimer(player, () => Date.now());
    timer.getState().start(1);
    vi.advanceTimersByTime(55_000);
    timer.getState().cancel();
    expect(player.getState().volume).toBe(0.8);
    vi.advanceTimersByTime(120_000);
    expect(player.getState().status).toBe('playing');
  });
});
