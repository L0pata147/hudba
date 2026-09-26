import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { MoreHorizontal, Shuffle } from 'lucide-react';
import { playerStore, useArtist, useArtistInfo, useArtistTopSongs, useContextPlayState } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { ActionBar, Dot, Hero, HeroSkeleton } from '../components/media/Hero';
import { TrackList } from '../components/media/TrackList';
import { AlbumCard, ArtistCard } from '../components/media/Cards';
import { CardGrid, Shelf } from '../components/media/Shelf';
import { PlayButton } from '../components/ui/PlayButton';
import { Button, IconButton } from '../components/ui/Button';
import { ErrorState } from '../components/ui/States';
import { ShelfSkeleton, TrackRowSkeleton } from '../components/ui/Skeleton';
import { FavoriteButton } from '../components/player/FavoriteButton';
import { playCollection, useItemMenus } from '../lib/actions';

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').trim();
}

export function ArtistPage() {
  const { id } = useParams();
  const artist = useArtist(id);
  const info = useArtistInfo(id);
  const top = useArtistTopSongs(artist.data);
  const { isCurrent, isPlaying } = useContextPlayState('artist', id);
  const { openArtistMenu } = useItemMenus();
  const [showAllTop, setShowAllTop] = useState(false);

  const albums = useMemo(() => [...(artist.data?.albums ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)), [artist.data]);
  const bio = useMemo(() => (info.data?.biography ? stripHtml(info.data.biography) : ''), [info.data]);

  if (artist.isError) return <ErrorState error={artist.error} onRetry={() => void artist.refetch()} />;
  if (artist.isPending || !artist.data) {
    return (
      <>
        <HeroSkeleton round />
        <TrackRowSkeleton count={5} />
      </>
    );
  }
  const a = artist.data;
  const topSongs = top.data?.songs ?? [];
  const context = { type: 'artist' as const, id: a.id, name: a.name };

  const play = (shuffle = false) => {
    if (isCurrent && !shuffle) return playerStore.getState().togglePlay();
    void playCollection('artist', a.id, a.name, { shuffle });
  };

  return (
    <div>
      <Hero
        kind="artist"
        label="Artist"
        title={a.name}
        coverArtId={a.coverArtId}
        imageUrl={info.data?.largeImageUrl ?? a.imageUrl}
        round
        description={bio || undefined}
        meta={
          <>
            <span>{pluralize(a.albumCount || albums.length, 'album')}</span>
            {a.starred && (
              <>
                <Dot /> <span>In your favorites</span>
              </>
            )}
          </>
        }
      />
      <ActionBar>
        <PlayButton size="lg" playing={isPlaying} onClick={() => play()} label={isPlaying ? 'Pause artist' : 'Play artist'} />
        <IconButton label="Shuffle artist" size="lg" onClick={() => play(true)}>
          <Shuffle className="size-6" />
        </IconButton>
        <FavoriteButton kind="artist" item={a} size="lg" />
        <IconButton label="More options" size="lg" onClick={(e) => openArtistMenu(e, a)}>
          <MoreHorizontal className="size-6" />
        </IconButton>
      </ActionBar>

      <section className="mb-8" aria-label="Popular tracks">
        <h2 className="px-4 pb-3 font-display text-[1.35rem] font-bold md:px-6">
          {top.data?.source === 'server' ? 'Popular' : topSongs.some((s) => (s.playCount ?? 0) > 0) ? 'Most played by you' : 'Tracks'}
        </h2>
        {top.isPending ? (
          <TrackRowSkeleton count={5} />
        ) : topSongs.length ? (
          <>
            <TrackList songs={showAllTop ? topSongs : topSongs.slice(0, 5)} context={{ ...context, name: `${a.name} · Popular` }} showHeader={false} showAlbum={false} label="Popular tracks" />
            {topSongs.length > 5 && (
              <Button variant="ghost" size="sm" className="mt-2 ml-6" onClick={() => setShowAllTop((v) => !v)}>
                {showAllTop ? 'Show less' : 'Show more'}
              </Button>
            )}
          </>
        ) : (
          <p className="px-6 text-sm text-fg-2">No tracks yet.</p>
        )}
      </section>

      <section className="px-1 md:px-3" aria-label="Discography">
        <h2 className="px-3 pb-1 font-display text-[1.35rem] font-bold">Discography</h2>
        <CardGrid>
          {albums.map((al) => (
            <AlbumCard key={al.id} album={al} subtitle={[al.year, pluralize(al.songCount, 'song')].filter(Boolean).join(' · ')} />
          ))}
        </CardGrid>
      </section>

      {info.isPending ? (
        <div className="mt-8">
          <ShelfSkeleton round />
        </div>
      ) : info.data && info.data.similarArtists.length > 0 ? (
        <div className="mt-8 px-1 md:px-3">
          <Shelf title="Similar artists in your library">
            {info.data.similarArtists.map((s) => (
              <ArtistCard key={s.id} artist={s} />
            ))}
          </Shelf>
        </div>
      ) : null}
    </div>
  );
}
