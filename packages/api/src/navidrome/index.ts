import type { ServerInfo, Session, User } from '@sonora/types';
import { SubsonicHttpClient, type FetchLike, type RequestOptions } from './client';
import { fetchServerInfo } from './auth';
import { albumsApi } from './albums';
import { artistsApi } from './artists';
import { songsApi } from './songs';
import { playlistsApi } from './playlists';
import { searchApi } from './search';
import { favoritesApi } from './favorites';
import { scrobblingApi } from './scrobbling';
import { playQueueApi } from './playqueue';
import { genresApi } from './genres';
import { lyricsApi } from './lyrics';
import { mediaApi } from './media';
import { mapUser } from './mappers';
import type { SubsonicEnvelope, WireUser } from './wire';

export interface NavidromeClientOptions {
  session: Pick<Session, 'server' | 'credentials'> & { serverInfo?: ServerInfo };
  clientName?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

/**
 * Typed facade over the Navidrome (Subsonic/OpenSubsonic) API.
 *
 * ```ts
 * const navidrome = createNavidromeClient({ session });
 * const albums = await navidrome.albums.list({ type: 'newest' });
 * ```
 */
export function createNavidromeClient(opts: NavidromeClientOptions) {
  const http = new SubsonicHttpClient({
    baseUrl: opts.session.server.url,
    credentials: opts.session.credentials,
    clientName: opts.clientName,
    fetch: opts.fetch,
    timeoutMs: opts.timeoutMs,
  });
  const extensions = new Set(opts.session.serverInfo?.extensions ?? []);
  const playlists = playlistsApi(http);

  return {
    http,
    albums: albumsApi(http),
    artists: artistsApi(http),
    songs: songsApi(http),
    playlists,
    search: searchApi(http, (req) => playlists.list(req)),
    favorites: favoritesApi(http),
    scrobbling: scrobblingApi(http),
    playQueue: playQueueApi(http),
    genres: genresApi(http),
    lyrics: lyricsApi(http, (name) => extensions.has(name)),
    media: mediaApi(http),
    system: {
      async ping(req?: RequestOptions): Promise<void> {
        await http.request('ping', {}, req);
      },
      serverInfo: (): Promise<ServerInfo> => fetchServerInfo(http),
      async user(username = http.username, req?: RequestOptions): Promise<User> {
        const res = await http.request<SubsonicEnvelope & { user: WireUser }>('getUser', { username }, req);
        return mapUser(res.user);
      },
      hasExtension: (name: string) => extensions.has(name),
    },
  };
}

export type NavidromeClient = ReturnType<typeof createNavidromeClient>;

export * from './errors';
export * from './client';
export * from './auth';
export * from './mappers';
export { filterPlaylists, normalizeForSearch } from './search';
export type { AlbumListOptions } from './albums';
export type { PlaylistUpdate } from './playlists';
export type { SearchOptions } from './search';
export type { StarTarget } from './favorites';
export type { StreamOptions } from './media';
export type * from './wire';
