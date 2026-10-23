import { currentItem, playerStore, preferencesStore } from '@sonora/core';

/**
 * Desktop app (Tauri) glue for the tray icon: its menu plays/pauses and skips
 * (the native side sends a "tray" event), its tooltip and Play/Pause label
 * follow the player, and the "close to tray" preference is handed down.
 */
export async function startDesktopShell(): Promise<void> {
  const [{ listen }, { invoke }] = await Promise.all([import('@tauri-apps/api/event'), import('@tauri-apps/api/core')]);
  await listen<string>('tray', (e) => {
    const p = playerStore.getState();
    if (e.payload === 'play') p.togglePlay();
    else if (e.payload === 'next') p.next();
    else if (e.payload === 'previous') p.previous();
  });

  let last = '';
  const pushState = () => {
    const s = playerStore.getState();
    const item = currentItem(s.queue);
    const title = item ? `${item.song.title} — ${item.song.artist}`.slice(0, 110) : null;
    const playing = s.status === 'playing' || s.status === 'buffering' || s.status === 'loading';
    const key = `${title}|${playing}`;
    if (key === last) return;
    last = key;
    void invoke('set_tray_state', { title, playing }).catch(() => undefined);
  };
  playerStore.subscribe(pushState);
  pushState();

  const pushTray = () => void invoke('set_close_to_tray', { enabled: preferencesStore.getState().closeToTray }).catch(() => undefined);
  preferencesStore.subscribe((s, prev) => s.closeToTray !== prev.closeToTray && pushTray());
  pushTray();
}
