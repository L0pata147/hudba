import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { idb } from './idb';

export const QUERY_CACHE_KEY = 'sonora.query-cache.v1';

/** Query keys worth keeping across restarts / offline (library metadata). */
export const PERSISTED_QUERY_ROOTS = new Set(['albums', 'albums-infinite', 'album', 'artists', 'artist', 'playlists', 'playlist', 'starred', 'genres', 'artist-top']);

export function createIdbPersister(): Persister {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    persistClient(client: PersistedClient) {
      // Throttle writes: the cache can be large for big libraries.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void idb.set(QUERY_CACHE_KEY, JSON.stringify(client)), 1500);
    },
    async restoreClient() {
      const raw = await idb.get(QUERY_CACHE_KEY);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as PersistedClient;
      } catch {
        return undefined;
      }
    },
    async removeClient() {
      await idb.del(QUERY_CACHE_KEY);
    },
  };
}
