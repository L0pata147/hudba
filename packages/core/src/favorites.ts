import { createStore } from 'zustand/vanilla';
import type { Album, Artist, Song } from '@sonora/types';

export type FavoriteKind = 'song' | 'album' | 'artist';

interface FavoriteOverridesState {
  /** `${kind}:${id}` -> starred, set optimistically before the server confirms */
  overrides: Record<string, boolean>;
  setOverride(kind: FavoriteKind, id: string, starred: boolean): void;
  clearOverride(kind: FavoriteKind, id: string): void;
  reset(): void;
}

/**
 * Optimistic favorite state. Toggling writes an override that every list,
 * row and player control reads immediately, regardless of which cached query
 * the item came from. The override is dropped after the server confirms and
 * the starred queries are refreshed, or reverted on error.
 */
export const favoriteOverridesStore = createStore<FavoriteOverridesState>()((set) => ({
  overrides: {},
  setOverride(kind, id, starred) {
    set((s) => ({ overrides: { ...s.overrides, [`${kind}:${id}`]: starred } }));
  },
  clearOverride(kind, id) {
    set((s) => {
      const next = { ...s.overrides };
      delete next[`${kind}:${id}`];
      return { overrides: next };
    });
  },
  reset() {
    set({ overrides: {} });
  },
}));

export function resolveStarred(overrides: Record<string, boolean>, kind: FavoriteKind, item: Song | Album | Artist): boolean {
  const o = overrides[`${kind}:${item.id}`];
  return o ?? item.starred;
}
