import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Preferences } from '@sonora/types';
import { lazyStorage } from './platform';

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  accent: 'ember',
  compactMode: false,
  sidebarCollapsed: false,
  libraryView: 'grid',
  streamQuality: 'original',
  crossfade: 0,
  gapless: true,
  defaultVolume: 0.8,
  syncQueue: true,
  scrobble: true,
};

export interface PreferencesState extends Preferences {
  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void;
  reset(): void;
}

export const preferencesStore = createStore<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      set(key, value) {
        set({ [key]: value } as Partial<PreferencesState>);
      },
      reset() {
        set(DEFAULT_PREFERENCES);
      },
    }),
    {
      name: 'sonora.preferences',
      version: 1,
      storage: createJSONStorage(() => lazyStorage),
      skipHydration: true,
      partialize: ({ set: _set, reset: _reset, ...prefs }) => prefs,
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<Preferences>) }),
    },
  ),
);
