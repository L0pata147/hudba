import type { Starred } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { mapAlbum, mapArtist, mapSong } from './mappers';
import type { SubsonicEnvelope, WireAlbum, WireArtist, WireSong } from './wire';

export interface StarTarget {
  songIds?: string[];
  albumIds?: string[];
  artistIds?: string[];
}

export function favoritesApi(http: SubsonicHttpClient) {
  const params = (t: StarTarget) => ({ id: t.songIds, albumId: t.albumIds, artistId: t.artistIds });
  return {
    async star(target: StarTarget, req?: RequestOptions): Promise<void> {
      await http.request('star', params(target), req);
    },
    async unstar(target: StarTarget, req?: RequestOptions): Promise<void> {
      await http.request('unstar', params(target), req);
    },
    async set(target: StarTarget, starred: boolean, req?: RequestOptions): Promise<void> {
      await http.request(starred ? 'star' : 'unstar', params(target), req);
    },
    /** `getStarred2` — everything the user has favorited. */
    async list(req?: RequestOptions): Promise<Starred> {
      const res = await http.request<
        SubsonicEnvelope & { starred2?: { artist?: WireArtist[]; album?: WireAlbum[]; song?: WireSong[] } }
      >('getStarred2', {}, req);
      const s = res.starred2 ?? {};
      return {
        artists: (s.artist ?? []).map(mapArtist),
        albums: (s.album ?? []).map(mapAlbum),
        songs: (s.song ?? []).map(mapSong),
      };
    },
  };
}

export type FavoritesApi = ReturnType<typeof favoritesApi>;
