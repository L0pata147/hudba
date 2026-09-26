import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '@sonora/types';
import { createPlayerStore, scrobbleThreshold, type AudioEngine, type AudioEngineListener, type LoadOptions, type PlayerStore } from '../src/player';
import { createMemoryStorage } from '../src/platform';
import { currentItem } from '../src/queue';
import { song, songs } from './fixtures';

class FakeEngine implements AudioEngine {
  listener!: AudioEngineListener;
  loads: { src: string; opts: LoadOptions }[] = [];
  calls: string[] = [];
  volume = 1;
  muted = false;
  setListener(l: AudioEngineListener) {
    this.listener = l;
  }
  load(src: string, opts: LoadOptions) {
    this.loads.push({ src, opts });
    this.calls.push(`load:${src}`);
    if (opts.autoplay) queueMicrotask(() => this.listener.onStatus('playing'));
  }
  play() {
    this.calls.push('play');
    this.listener.onStatus('playing');
  }
  pause() {
    this.calls.push('pause');
    this.listener.onStatus('paused');
  }
  seek(s: number) {
    this.calls.push(`seek:${s}`);
  }
  setVolume(v: number) {
    this.volume = v;
  }
  setMuted(m: boolean) {
    this.muted = m;
  }
  stop() {
    this.calls.push('stop');
  }
  get lastSrc() {
    return this.loads.at(-1)?.src;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(extra: Partial<Parameters<typeof createPlayerStore>[0]> = {}) {
  const engine = new FakeEngine();
  const onTrackStart = vi.fn();
  const onTrackListened = vi.fn();
  const store: PlayerStore = createPlayerStore({
    getEngine: () => engine,
    resolveSource: async (s: Song) => `stream://${s.id}`,
    onTrackStart,
    onTrackListened,
    ...extra,
  });
  engine.setListener({
    onStatus: (st, e) => store.getState().handleEngineStatus(st, e),
    onTime: (p, d, b) => store.getState().handleEngineTime(p, d, b),
  });
  store.getState().attachEngine();
  return { engine, store, onTrackStart, onTrackListened };
}

describe('player store', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('plays a list of songs from the chosen index', async () => {
    ctx.store.getState().playSongs(songs(3), 1, { context: { type: 'album', id: 'al1', name: 'Album' } });
    expect(ctx.store.getState().status).toBe('loading');
    await flush();
    expect(ctx.engine.lastSrc).toBe('stream://2');
    expect(ctx.store.getState().status).toBe('playing');
    expect(ctx.onTrackStart).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }), expect.objectContaining({ id: 'al1' }));
  });

  it('toggles play/pause', async () => {
    ctx.store.getState().playSongs(songs(2));
    await flush();
    ctx.store.getState().togglePlay();
    expect(ctx.store.getState().status).toBe('paused');
    ctx.store.getState().togglePlay();
    expect(ctx.store.getState().status).toBe('playing');
  });

  it('advances on track end and stops at the end of the queue', async () => {
    const s = ctx.store.getState();
    s.playSongs(songs(2));
    await flush();
    s.handleEngineStatus('ended');
    await flush();
    expect(ctx.engine.lastSrc).toBe('stream://2');
    ctx.store.getState().handleEngineStatus('ended');
    await flush();
    const st = ctx.store.getState();
    expect(st.status).not.toBe('playing');
    expect(currentItem(st.queue)?.song.id).toBe('1');
  });

  it('repeat-all wraps and repeat-one restarts on auto end', async () => {
    const s = ctx.store.getState();
    s.playSongs(songs(2), 1);
    await flush();
    s.setRepeat('all');
    ctx.store.getState().handleEngineStatus('ended');
    await flush();
    expect(ctx.engine.lastSrc).toBe('stream://1');

    ctx.store.getState().setRepeat('one');
    const loadsBefore = ctx.engine.loads.length;
    ctx.store.getState().handleEngineStatus('ended');
    expect(ctx.engine.loads.length).toBe(loadsBefore);
    expect(ctx.engine.calls.slice(-2)).toEqual(['seek:0', 'play']);
    // Manual "next" still skips while on repeat-one.
    ctx.store.getState().next();
    await flush();
    expect(ctx.engine.lastSrc).toBe('stream://2');
  });

  it('cycles repeat modes', () => {
    const s = ctx.store.getState();
    expect(s.repeat).toBe('off');
    s.cycleRepeat();
    expect(ctx.store.getState().repeat).toBe('all');
    ctx.store.getState().cycleRepeat();
    expect(ctx.store.getState().repeat).toBe('one');
    ctx.store.getState().cycleRepeat();
    expect(ctx.store.getState().repeat).toBe('off');
  });

  it('previous restarts the track after 3 seconds, otherwise goes back', async () => {
    const s = ctx.store.getState();
    s.playSongs(songs(3), 1);
    await flush();
    ctx.store.getState().handleEngineTime(10, 200, 50);
    ctx.store.getState().previous();
    expect(ctx.engine.calls.at(-1)).toBe('seek:0');
    expect(currentItem(ctx.store.getState().queue)?.song.id).toBe('2');
    ctx.store.getState().previous();
    await flush();
    expect(ctx.engine.lastSrc).toBe('stream://1');
  });

  it('seeks within bounds', async () => {
    ctx.store.getState().playSongs([song('a', { duration: 100 })]);
    await flush();
    ctx.store.getState().seek(150);
    expect(ctx.store.getState().position).toBe(100);
    ctx.store.getState().seekBy(-500);
    expect(ctx.store.getState().position).toBe(0);
  });

  it('handles volume and mute', () => {
    const s = ctx.store.getState();
    s.setVolume(0.4);
    expect(ctx.engine.volume).toBe(0.4);
    s.toggleMute();
    expect(ctx.engine.muted).toBe(true);
    expect(ctx.store.getState().muted).toBe(true);
    ctx.store.getState().setVolume(2);
    expect(ctx.store.getState().volume).toBe(1);
    expect(ctx.store.getState().muted).toBe(false);
  });

  it('scrobbles once after the listening threshold, ignoring seeks', async () => {
    ctx.store.getState().playSongs([song('a', { duration: 100 })]);
    await flush();
    ctx.store.getState().handleEngineTime(80, 100, 100); // seek jump does not count
    expect(ctx.onTrackListened).not.toHaveBeenCalled();
    for (let t = 80; t <= 100; t += 1) ctx.store.getState().handleEngineTime(t, 100, 100);
    expect(ctx.onTrackListened).not.toHaveBeenCalled();
    ctx.store.getState().seek(0);
    for (let t = 0; t <= 40; t += 1) ctx.store.getState().handleEngineTime(t, 100, 100);
    expect(ctx.onTrackListened).toHaveBeenCalledTimes(1);
    for (let t = 40; t <= 60; t += 1) ctx.store.getState().handleEngineTime(t, 100, 100);
    expect(ctx.onTrackListened).toHaveBeenCalledTimes(1);
    expect(scrobbleThreshold(1000)).toBe(240);
  });

  it('removing the current track loads the next one', async () => {
    ctx.store.getState().playSongs(songs(3));
    await flush();
    const cur = currentItem(ctx.store.getState().queue)!;
    ctx.store.getState().removeFromQueue(cur.uid);
    await flush();
    expect(ctx.engine.lastSrc).toBe('stream://2');
  });

  it('play next / add to queue start playback on an empty queue', async () => {
    ctx.store.getState().addToQueue([song('q')]);
    await flush();
    expect(ctx.engine.lastSrc).toBe('stream://q');
    ctx.store.getState().playNext([song('n')]);
    expect(ctx.store.getState().queue.items.map((i) => i.song.id)).toEqual(['q', 'n']);
  });

  it('reports load errors instead of throwing', async () => {
    const onError = vi.fn();
    const c = setup({ resolveSource: () => Promise.reject(new Error('offline')), onError });
    c.store.getState().playSongs(songs(1));
    await flush();
    expect(c.store.getState().status).toBe('error');
    expect(onError).toHaveBeenCalledWith('offline', expect.objectContaining({ id: '1' }));
  });

  it('keeps shuffle across new queues', async () => {
    ctx.store.getState().toggleShuffle();
    ctx.store.getState().playSongs(songs(30), 5);
    await flush();
    const q = ctx.store.getState().queue;
    expect(q.shuffled).toBe(true);
    expect(currentItem(q)?.song.id).toBe('6');
  });

  it('triggers crossfade transitions before the end', async () => {
    const c = setup({ getCrossfade: () => 5 });
    c.store.getState().playSongs(songs(2));
    await flush();
    c.store.getState().handleEngineTime(190, 200, 200);
    expect(c.engine.loads).toHaveLength(1);
    c.store.getState().handleEngineTime(196, 200, 200);
    await flush();
    expect(c.engine.lastSrc).toBe('stream://2');
    expect(c.engine.loads.at(-1)?.opts.crossfade).toBe(5);
  });

  it('persists queue and position, and resumes paused', async () => {
    const storage = createMemoryStorage();
    const a = setup({ storage });
    a.store.getState().playSongs(songs(3), 1);
    await flush();
    a.store.getState().handleEngineTime(42, 200, 100);
    a.store.getState().setVolume(0.3);

    const engine = new FakeEngine();
    const b = createPlayerStore({ getEngine: () => engine, resolveSource: async (s) => `stream://${s.id}`, storage });
    await b.persist.rehydrate();
    const st = b.getState();
    expect(currentItem(st.queue)?.song.id).toBe('2');
    expect(st.position).toBe(42);
    expect(st.volume).toBe(0.3);
    expect(st.status).toBe('paused');
    engine.setListener({ onStatus: (x) => b.getState().handleEngineStatus(x), onTime: () => undefined });
    b.getState().play();
    await flush();
    expect(engine.loads[0]).toMatchObject({ src: 'stream://2', opts: { startAt: 42, autoplay: true } });
  });
});
