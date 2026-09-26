/**
 * Server-state hooks (TanStack Query) shared by desktop and mobile.
 * Components never call the API directly — they use these hooks.
 */
import { useMemo } from 'react';
import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useStore } from 'zustand';
import type { Album, AlbumListType, Artist, PlaylistWithSongs, Song, Starred } from '@sonora/types';
import { NavidromeError, describeError } from '@sonora/api';
import { getNavidrome, sessionStore } from './session';
import { favoriteOverridesStore, resolveStarred, type FavoriteKind } from './favorites';
import { playerStore } from './playback';
import { toast } from './toasts';

export const PAGE_SIZE = 60;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        gcTime: 24 * 60 * 60_000,
        refetchOnWindowFocus: false,
        networkMode: 'offlineFirst',
        retry: (failureCount, error) => {
          if (error instanceof NavidromeError && !error.retryable) return false;
          return failureCount < 2;
        },
      },
      mutations: { networkMode: 'online' },
    },
  });
}

/** Cache keys are scoped to server + user so switching accounts never leaks data. */
function useScope(): string {
  return useStore(sessionStore, (s) => (s.session ? `${s.session.server.url}|${s.session.credentials.username}` : 'anon'));
}

export const keys = {
  albumList: (scope: string, type: AlbumListType, size: number, extra?: string) => ['albums', scope, type, size, extra ?? ''] as const,
  albumsInfinite: (scope: string, type: AlbumListType, genre?: string) => ['albums-infinite', scope, type, genre ?? ''] as const,
  album: (scope: string, id: string) => ['album', scope, id] as const,
  artists: (scope: string) => ['artists', scope] as const,
  artist: (scope: string, id: string) => ['artist', scope, id] as const,
  artistInfo: (scope: string, id: string) => ['artist-info', scope, id] as const,
  artistTop: (scope: string, id: string) => ['artist-top', scope, id] as const,
  playlists: (scope: string) => ['playlists', scope] as const,
  playlist: (scope: string, id: string) => ['playlist', scope, id] as const,
  starred: (scope: string) => ['starred', scope] as const,
  genres: (scope: string) => ['genres', scope] as const,
  search: (scope: string, q: string) => ['search', scope, q] as const,
  songsInfinite: (scope: string, genre?: string) => ['songs-infinite', scope, genre ?? ''] as const,
  random: (scope: string, size: number) => ['random', scope, size] as const,
  lyrics: (scope: string, id: string) => ['lyrics', scope, id] as const,
};

const enabled = () => Boolean(sessionStore.getState().session);

/* ------------------------------------------------------------------ */
/* Albums                                                              */
/* ------------------------------------------------------------------ */

export function useAlbumList(type: AlbumListType, size = 20, opts: { genre?: string } = {}) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.albumList(scope, type, size, opts.genre),
    queryFn: ({ signal }) => getNavidrome().albums.list({ type, size, genre: opts.genre }, { signal }),
    enabled: enabled(),
  });
}

export function useInfiniteAlbums(type: AlbumListType, opts: { genre?: string } = {}) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: keys.albumsInfinite(scope, type, opts.genre),
    queryFn: ({ pageParam, signal }) =>
      getNavidrome().albums.list({ type, size: PAGE_SIZE, offset: pageParam, genre: opts.genre }, { signal }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE),
    enabled: enabled() && (type !== 'byGenre' || Boolean(opts.genre)),
  });
}

export function useAlbum(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.album(scope, id ?? ''),
    queryFn: ({ signal }) => getNavidrome().albums.get(id as string, { signal }),
    enabled: enabled() && Boolean(id),
  });
}

/* ------------------------------------------------------------------ */
/* Artists                                                             */
/* ------------------------------------------------------------------ */

export function useArtists() {
  const scope = useScope();
  return useQuery({
    queryKey: keys.artists(scope),
    queryFn: ({ signal }) => getNavidrome().artists.list({ signal }),
    enabled: enabled(),
  });
}

export function useArtist(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.artist(scope, id ?? ''),
    queryFn: ({ signal }) => getNavidrome().artists.get(id as string, { signal }),
    enabled: enabled() && Boolean(id),
  });
}

export function useArtistInfo(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.artistInfo(scope, id ?? ''),
    queryFn: ({ signal }) => getNavidrome().artists.info(id as string, {}, { signal }),
    enabled: enabled() && Boolean(id),
    staleTime: 60 * 60_000,
    retry: false,
  });
}

/**
 * Popular tracks for an artist. Uses the server's `getTopSongs` (Last.fm
 * backed) when it returns data; otherwise ranks the artist's own tracks by
 * play count from the user's library — real data, no invented ranking.
 */
export function useArtistTopSongs(artist: { id: string; name: string; albums: Album[] } | undefined, limit = 10) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.artistTop(scope, artist?.id ?? ''),
    enabled: enabled() && Boolean(artist),
    staleTime: 30 * 60_000,
    queryFn: async ({ signal }): Promise<{ songs: Song[]; source: 'server' | 'plays' }> => {
      const nd = getNavidrome();
      const a = artist as NonNullable<typeof artist>;
      try {
        const top = await nd.artists.topSongs(a.name, { count: limit }, { signal });
        if (top.length) return { songs: top, source: 'server' };
      } catch {
        /* fall through to local ranking */
      }
      const albums = await Promise.all(a.albums.slice(0, 12).map((al) => nd.albums.get(al.id, { signal }).catch(() => null)));
      const songs = albums.flatMap((al) => al?.songs ?? []);
      songs.sort((x, y) => (y.playCount ?? 0) - (x.playCount ?? 0) || (x.album ?? '').localeCompare(y.album ?? '') || (x.track ?? 0) - (y.track ?? 0));
      return { songs: songs.slice(0, limit), source: 'plays' };
    },
  });
}

/* ------------------------------------------------------------------ */
/* Songs, genres, search, lyrics                                       */
/* ------------------------------------------------------------------ */

export function useInfiniteSongs(opts: { genre?: string } = {}) {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: keys.songsInfinite(scope, opts.genre),
    queryFn: ({ pageParam, signal }) =>
      opts.genre
        ? getNavidrome().songs.byGenre(opts.genre, { count: 200, offset: pageParam }, { signal })
        : getNavidrome().songs.list({ count: 200, offset: pageParam }, { signal }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length < 200 ? undefined : pages.length * 200),
    enabled: enabled(),
  });
}

export function useRandomSongs(size = 50) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.random(scope, size),
    queryFn: ({ signal }) => getNavidrome().songs.random({ size }, { signal }),
    enabled: enabled(),
    staleTime: 10 * 60_000,
  });
}

export function useGenres() {
  const scope = useScope();
  return useQuery({
    queryKey: keys.genres(scope),
    queryFn: ({ signal }) => getNavidrome().genres.list({ signal }),
    enabled: enabled(),
  });
}

export function useSearch(query: string) {
  const scope = useScope();
  const q = query.trim();
  return useQuery({
    queryKey: keys.search(scope, q),
    queryFn: ({ signal }) => getNavidrome().search.all(q, { artistCount: 8, albumCount: 12, songCount: 25 }, { signal }),
    enabled: enabled() && q.length > 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useLyrics(song: Song | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.lyrics(scope, song?.id ?? ''),
    queryFn: ({ signal }) => getNavidrome().lyrics.forSong(song as Song, { signal }),
    enabled: enabled() && Boolean(song),
    staleTime: Infinity,
    retry: false,
  });
}

/* ------------------------------------------------------------------ */
/* Favorites                                                           */
/* ------------------------------------------------------------------ */

export function useStarred() {
  const scope = useScope();
  return useQuery({
    queryKey: keys.starred(scope),
    queryFn: ({ signal }) => getNavidrome().favorites.list({ signal }),
    enabled: enabled(),
    staleTime: 60_000,
  });
}

export function useIsStarred(kind: FavoriteKind, item: Song | Album | Artist | undefined): boolean {
  return useStore(favoriteOverridesStore, (s) => (item ? resolveStarred(s.overrides, kind, item) : false));
}

/** Optimistic favorite toggle for songs, albums and artists. */
export function useToggleFavorite() {
  const qc = useQueryClient();
  const scope = useScope();
  return useMutation({
    mutationFn: async ({ kind, item, starred }: { kind: FavoriteKind; item: Song | Album | Artist; starred: boolean }) => {
      const target = kind === 'song' ? { songIds: [item.id] } : kind === 'album' ? { albumIds: [item.id] } : { artistIds: [item.id] };
      await getNavidrome().favorites.set(target, starred);
    },
    onMutate: ({ kind, item, starred }) => {
      favoriteOverridesStore.getState().setOverride(kind, item.id, starred);
      if (kind === 'song') playerStore.getState().updateSong(item.id, { starred });
      // Reflect immediately in the Favorites lists too.
      const key = keys.starred(scope);
      const prev = qc.getQueryData<Starred>(key);
      if (prev) {
        const listKey = kind === 'song' ? 'songs' : kind === 'album' ? 'albums' : 'artists';
        const list = prev[listKey] as Array<Song | Album | Artist>;
        const without = list.filter((x) => x.id !== item.id);
        const next = starred ? [{ ...item, starred: true, starredAt: new Date().toISOString() }, ...without] : without;
        qc.setQueryData<Starred>(key, { ...prev, [listKey]: next });
      }
      return { prev };
    },
    onError: (err, { kind, item, starred }, ctx) => {
      favoriteOverridesStore.getState().setOverride(kind, item.id, !starred);
      if (kind === 'song') playerStore.getState().updateSong(item.id, { starred: !starred });
      if (ctx?.prev) qc.setQueryData(keys.starred(scope), ctx.prev);
      toast.error(`Couldn't update favorites. ${describeError(err)}`);
    },
    onSuccess: (_d, { starred, item }) => {
      toast.success(starred ? `Added “${'title' in item ? item.title : item.name}” to Favorites` : 'Removed from Favorites');
    },
    onSettled: async (_d, _e, { kind, item }) => {
      await qc.invalidateQueries({ queryKey: keys.starred(scope) });
      // Refresh entity caches in the background so `starred` is correct once the override is dropped.
      void qc.invalidateQueries({ predicate: (q) => ['album', 'artist', 'playlist', 'albums', 'search'].includes(String(q.queryKey[0])) });
      favoriteOverridesStore.getState().clearOverride(kind, item.id);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Playlists                                                           */
/* ------------------------------------------------------------------ */

export function usePlaylists() {
  const scope = useScope();
  return useQuery({
    queryKey: keys.playlists(scope),
    queryFn: ({ signal }) => getNavidrome().playlists.list({ signal }),
    enabled: enabled(),
    staleTime: 60_000,
  });
}

export function usePlaylist(id: string | undefined) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.playlist(scope, id ?? ''),
    queryFn: ({ signal }) => getNavidrome().playlists.get(id as string, { signal }),
    enabled: enabled() && Boolean(id),
    staleTime: 30_000,
  });
}

export function usePlaylistMutations() {
  const qc = useQueryClient();
  const scope = useScope();

  const invalidate = (id?: string) => {
    void qc.invalidateQueries({ queryKey: keys.playlists(scope) });
    if (id) void qc.invalidateQueries({ queryKey: keys.playlist(scope, id) });
  };

  const optimistic = (id: string, update: (p: PlaylistWithSongs) => PlaylistWithSongs) => {
    const key: QueryKey = keys.playlist(scope, id);
    const prev = qc.getQueryData<PlaylistWithSongs>(key);
    if (prev) qc.setQueryData(key, update(prev));
    return () => prev && qc.setQueryData(key, prev);
  };

  const onError = (err: unknown) => toast.error(describeError(err));

  const create = useMutation({
    mutationFn: ({ name, songs }: { name: string; songs?: Song[] }) =>
      getNavidrome().playlists.create(name, (songs ?? []).map((s) => s.id)),
    onSuccess: (p) => {
      qc.setQueryData(keys.playlist(scope, p.id), p);
      invalidate();
      toast.success(`Created “${p.name}”`);
    },
    onError,
  });

  const rename = useMutation({
    mutationFn: ({ id, name, comment }: { id: string; name: string; comment?: string }) =>
      getNavidrome().playlists.update(id, { name, comment }),
    onMutate: ({ id, name, comment }) => ({ rollback: optimistic(id, (p) => ({ ...p, name, comment: comment ?? p.comment })) }),
    onError: (err, _v, ctx) => {
      ctx?.rollback();
      onError(err);
    },
    onSettled: (_d, _e, { id }) => invalidate(id),
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string; name?: string }) => getNavidrome().playlists.remove(id),
    onSuccess: (_d, { id, name }) => {
      qc.removeQueries({ queryKey: keys.playlist(scope, id) });
      invalidate();
      toast.success(name ? `Deleted “${name}”` : 'Playlist deleted');
    },
    onError,
  });

  const addSongs = useMutation({
    mutationFn: ({ id, songs }: { id: string; name?: string; songs: Song[] }) =>
      getNavidrome().playlists.update(id, { songIdsToAdd: songs.map((s) => s.id) }),
    onMutate: ({ id, songs }) => ({
      rollback: optimistic(id, (p) => ({
        ...p,
        songs: [...p.songs, ...songs],
        songCount: p.songCount + songs.length,
        duration: p.duration + songs.reduce((t, s) => t + s.duration, 0),
      })),
    }),
    onSuccess: (_d, { name, songs }) =>
      toast.success(`Added ${songs.length === 1 ? `“${songs[0]?.title}”` : `${songs.length} songs`}${name ? ` to ${name}` : ''}`),
    onError: (err, _v, ctx) => {
      ctx?.rollback();
      onError(err);
    },
    onSettled: (_d, _e, { id }) => invalidate(id),
  });

  const removeSongs = useMutation({
    mutationFn: ({ id, indexes }: { id: string; indexes: number[] }) =>
      getNavidrome().playlists.update(id, { songIndexesToRemove: indexes }),
    onMutate: ({ id, indexes }) => ({
      rollback: optimistic(id, (p) => {
        const drop = new Set(indexes);
        const songs = p.songs.filter((_, i) => !drop.has(i));
        return { ...p, songs, songCount: songs.length, duration: songs.reduce((t, s) => t + s.duration, 0) };
      }),
    }),
    onError: (err, _v, ctx) => {
      ctx?.rollback();
      onError(err);
    },
    onSettled: (_d, _e, { id }) => invalidate(id),
  });

  const reorder = useMutation({
    mutationFn: ({ id, songs }: { id: string; songs: Song[] }) => getNavidrome().playlists.replaceSongs(id, songs.map((s) => s.id)),
    onMutate: ({ id, songs }) => ({ rollback: optimistic(id, (p) => ({ ...p, songs })) }),
    onError: (err, _v, ctx) => {
      ctx?.rollback();
      onError(err);
    },
    onSettled: (_d, _e, { id }) => invalidate(id),
  });

  return useMemo(
    () => ({ create, rename, remove, addSongs, removeSongs, reorder }),
    [create, rename, remove, addSongs, removeSongs, reorder],
  );
}

/** Loads all songs of a playlist/album for "add to queue" style actions. */
export async function fetchCollectionSongs(kind: 'album' | 'playlist' | 'artist', id: string): Promise<Song[]> {
  const nd = getNavidrome();
  if (kind === 'album') return (await nd.albums.get(id)).songs;
  if (kind === 'playlist') return (await nd.playlists.get(id)).songs;
  const artist = await nd.artists.get(id);
  const albums = await Promise.all(artist.albums.map((a) => nd.albums.get(a.id)));
  return albums.flatMap((a) => a.songs);
}
