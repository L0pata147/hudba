import type { Lyrics, Song } from '@sonora/types';
import type { SubsonicHttpClient, RequestOptions } from './client';
import { NavidromeError } from './errors';
import { mapLyrics } from './mappers';
import type { SubsonicEnvelope, WireStructuredLyrics } from './wire';

export function lyricsApi(http: SubsonicHttpClient, hasExtension: (name: string) => boolean) {
  return {
    /**
     * Lyrics for a song. Prefers the OpenSubsonic `songLyrics` extension
     * (`getLyricsBySongId`, supports synced lyrics) and falls back to the
     * classic `getLyrics` (artist + title, unsynced).
     */
    async forSong(song: Pick<Song, 'id' | 'artist' | 'title'>, req?: RequestOptions): Promise<Lyrics | null> {
      if (hasExtension('songLyrics')) {
        try {
          const res = await http.request<SubsonicEnvelope & { lyricsList?: { structuredLyrics?: WireStructuredLyrics[] } }>(
            'getLyricsBySongId',
            { id: song.id },
            req,
          );
          const all = res.lyricsList?.structuredLyrics ?? [];
          const best = all.find((l) => l.synced) ?? all[0];
          if (best && best.line?.length) return mapLyrics(best);
        } catch (err) {
          if (!(err instanceof NavidromeError) || err.kind === 'network' || err.kind === 'timeout') throw err;
        }
      }
      const res = await http.request<SubsonicEnvelope & { lyrics?: { value?: string } }>(
        'getLyrics',
        { artist: song.artist, title: song.title },
        req,
      );
      const text = res.lyrics?.value?.trim();
      if (!text) return null;
      return { synced: false, lines: text.split(/\r?\n/).map((value) => ({ value })) };
    },
  };
}

export type LyricsApi = ReturnType<typeof lyricsApi>;
