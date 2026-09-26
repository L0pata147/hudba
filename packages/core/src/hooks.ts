import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { QueueItem } from '@sonora/types';
import { sessionStore, recentServersStore, type SessionState } from './session';
import { preferencesStore, type PreferencesState } from './preferences';
import { playerStore } from './playback';
import type { PlayerState } from './player';
import { historyStore, type HistoryState } from './history';
import { downloadsStore, type DownloadsState } from './downloads';
import { toastStore } from './toasts';
import { currentItem } from './queue';

export function useSession<T>(selector: (s: SessionState) => T): T {
  return useStore(sessionStore, selector);
}

export function useRecentServers() {
  return useStore(recentServersStore, (s) => s.servers);
}

export function usePreferences<T>(selector: (s: PreferencesState) => T): T {
  return useStore(preferencesStore, selector);
}

export function usePlayer<T>(selector: (s: PlayerState) => T): T {
  return useStore(playerStore, selector);
}

export function usePlayerShallow<T extends object>(selector: (s: PlayerState) => T): T {
  return useStore(playerStore, useShallow(selector));
}

export function useCurrentItem(): QueueItem | undefined {
  return useStore(playerStore, (s) => currentItem(s.queue));
}

/** Whether `songId` is the currently loaded track, and whether it is playing. */
export function useSongPlayState(songId: string): { isCurrent: boolean; isPlaying: boolean } {
  return useStore(
    playerStore,
    useShallow((s) => {
      const cur = currentItem(s.queue);
      const isCurrent = cur?.song.id === songId;
      return { isCurrent, isPlaying: isCurrent && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading') };
    }),
  );
}

/** Whether the current playback context is the given collection. */
export function useContextPlayState(type: string, id: string | undefined): { isCurrent: boolean; isPlaying: boolean } {
  return useStore(
    playerStore,
    useShallow((s) => {
      const isCurrent = Boolean(id) && s.context?.type === type && s.context?.id === id;
      return { isCurrent, isPlaying: isCurrent && (s.status === 'playing' || s.status === 'buffering' || s.status === 'loading') };
    }),
  );
}

export function useHistory<T>(selector: (s: HistoryState) => T): T {
  return useStore(historyStore, selector);
}

export function useDownloads<T>(selector: (s: DownloadsState) => T): T {
  return useStore(downloadsStore, selector);
}

export function useToasts() {
  return useStore(toastStore, (s) => s.toasts);
}
