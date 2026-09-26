import { useMemo } from 'react';
import { useParams } from 'react-router';
import { Shuffle } from 'lucide-react';
import { playerStore, useInfiniteAlbums, useInfiniteSongs } from '@sonora/core';
import { AlbumCard } from '../components/media/Cards';
import { Shelf } from '../components/media/Shelf';
import { TrackList } from '../components/media/TrackList';
import { Button } from '../components/ui/Button';
import { ErrorState } from '../components/ui/States';
import { ShelfSkeleton, TrackRowSkeleton } from '../components/ui/Skeleton';

export function GenrePage() {
  const { name = '' } = useParams();
  const genre = decodeURIComponent(name);
  const albums = useInfiniteAlbums('byGenre', { genre });
  const songs = useInfiniteSongs({ genre });
  const albumItems = useMemo(() => albums.data?.pages.flat() ?? [], [albums.data]);
  const songItems = useMemo(() => songs.data?.pages.flat() ?? [], [songs.data]);
  const context = { type: 'genre' as const, id: genre, name: genre };
  return (
    <div className="pt-2">
      <div className="relative px-4 pt-6 pb-6 md:px-6 md:pt-2">
        <p className="text-[13px] font-semibold text-fg-2">Genre</p>
        <h1 className="font-display text-[2.6rem] font-extrabold tracking-tight md:text-[3.6rem]">{genre}</h1>
        <Button
          variant="primary"
          className="mt-4"
          icon={<Shuffle className="size-4" />}
          disabled={!songItems.length}
          onClick={() => playerStore.getState().playSongs(songItems, Math.floor(Math.random() * songItems.length), { context, shuffle: true })}
        >
          Shuffle {genre}
        </Button>
      </div>
      <div className="flex flex-col gap-8 px-1 md:px-3">
        {albums.isError ? (
          <ErrorState error={albums.error} onRetry={() => void albums.refetch()} compact />
        ) : albums.isPending ? (
          <ShelfSkeleton />
        ) : (
          albumItems.length > 0 && (
            <Shelf title="Albums">
              {albumItems.map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
            </Shelf>
          )
        )}
        <section>
          <h2 className="px-3 pb-3 font-display text-[1.35rem] font-bold">Songs</h2>
          {songs.isPending ? <TrackRowSkeleton /> : <TrackList songs={songItems} context={context} label={`${genre} songs`} />}
          {songs.hasNextPage && (
            <div className="flex justify-center py-6">
              <Button variant="outline" loading={songs.isFetchingNextPage} onClick={() => void songs.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
