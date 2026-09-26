import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DownloadRecord, Song } from '@sonora/types';
import { lazyStorage, platform } from './platform';
import { getNavidrome } from './session';

export interface DownloadsState {
  records: Record<string, DownloadRecord>;
  download(songs: Song[]): void;
  remove(songId: string): Promise<void>;
  clearAll(): Promise<void>;
  isAvailableOffline(songId: string): boolean;
}

const MAX_PARALLEL = 2;
const controllers = new Map<string, AbortController>();
let active = 0;

/**
 * Offline downloads. The index lives in app storage; the audio bytes are
 * stored by the platform adapter (Cache Storage on web/desktop, the app's
 * document directory on mobile).
 */
export const downloadsStore = createStore<DownloadsState>()(
  persist(
    (set, get) => {
      const patch = (songId: string, p: Partial<DownloadRecord>) =>
        set((s) => {
          const rec = s.records[songId];
          if (!rec) return s;
          return { records: { ...s.records, [songId]: { ...rec, ...p } } };
        });

      const pump = () => {
        const adapter = platform().offline;
        if (!adapter) return;
        while (active < MAX_PARALLEL) {
          const next = Object.values(get().records).find((r) => r.status === 'queued');
          if (!next) return;
          active++;
          const controller = new AbortController();
          controllers.set(next.songId, controller);
          patch(next.songId, { status: 'downloading', progress: 0, error: undefined });
          const url = getNavidrome().media.downloadUrl(next.songId);
          adapter
            .download(next.song, url, (progress) => patch(next.songId, { progress }), controller.signal)
            .then(({ location, bytes }) => {
              if (!get().records[next.songId]) {
                void adapter.remove(location);
                return;
              }
              patch(next.songId, { status: 'done', progress: 1, location, bytes, downloadedAt: new Date().toISOString() });
            })
            .catch((err: unknown) => {
              if (controller.signal.aborted) return;
              patch(next.songId, { status: 'error', error: err instanceof Error ? err.message : 'Download failed' });
            })
            .finally(() => {
              active--;
              controllers.delete(next.songId);
              pump();
            });
        }
      };

      return {
        records: {},
        download(songs) {
          if (!platform().offline) throw new Error('Offline downloads are not supported on this platform');
          set((s) => {
            const records = { ...s.records };
            for (const song of songs) {
              const existing = records[song.id];
              if (existing && existing.status !== 'error') continue;
              records[song.id] = { songId: song.id, song, status: 'queued', progress: 0 };
            }
            return { records };
          });
          pump();
        },
        async remove(songId) {
          controllers.get(songId)?.abort();
          const rec = get().records[songId];
          set((s) => {
            const records = { ...s.records };
            delete records[songId];
            return { records };
          });
          if (rec?.location) await platform().offline?.remove(rec.location);
        },
        async clearAll() {
          for (const c of controllers.values()) c.abort();
          set({ records: {} });
          await platform().offline?.clear();
        },
        isAvailableOffline(songId) {
          return get().records[songId]?.status === 'done';
        },
      };
    },
    {
      name: 'sonora.downloads',
      storage: createJSONStorage(() => lazyStorage),
      skipHydration: true,
      partialize: (s) => ({
        // Interrupted downloads resume as queued on next launch.
        records: Object.fromEntries(
          Object.entries(s.records).map(([k, r]) => [k, r.status === 'downloading' ? { ...r, status: 'queued' as const, progress: 0 } : r]),
        ),
      }),
    },
  ),
);

/** Resumes queued downloads after hydration. */
export function resumeDownloads(): void {
  const queued = Object.values(downloadsStore.getState().records).filter((r) => r.status === 'queued');
  if (queued.length && platform().offline) {
    // Re-queue through the public API to kick the pump.
    downloadsStore.setState((s) => {
      const records = { ...s.records };
      for (const r of queued) delete records[r.songId];
      return { records };
    });
    downloadsStore.getState().download(queued.map((r) => r.song));
  }
}
