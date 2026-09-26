import type { Genre } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { mapGenre } from './mappers';
import type { SubsonicEnvelope, WireGenre } from './wire';

export function genresApi(http: SubsonicHttpClient) {
  return {
    async list(req?: RequestOptions): Promise<Genre[]> {
      const res = await http.request<SubsonicEnvelope & { genres?: { genre?: WireGenre[] } }>('getGenres', {}, req);
      return (res.genres?.genre ?? []).map(mapGenre).sort((a, b) => b.songCount - a.songCount);
    },
  };
}

export type GenresApi = ReturnType<typeof genresApi>;
