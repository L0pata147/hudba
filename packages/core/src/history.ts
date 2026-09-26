import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { HistoryEntry, PlaybackContext, Song } from '@sonora/types';
import { lazyStorage } from './platform';

export const HISTORY_LIMIT = 300;

export interface HistoryState {
  entries: HistoryEntry[];
  record(song: Song, context?: PlaybackContext | null, playedAt?: Date): void;
  clear(): void;
}

/**
 * Local listening history. Navidrome exposes "recently played" only at album
 * level (`getAlbumList2?type=recent`), so per-track history is kept on-device.
 */
export const historyStore = createStore<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      record(song, context, playedAt = new Date()) {
        set((s) => {
          const last = s.entries[0];
          // Ignore immediate duplicates (e.g. seeking back to 0 or repeat-one restarts within a minute).
          if (last && last.song.id === song.id && playedAt.getTime() - new Date(last.playedAt).getTime() < 60_000) {
            return s;
          }
          const entry: HistoryEntry = { song, playedAt: playedAt.toISOString() };
          if (context) entry.context = context;
          return { entries: [entry, ...s.entries].slice(0, HISTORY_LIMIT) };
        });
      },
      clear() {
        set({ entries: [] });
      },
    }),
    {
      name: 'sonora.history',
      storage: createJSONStorage(() => lazyStorage),
      skipHydration: true,
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);

/** Unique songs from history, most recent first. */
export function recentSongs(entries: HistoryEntry[], limit = 20): Song[] {
  const seen = new Set<string>();
  const out: Song[] = [];
  for (const e of entries) {
    if (seen.has(e.song.id)) continue;
    seen.add(e.song.id);
    out.push(e.song);
    if (out.length >= limit) break;
  }
  return out;
}
