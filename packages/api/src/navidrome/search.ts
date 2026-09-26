import type { Playlist, SearchResult } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { mapAlbum, mapArtist, mapSong } from './mappers';
import type { SubsonicEnvelope, WireAlbum, WireArtist, WireSong } from './wire';

export interface SearchOptions {
  artistCount?: number;
  albumCount?: number;
  songCount?: number;
  artistOffset?: number;
  albumOffset?: number;
  songOffset?: number;
}

/** Case/diacritics-insensitive match used for client-side playlist search. */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function filterPlaylists(playlists: Playlist[], query: string): Playlist[] {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const words = q.split(/\s+/);
  return playlists.filter((p) => {
    const hay = normalizeForSearch(`${p.name} ${p.comment ?? ''}`);
    return words.every((w) => hay.includes(w));
  });
}

export function searchApi(http: SubsonicHttpClient, listPlaylists: (req?: RequestOptions) => Promise<Playlist[]>) {
  return {
    /** `search3` — artists, albums and songs. */
    async library(query: string, opts: SearchOptions = {}, req?: RequestOptions): Promise<Omit<SearchResult, 'playlists'>> {
      const res = await http.request<
        SubsonicEnvelope & { searchResult3?: { artist?: WireArtist[]; album?: WireAlbum[]; song?: WireSong[] } }
      >(
        'search3',
        {
          query,
          artistCount: opts.artistCount ?? 8,
          albumCount: opts.albumCount ?? 12,
          songCount: opts.songCount ?? 20,
          artistOffset: opts.artistOffset,
          albumOffset: opts.albumOffset,
          songOffset: opts.songOffset,
        },
        req,
      );
      const r = res.searchResult3 ?? {};
      return {
        artists: (r.artist ?? []).map(mapArtist),
        albums: (r.album ?? []).map(mapAlbum),
        songs: (r.song ?? []).map(mapSong),
      };
    },

    /**
     * Full search including playlists. The Subsonic API has no playlist search,
     * so playlists are matched client-side against the user's playlist list.
     */
    async all(query: string, opts: SearchOptions = {}, req?: RequestOptions): Promise<SearchResult> {
      const [lib, playlists] = await Promise.all([
        this.library(query, opts, req),
        listPlaylists(req).catch(() => [] as Playlist[]),
      ]);
      return { ...lib, playlists: filterPlaylists(playlists, query) };
    },
  };
}

export type SearchApi = ReturnType<typeof searchApi>;
