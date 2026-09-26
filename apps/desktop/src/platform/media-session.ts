import { currentItem, getNavidrome, playerStore, tryGetNavidrome } from '@sonora/core';

/**
 * OS media integration (hardware media keys, lock screen / notification
 * controls, Now Playing widgets) through the Media Session API.
 */
export function startMediaSession(): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return () => undefined;
  const ms = navigator.mediaSession;
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => playerStore.getState().play()],
    ['pause', () => playerStore.getState().pause()],
    ['previoustrack', () => playerStore.getState().previous()],
    ['nexttrack', () => playerStore.getState().next()],
    ['seekbackward', (d) => playerStore.getState().seekBy(-(d.seekOffset ?? 10))],
    ['seekforward', (d) => playerStore.getState().seekBy(d.seekOffset ?? 10)],
    ['seekto', (d) => d.seekTime != null && playerStore.getState().seek(d.seekTime)],
    ['stop', () => playerStore.getState().pause()],
  ];
  for (const [action, handler] of actions) {
    try {
      ms.setActionHandler(action, handler);
    } catch {
      /* unsupported action */
    }
  }

  let lastUid: string | undefined;
  let lastPosSync = 0;
  const unsub = playerStore.subscribe((s) => {
    const item = currentItem(s.queue);
    if (item?.uid !== lastUid) {
      lastUid = item?.uid;
      if (item && tryGetNavidrome()) {
        const art = getNavidrome().media.coverArtUrl(item.song.coverArtId, 512);
        ms.metadata = new MediaMetadata({
          title: item.song.title,
          artist: item.song.artist,
          album: item.song.album ?? '',
          artwork: art ? [{ src: art, sizes: '512x512' }] : [],
        });
      } else {
        ms.metadata = null;
      }
    }
    ms.playbackState = s.status === 'playing' || s.status === 'buffering' ? 'playing' : item ? 'paused' : 'none';
    const now = Date.now();
    if (s.duration > 0 && now - lastPosSync > 1000) {
      lastPosSync = now;
      try {
        ms.setPositionState({ duration: s.duration, position: Math.min(s.position, s.duration), playbackRate: 1 });
      } catch {
        /* ignore invalid state */
      }
    }
  });
  return unsub;
}
