import { useMemo } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { Heart, Music2 } from 'lucide-react';
import type { Album, Artist } from '@sonora/types';
import {
  playerStore,
  recentSongs,
  useAlbumList,
  useArtists,
  useContextPlayState,
  useHistory,
  usePlaylists,
  useSession,
  useStarred,
} from '@sonora/core';
import { greeting, uniqueBy } from '@sonora/utils';
import { AlbumCard, ArtistCard, PlaylistCard } from '../components/media/Cards';
import { Shelf } from '../components/media/Shelf';
import { Artwork } from '../components/ui/Artwork';
import { PlayButton } from '../components/ui/PlayButton';
import { ErrorState, EmptyState } from '../components/ui/States';
import { ShelfSkeleton, Skeleton } from '../components/ui/Skeleton';
import { Chip } from '../components/ui/Controls';
import { playCollection } from '../lib/actions';
import { useState } from 'react';

function QuickTile({ album }: { album: Album }) {
  const { isCurrent, isPlaying } = useContextPlayState('album', album.id);
  return (
    <div className="group relative flex h-16 items-center gap-3 overflow-hidden rounded-md bg-fg/[0.07] pr-3 transition-colors hover:bg-fg/[0.14] focus-within:bg-fg/[0.14]">
      <Artwork coverArtId={album.coverArtId} size="thumb" rounded="sm" className="size-16 shrink-0 rounded-r-none shadow-card" />
      <Link to={`/album/${album.id}`} className="min-w-0 flex-1 truncate text-[14px] font-bold after:absolute after:inset-0 focus-visible:outline-none" title={album.name}>
        {album.name}
      </Link>
      <PlayButton
        size="sm"
        playing={isPlaying}
        label={isPlaying ? `Pause ${album.name}` : `Play ${album.name}`}
        className={clsx('relative z-10 max-md:hidden', isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100')}
        onClick={(e) => {
          e.preventDefault();
          if (isCurrent) playerStore.getState().togglePlay();
          else void playCollection('album', album.id, album.name);
        }}
      />
    </div>
  );
}

function FavoritesTile({ count }: { count: number }) {
  return (
    <Link
      to="/favorites"
      className="group relative flex h-16 items-center gap-3 overflow-hidden rounded-md bg-fg/[0.07] pr-3 transition-colors hover:bg-fg/[0.14]"
    >
      <span className="flex size-16 shrink-0 items-center justify-center bg-gradient-to-br from-accent to-[#FF5C7A] text-on-accent">
        <Heart className="size-6" fill="currentColor" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-bold">Favorite songs</span>
        <span className="block text-[12px] text-fg-2">{count} songs</span>
      </span>
    </Link>
  );
}

type Filter = 'all' | 'music' | 'playlists';

export function HomePage() {
  const username = useSession((s) => s.session?.user.username ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const recent = useAlbumList('recent', 20);
  const newest = useAlbumList('newest', 20);
  const frequent = useAlbumList('frequent', 20);
  const random = useAlbumList('random', 20);
  const starred = useStarred();
  const playlists = usePlaylists();
  const artists = useArtists();
  const history = useHistory((s) => s.entries);
  const played = useMemo(() => recentSongs(history, 12), [history]);

  // Artists you actually listen to: from recent/frequent albums and favorites.
  const yourArtists = useMemo<Artist[]>(() => {
    const all = artists.data ?? [];
    const byId = new Map(all.map((a) => [a.id, a]));
    const ids = [
      ...(starred.data?.artists.map((a) => a.id) ?? []),
      ...(recent.data?.map((a) => a.artistId) ?? []),
      ...(frequent.data?.map((a) => a.artistId) ?? []),
    ].filter((id): id is string => Boolean(id));
    const picked = uniqueBy(ids.map((id) => byId.get(id)).filter((a): a is Artist => Boolean(a)), (a) => a.id);
    if (picked.length >= 6) return picked.slice(0, 20);
    // New library with no listening data yet: show the artists with the most albums.
    const rest = [...all].sort((a, b) => b.albumCount - a.albumCount);
    return uniqueBy([...picked, ...rest], (a) => a.id).slice(0, 20);
  }, [artists.data, starred.data, recent.data, frequent.data]);

  const quick = useMemo(() => uniqueBy([...(recent.data ?? []), ...(frequent.data ?? []), ...(newest.data ?? [])], (a) => a.id).slice(0, 7), [recent.data, frequent.data, newest.data]);

  if (newest.isError && recent.isError) {
    return (
      <div className="pt-10">
        <ErrorState error={newest.error} onRetry={() => void Promise.all([newest.refetch(), recent.refetch()])} />
      </div>
    );
  }

  const libraryEmpty = newest.isSuccess && newest.data.length === 0;
  const showMusic = filter !== 'playlists';
  const showPlaylists = filter !== 'music';

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 -top-16 h-[340px] bg-gradient-to-b from-accent/25 via-accent/5 to-transparent max-md:top-0" aria-hidden />
      <div className="relative flex flex-col gap-8 px-2 pt-2 md:px-3">
        <div className="flex flex-col gap-4 px-3 pt-4 md:pt-2">
          <h1 className="font-display text-[1.9rem] font-extrabold tracking-tight md:text-[2.2rem]">
            {greeting()}
            {username && <span className="text-fg-2">, {username}</span>}
          </h1>
          <div className="flex gap-2" role="group" aria-label="Filter home">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
            <Chip active={filter === 'music'} onClick={() => setFilter('music')}>Music</Chip>
            <Chip active={filter === 'playlists'} onClick={() => setFilter('playlists')}>Playlists</Chip>
          </div>
          {showMusic && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {recent.isPending || newest.isPending
                ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-16 rounded-md" />)
                : [
                    <FavoritesTile key="fav" count={starred.data?.songs.length ?? 0} />,
                    ...quick.map((a) => <QuickTile key={a.id} album={a} />),
                  ]}
            </div>
          )}
        </div>

        {libraryEmpty && (
          <EmptyState
            icon={<Music2 />}
            title="Your library is empty"
            message="Add music to your Navidrome library folder and run a scan — it will show up here."
          />
        )}

        {showMusic && (recent.isPending ? <ShelfSkeleton /> : recent.data && recent.data.length > 0 && (
          <Shelf title="Recently played" to="/library/albums?sort=recent">
            {recent.data.map((a) => <AlbumCard key={a.id} album={a} />)}
          </Shelf>
        ))}

        {showMusic && played.length > 0 && (
          <Shelf title="Jump back in" subtitle="Tracks you played on this device" to="/history">
            {played.map((s, i) => (
              <div key={s.id} className="group relative rounded-lg p-3 hover:bg-surface-hover">
                <button
                  type="button"
                  aria-label={`Play ${s.title}`}
                  onClick={() => playerStore.getState().playSongs(played, i, { context: { type: 'songs', name: 'Recently played' } })}
                  className="block w-full text-left"
                >
                  <Artwork coverArtId={s.coverArtId} kind="song" className="aspect-square w-full shadow-card" />
                  <span className="mt-3 block truncate text-[15px] font-semibold">{s.title}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-fg-2">{s.artist}</span>
                </button>
              </div>
            ))}
          </Shelf>
        )}

        {showMusic && (newest.isPending ? <ShelfSkeleton /> : newest.data && newest.data.length > 0 && (
          <Shelf title="Recently added" to="/library/albums?sort=newest">
            {newest.data.map((a) => <AlbumCard key={a.id} album={a} />)}
          </Shelf>
        ))}

        {showMusic && starred.data && starred.data.albums.length > 0 && (
          <Shelf title="Your favorite albums" to="/favorites">
            {starred.data.albums.map((a) => <AlbumCard key={a.id} album={a} />)}
          </Shelf>
        )}

        {showPlaylists && (playlists.isPending ? <ShelfSkeleton /> : playlists.data && playlists.data.length > 0 && (
          <Shelf title="Your playlists" to="/library/playlists">
            {playlists.data.map((p) => <PlaylistCard key={p.id} playlist={p} />)}
          </Shelf>
        ))}

        {showMusic && frequent.data && frequent.data.length > 0 && (
          <Shelf title="Most played" to="/library/albums?sort=frequent">
            {frequent.data.map((a) => <AlbumCard key={a.id} album={a} />)}
          </Shelf>
        )}

        {showMusic && (artists.isPending ? <ShelfSkeleton round /> : yourArtists.length > 0 && (
          <Shelf title="Artists" to="/library/artists">
            {yourArtists.map((a) => <ArtistCard key={a.id} artist={a} />)}
          </Shelf>
        ))}

        {showMusic && random.data && random.data.length > 0 && (
          <Shelf title="Rediscover" subtitle="Random picks from your library" to="/library/albums?sort=random">
            {random.data.map((a) => <AlbumCard key={a.id} album={a} />)}
          </Shelf>
        )}
      </div>
    </div>
  );
}
