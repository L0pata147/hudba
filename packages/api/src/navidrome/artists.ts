import type { Artist, ArtistInfo, ArtistWithAlbums, Song } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { mapArtist, mapArtistInfo, mapArtistWithAlbums, mapSong } from './mappers';
import type { SubsonicEnvelope, WireArtist, WireArtistInfo, WireArtistWithAlbums, WireSong } from './wire';

export function artistsApi(http: SubsonicHttpClient) {
  return {
    /** `getArtists` — all (album) artists, flattened from the alphabetical index. */
    async list(req?: RequestOptions): Promise<Artist[]> {
      const res = await http.request<
        SubsonicEnvelope & { artists?: { index?: { name: string; artist?: WireArtist[] }[] } }
      >('getArtists', {}, req);
      const out: Artist[] = [];
      for (const idx of res.artists?.index ?? []) for (const a of idx.artist ?? []) out.push(mapArtist(a));
      return out;
    },

    /** `getArtist` — artist with all albums. */
    async get(id: string, req?: RequestOptions): Promise<ArtistWithAlbums> {
      const res = await http.request<SubsonicEnvelope & { artist: WireArtistWithAlbums }>('getArtist', { id }, req);
      return mapArtistWithAlbums(res.artist);
    },

    /** `getArtistInfo2` — biography, images and similar artists (depends on server agents). */
    async info(id: string, opts: { count?: number } = {}, req?: RequestOptions): Promise<ArtistInfo> {
      const res = await http.request<SubsonicEnvelope & { artistInfo2?: WireArtistInfo }>(
        'getArtistInfo2',
        { id, count: opts.count ?? 12, includeNotPresent: false },
        req,
      );
      return mapArtistInfo(res.artistInfo2 ?? {});
    },

    /**
     * `getTopSongs` — top tracks by artist name. Navidrome answers this from
     * Last.fm data, so it is empty when no agent is configured.
     */
    async topSongs(artistName: string, opts: { count?: number } = {}, req?: RequestOptions): Promise<Song[]> {
      const res = await http.request<SubsonicEnvelope & { topSongs?: { song?: WireSong[] } }>(
        'getTopSongs',
        { artist: artistName, count: opts.count ?? 10 },
        req,
      );
      return (res.topSongs?.song ?? []).map(mapSong);
    },
  };
}

export type ArtistsApi = ReturnType<typeof artistsApi>;
