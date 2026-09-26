import type { Album, AlbumListType, AlbumWithSongs } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { mapAlbum, mapAlbumWithSongs } from './mappers';
import type { SubsonicEnvelope, WireAlbum, WireAlbumWithSongs } from './wire';

export interface AlbumListOptions {
  type?: AlbumListType;
  /** max 500 */
  size?: number;
  offset?: number;
  fromYear?: number;
  toYear?: number;
  genre?: string;
}

export function albumsApi(http: SubsonicHttpClient) {
  return {
    /** `getAlbumList2` — paged album listing sorted/filtered by `type`. */
    async list(opts: AlbumListOptions = {}, req?: RequestOptions): Promise<Album[]> {
      const type = opts.type ?? 'alphabeticalByName';
      if (type === 'byYear' && (opts.fromYear == null || opts.toYear == null)) {
        throw new Error('byYear requires fromYear and toYear');
      }
      if (type === 'byGenre' && !opts.genre) throw new Error('byGenre requires genre');
      const res = await http.request<SubsonicEnvelope & { albumList2?: { album?: WireAlbum[] } }>(
        'getAlbumList2',
        {
          type,
          size: Math.min(500, opts.size ?? 50),
          offset: opts.offset ?? 0,
          fromYear: opts.fromYear,
          toYear: opts.toYear,
          genre: opts.genre,
        },
        req,
      );
      return (res.albumList2?.album ?? []).map(mapAlbum);
    },

    /** `getAlbum` — album with its tracklist. */
    async get(id: string, req?: RequestOptions): Promise<AlbumWithSongs> {
      const res = await http.request<SubsonicEnvelope & { album: WireAlbumWithSongs }>('getAlbum', { id }, req);
      return mapAlbumWithSongs(res.album);
    },
  };
}

export type AlbumsApi = ReturnType<typeof albumsApi>;
