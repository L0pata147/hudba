import { useState } from 'react';
import { Heart, Shuffle } from 'lucide-react';
import { playerStore, useContextPlayState, usePreferences, useStarred } from '@sonora/core';
import { formatLongDuration, pluralize } from '@sonora/utils';
import { ActionBar, Dot, Hero } from '../components/media/Hero';
import { TrackList, relativeDate } from '../components/media/TrackList';
import { AlbumCard, ArtistCard } from '../components/media/Cards';
import { CardGrid } from '../components/media/Shelf';
import { PlayButton } from '../components/ui/PlayButton';
import { IconButton } from '../components/ui/Button';
import { Chip } from '../components/ui/Controls';
import { EmptyState, ErrorState } from '../components/ui/States';
import { TrackRowSkeleton } from '../components/ui/Skeleton';

type Section = 'songs' | 'albums' | 'artists';

export function FavoritesPage() {
  const starred = useStarred();
  const [section, setSection] = useState<Section>('songs');
  const { isCurrent, isPlaying } = useContextPlayState('favorites', 'songs');
  const compact = usePreferences((s) => s.compactMode);
  const songs = starred.data?.songs ?? [];
  const context = { type: 'favorites' as const, id: 'songs', name: 'Favorite songs' };
  const play = (shuffle = false) => {
    if (!songs.length) return;
    if (isCurrent && !shuffle) return playerStore.getState().togglePlay();
    playerStore.getState().playSongs(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, { context, shuffle: shuffle || undefined });
  };

  return (
    <div>
      <Hero
        kind="favorites"
        label="Collection"
        title="Favorites"
        art={
          <div className="flex size-[min(62vw,232px)] shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-accent via-[#FF6A5C] to-[#7B5CFF] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]">
            <Heart className="size-20 text-white" fill="currentColor" />
          </div>
        }
        meta={
          starred.data ? (
            <>
              <span>{pluralize(songs.length, 'song')}</span>
              <Dot />
              <span>{pluralize(starred.data.albums.length, 'album')}</span>
              <Dot />
              <span>{pluralize(starred.data.artists.length, 'artist')}</span>
              {songs.length > 0 && <span className="text-fg/70">, {formatLongDuration(songs.reduce((t, s) => t + s.duration, 0))}</span>}
            </>
          ) : undefined
        }
      />
      <ActionBar>
        <PlayButton size="lg" playing={isPlaying} onClick={() => play()} label={isPlaying ? 'Pause favorites' : 'Play favorites'} />
        <IconButton label="Shuffle favorites" size="lg" onClick={() => play(true)} disabled={!songs.length}>
          <Shuffle className="size-6" />
        </IconButton>
        <div className="ml-2 flex gap-2" role="group" aria-label="Favorites section">
          <Chip active={section === 'songs'} onClick={() => setSection('songs')}>Songs</Chip>
          <Chip active={section === 'albums'} onClick={() => setSection('albums')}>Albums</Chip>
          <Chip active={section === 'artists'} onClick={() => setSection('artists')}>Artists</Chip>
        </div>
      </ActionBar>
      {starred.isError ? (
        <ErrorState error={starred.error} onRetry={() => void starred.refetch()} />
      ) : starred.isPending ? (
        <TrackRowSkeleton />
      ) : section === 'songs' ? (
        songs.length ? (
          <TrackList songs={songs} context={context} dateColumn={{ label: 'Added', value: (s) => relativeDate(s.starredAt) }} variant={compact ? 'compact' : 'list'} label="Favorite songs" />
        ) : (
          <EmptyState icon={<Heart />} title="Songs you like will appear here" message="Save songs by tapping the heart icon." />
        )
      ) : section === 'albums' ? (
        starred.data.albums.length ? (
          <div className="px-1 md:px-3">
            <CardGrid>
              {starred.data.albums.map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
            </CardGrid>
          </div>
        ) : (
          <EmptyState icon={<Heart />} title="No favorite albums yet" />
        )
      ) : starred.data.artists.length ? (
        <div className="px-1 md:px-3">
          <CardGrid>
            {starred.data.artists.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </CardGrid>
        </div>
      ) : (
        <EmptyState icon={<Heart />} title="No favorite artists yet" />
      )}
    </div>
  );
}
