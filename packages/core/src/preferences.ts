import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Preferences } from '@sonora/types';
import { lazyStorage } from './platform';
import { DEFAULT_EQUALIZER, normalizeEqualizer } from './equalizer';
import { normalizeVisualizerStyle } from './visualizer-styles';

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
  equalizer: DEFAULT_EQUALIZER,
  visualizer: false,
  visualizerStyle: 'ring',
  skin: 'sonora',
  autoUpdate: true,
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
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Preferences>;
        // Older saved preferences have no equalizer; invalid values are repaired.
        return {
          ...current,
          ...p,
          equalizer: normalizeEqualizer(p.equalizer ?? current.equalizer),
          visualizerStyle: normalizeVisualizerStyle(p.visualizerStyle),
        };
      },
    },
  ),
);
