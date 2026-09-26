/**
 * App-wide player instance wired to the Navidrome session, preferences,
 * history, offline downloads and scrobbling.
 */
import type { Song } from '@sonora/types';
import { describeError } from '@sonora/api';
import { createPlayerStore, type AudioEngine } from './player';
import { lazyStorage, platform } from './platform';
import { getNavidrome, sessionStore, tryGetNavidrome } from './session';
import { preferencesStore } from './preferences';
import { historyStore } from './history';
import { downloadsStore } from './downloads';
import { toast } from './toasts';

let engine: AudioEngine | null = null;
let lastOfflineUrl: string | null = null;

async function resolveSource(song: Song): Promise<string> {
  const rec = downloadsStore.getState().records[song.id];
  const adapter = platform().offline;
  if (rec?.status === 'done' && rec.location && adapter) {
    const url = await adapter.resolve(rec.location);
    if (url) {
      if (lastOfflineUrl && lastOfflineUrl !== url) adapter.release?.(lastOfflineUrl);
      lastOfflineUrl = url;
      return url;
    }
  }
  return getNavidrome().media.streamUrl(song.id, { quality: preferencesStore.getState().streamQuality });
}

export const playerStore = createPlayerStore({
  getEngine: () => engine,
  resolveSource,
  storage: lazyStorage,
  getCrossfade: () => preferencesStore.getState().crossfade,
  onTrackStart(song, context) {
    historyStore.getState().record(song, context);
    if (!preferencesStore.getState().scrobble) return;
    tryGetNavidrome()?.scrobbling.nowPlaying(song.id).catch(() => undefined);
  },
  onTrackListened(song) {
    if (!preferencesStore.getState().scrobble) return;
    tryGetNavidrome()?.scrobbling.submit(song.id).catch(() => undefined);
  },
  onError(message, song) {
    const online = typeof navigator === 'undefined' || (navigator as Navigator).onLine !== false;
    const text = song ? `Couldn't play “${song.title}”. ${online ? '' : 'You appear to be offline.'}` : message;
    toast.error(text.trim(), { label: 'Retry', run: () => playerStore.getState().play() });
  },
});

export function setAudioEngine(next: AudioEngine | null): void {
  engine = next;
  if (!next) return;
  const s = playerStore.getState();
  next.setListener({
    onStatus: (status, error) => playerStore.getState().handleEngineStatus(status, error),
    onTime: (position, duration, buffered) => playerStore.getState().handleEngineTime(position, duration, buffered),
  });
  s.attachEngine();
}

export function getAudioEngine(): AudioEngine | null {
  return engine;
}

/* ------------------------------------------------------------------ */
/* Server play-queue sync (resume on another device)                   */
/* ------------------------------------------------------------------ */

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let lastSyncedSignature = '';

function queueSignature(): string {
  const { queue, position } = playerStore.getState();
  const current = queue.items[queue.index]?.song.id ?? '';
  return `${queue.items.map((i) => i.song.id).join(',')}|${current}|${Math.floor(position / 10)}`;
}

export async function saveQueueToServer(): Promise<void> {
  const nd = tryGetNavidrome();
  if (!nd || !preferencesStore.getState().syncQueue) return;
  const sig = queueSignature();
  if (sig === lastSyncedSignature) return;
  const { queue, position } = playerStore.getState();
  const ids = queue.items.slice(0, 1000).map((i) => i.song.id);
  const current = queue.items[queue.index]?.song.id;
  try {
    await nd.playQueue.save(ids, current, position * 1000);
    lastSyncedSignature = sig;
  } catch {
    // Non-critical: next change will retry.
  }
}

/** Starts debounced syncing of the play queue to the server. Returns an unsubscribe fn. */
export function startQueueSync(delayMs = 4000): () => void {
  const unsub = playerStore.subscribe((s, prev) => {
    if (s.queue === prev.queue && Math.abs(s.position - prev.position) < 10 && s.status === prev.status) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void saveQueueToServer(), delayMs);
  });
  return () => {
    unsub();
    if (syncTimer) clearTimeout(syncTimer);
  };
}

/**
 * If this device has no local queue, restore the queue saved on the server
 * (e.g. from another Sonora instance or the Navidrome web UI).
 */
export async function restoreQueueFromServer(): Promise<boolean> {
  const nd = tryGetNavidrome();
  if (!nd || playerStore.getState().queue.items.length) return false;
  try {
    const remote = await nd.playQueue.get();
    if (!remote || !remote.songs.length) return false;
    if (playerStore.getState().queue.items.length) return false;
    playerStore.getState().restoreQueue(remote.songs, remote.currentId, remote.position / 1000);
    return true;
  } catch {
    return false;
  }
}

/** Stops playback and clears user data that belongs to the session. */
export function resetForLogout(): void {
  playerStore.getState().stop();
  historyStore.getState().clear();
  lastSyncedSignature = '';
  sessionStore.getState().logout();
}

export { describeError };
