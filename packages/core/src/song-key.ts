import type { Song } from '@sonora/types';

/**
 * The same recording, whatever file it is in: the library can hold one song
 * several times (album and single, a compilation, a "Remastered" copy, the same
 * download twice). Lower-case artist + title without accents, bracketed parts
 * ("(Remastered 2011)", "[Live]", "(feat. …)") or a " - Remaster…" suffix.
 */
export function songKey(s: Pick<Song, 'artist' | 'title'>): string {
  const clean = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+(feat\.?|ft\.?|featuring)\s.*$/, '')
      .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
      .replace(/\s+-\s+.*\b(remaster(ed)?|version|edit|mix|live|mono|stereo)\b.*$/, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const artist = clean(s.artist.split(/\s*(?:,|;|&| feat\.? | ft\.? )\s*/i)[0] ?? s.artist);
  return `${artist}|${clean(s.title) || s.title.toLowerCase()}`;
}

/** One song per `songKey` (the first one wins). */
export function uniqueSongs(songs: readonly Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((s) => {
    const k = songKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
