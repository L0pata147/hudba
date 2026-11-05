import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** What you searched for on this phone (newest first), shown when the search field is empty. */
interface RecentSearches {
  queries: string[];
  add(q: string): void;
  remove(q: string): void;
  clear(): void;
}

export const useRecentSearches = create<RecentSearches>()(
  persist(
    (set) => ({
      queries: [],
      add: (q) => {
        const v = q.trim();
        if (v.length < 2) return;
        set((s) => ({ queries: [v, ...s.queries.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 12) }));
      },
      remove: (q) => set((s) => ({ queries: s.queries.filter((x) => x !== q) })),
      clear: () => set({ queries: [] }),
    }),
    { name: 'sonora.recent-searches', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ queries: s.queries }) },
  ),
);
