import type { RemotePlayQueue } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { mapSong } from './mappers';
import type { SubsonicEnvelope, WirePlayQueue } from './wire';

export function playQueueApi(http: SubsonicHttpClient) {
  return {
    /** `getPlayQueue` — the queue saved by any client of this user. */
    async get(req?: RequestOptions): Promise<RemotePlayQueue | null> {
      const res = await http.request<SubsonicEnvelope & { playQueue?: WirePlayQueue }>('getPlayQueue', {}, req);
      const q = res.playQueue;
      if (!q || !q.entry?.length) return null;
      return {
        songs: q.entry.map(mapSong),
        currentId: q.current,
        position: q.position ?? 0,
        changed: q.changed,
        changedBy: q.changedBy,
      };
    },
    /** `savePlayQueue` — position in milliseconds. An empty list clears the saved queue. */
    async save(songIds: string[], currentId: string | undefined, positionMs: number, req?: RequestOptions): Promise<void> {
      await http.request(
        'savePlayQueue',
        { id: songIds, current: songIds.length ? currentId : undefined, position: Math.max(0, Math.floor(positionMs)) },
        { ...req, post: true },
      );
    },
  };
}

export type PlayQueueApi = ReturnType<typeof playQueueApi>;
