import type { Song } from '@sonora/types';

export function song(id: string, overrides: Partial<Song> = {}): Song {
  return {
    id,
    title: `Song ${id}`,
    artist: 'Artist',
    artists: [],
    duration: 200,
    starred: false,
    ...overrides,
  };
}

export const songs = (n: number) => Array.from({ length: n }, (_, i) => song(String(i + 1)));

/** Deterministic PRNG for shuffle tests. */
export function seeded(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
