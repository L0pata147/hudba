import type { SubsonicHttpClient, RequestOptions } from './client';

export function scrobblingApi(http: SubsonicHttpClient) {
  return {
    /** Reports "now playing" (shown in Navidrome's activity panel, forwarded to Last.fm/ListenBrainz). */
    async nowPlaying(songId: string, req?: RequestOptions): Promise<void> {
      await http.request('scrobble', { id: songId, submission: false }, req);
    },
    /** Registers a completed play. Updates play count and "recently played". */
    async submit(songId: string, playedAt: Date = new Date(), req?: RequestOptions): Promise<void> {
      await http.request('scrobble', { id: songId, time: playedAt.getTime(), submission: true }, req);
    },
  };
}

export type ScrobblingApi = ReturnType<typeof scrobblingApi>;
