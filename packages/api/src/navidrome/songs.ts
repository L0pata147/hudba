import type { Song } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { mapSong } from './mappers';
import type { SubsonicEnvelope, WireSong } from './wire';

export function songsApi(http: SubsonicHttpClient) {
  return {
    async get(id: string, req?: RequestOptions): Promise<Song> {
      const res = await http.request<SubsonicEnvelope & { song: WireSong }>('getSong', { id }, req);
      return mapSong(res.song);
    },

    /**
     * Paged listing of every song in the library. Navidrome returns the whole
     * library for an empty `search3` query, which is the standard way Subsonic
     * clients page through all tracks.
     */
    async list(opts: { count?: number; offset?: number } = {}, req?: RequestOptions): Promise<Song[]> {
      const res = await http.request<SubsonicEnvelope & { searchResult3?: { song?: WireSong[] } }>(
        'search3',
        {
          query: '',
          songCount: Math.min(500, opts.count ?? 100),
          songOffset: opts.offset ?? 0,
          artistCount: 0,
          albumCount: 0,
        },
        req,
      );
      return (res.searchResult3?.song ?? []).map(mapSong);
    },

    async random(opts: { size?: number; genre?: string; fromYear?: number; toYear?: number } = {}, req?: RequestOptions): Promise<Song[]> {
      const res = await http.request<SubsonicEnvelope & { randomSongs?: { song?: WireSong[] } }>(
        'getRandomSongs',
        { size: opts.size ?? 50, genre: opts.genre, fromYear: opts.fromYear, toYear: opts.toYear },
        req,
      );
      return (res.randomSongs?.song ?? []).map(mapSong);
    },

    async byGenre(genre: string, opts: { count?: number; offset?: number } = {}, req?: RequestOptions): Promise<Song[]> {
      const res = await http.request<SubsonicEnvelope & { songsByGenre?: { song?: WireSong[] } }>(
        'getSongsByGenre',
        { genre, count: Math.min(500, opts.count ?? 100), offset: opts.offset ?? 0 },
        req,
      );
      return (res.songsByGenre?.song ?? []).map(mapSong);
    },
  };
}

export type SongsApi = ReturnType<typeof songsApi>;
