import { bootstrapSonora, setAudioEngine, startQueueSync } from '@sonora/core';
import { createWebStorage } from './storage';
import { HtmlAudioEngine } from './audio-engine';
import { createCacheStorageOfflineAdapter, isOfflineStorageSupported } from './offline';
import { startMediaSession } from './media-session';
import { useEqualizerStatus } from './equalizer-status';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function initPlatform(): Promise<void> {
  const storage = createWebStorage();
  await bootstrapSonora({
    storage,
    // See README → Security: in the browser/Tauri the session token lives in app-private WebView storage.
    secureStorage: createWebStorage('secure:'),
    offline: isOfflineStorageSupported() ? createCacheStorageOfflineAdapter() : undefined,
    clientName: 'Sonora',
    platform: isTauri ? 'desktop' : 'web',
  });
  const engine = new HtmlAudioEngine();
  engine.onEqualizerStatus = (status) => useEqualizerStatus.getState().set(status);
  setAudioEngine(engine);
  // Dev/test diagnostics only (E2E checks that audio really flows through the EQ).
  if (import.meta.env.DEV) (window as unknown as { __sonoraEngine?: HtmlAudioEngine }).__sonoraEngine = engine;
  startMediaSession();
  startQueueSync();
  // Save the queue position when the window closes so the server copy is fresh.
  window.addEventListener('pagehide', () => {
    void import('@sonora/core').then((m) => m.saveQueueToServer());
  });
}
