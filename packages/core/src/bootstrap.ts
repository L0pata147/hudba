import { configurePlatform, type PlatformConfig } from './platform';
import { recentServersStore, sessionStore } from './session';
import { preferencesStore } from './preferences';
import { historyStore } from './history';
import { downloadsStore, resumeDownloads } from './downloads';
import { playerStore } from './playback';

/**
 * Configures platform adapters and rehydrates every persisted store.
 * Call once before rendering the app.
 */
export async function bootstrapSonora(config: Partial<PlatformConfig>): Promise<void> {
  configurePlatform(config);
  await Promise.all([
    sessionStore.persist.rehydrate(),
    recentServersStore.persist.rehydrate(),
    preferencesStore.persist.rehydrate(),
    historyStore.persist.rehydrate(),
    downloadsStore.persist.rehydrate(),
    playerStore.persist.rehydrate(),
  ]);
  // First launch: apply the default volume preference.
  if (!(await Promise.resolve(config.storage?.getItem('sonora.player')))) {
    playerStore.setState({ volume: preferencesStore.getState().defaultVolume });
  }
  sessionStore.setState({ hydrated: true });
  if (sessionStore.getState().session) resumeDownloads();
}
