import type { StreamQuality } from '@sonora/types';
import type { SubsonicHttpClient } from './client';

export interface StreamOptions {
  quality?: StreamQuality;
  /** Force a transcoding format, e.g. "mp3" or "opus". Defaults to server choice. */
  format?: string;
  /** Start offset in seconds (requires server transcoding support). */
  timeOffset?: number;
}

export function mediaApi(http: SubsonicHttpClient) {
  return {
    /** URL for `<audio src>` / native players. Includes auth params. */
    streamUrl(songId: string, opts: StreamOptions = {}): string {
      const maxBitRate = opts.quality && opts.quality !== 'original' ? Number(opts.quality) : undefined;
      return http.buildUrl('stream', {
        id: songId,
        maxBitRate,
        format: opts.format ?? (maxBitRate ? undefined : 'raw'),
        timeOffset: opts.timeOffset,
      });
    },
    /** Original file download (used for offline storage). */
    downloadUrl(songId: string): string {
      return http.buildUrl('download', { id: songId });
    },
    /** Artwork URL. `size` is the longest edge in px; the server caches resized images. */
    coverArtUrl(coverArtId: string | undefined, size?: number): string | undefined {
      if (!coverArtId) return undefined;
      return http.buildUrl('getCoverArt', { id: coverArtId, size });
    },
  };
}

export type MediaApi = ReturnType<typeof mediaApi>;
