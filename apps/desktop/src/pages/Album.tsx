import { useParams, Link } from 'react-router';
import { ListPlus, MoreHorizontal, Shuffle } from 'lucide-react';
import { playerStore, useAlbum, useContextPlayState, usePreferences } from '@sonora/core';
import { formatLongDuration, pluralize } from '@sonora/utils';
import { ActionBar, Dot, Hero, HeroSkeleton } from '../components/media/Hero';
import { TrackList } from '../components/media/TrackList';
import { AlbumCard } from '../components/media/Cards';
import { Shelf } from '../components/media/Shelf';
import { PlayButton } from '../components/ui/PlayButton';
import { IconButton } from '../components/ui/Button';
import { ErrorState } from '../components/ui/States';
import { TrackRowSkeleton } from '../components/ui/Skeleton';
import { FavoriteButton } from '../components/player/FavoriteButton';
import { useItemMenus } from '../lib/actions';
import { useUi } from '../lib/ui-store';
import { useArtist } from '@sonora/core';

export function AlbumPage() {
  const { id } = useParams();
  const album = useAlbum(id);
  const artist = useArtist(album.data?.artistId);
  const { isCurrent, isPlaying } = useContextPlayState('album', id);
  const { openAlbumMenu } = useItemMenus();
  const openDialog = useUi((s) => s.openDialog);
  const compact = usePreferences((s) => s.compactMode);

  if (album.isError) return <ErrorState error={album.error} onRetry={() => void album.refetch()} />;
  if (album.isPending || !album.data) {
    return (
      <>
        <HeroSkeleton />
        <TrackRowSkeleton />
      </>
    );
  }
  const a = album.data;
  const context = { type: 'album' as const, id: a.id, name: a.name };
  const multiDisc = new Set(a.songs.map((s) => s.discNumber ?? 1)).size > 1;
  const more = (artist.data?.albums ?? []).filter((x) => x.id !== a.id);

  const play = (shuffle = false) => {
    if (isCurrent && !shuffle) return playerStore.getState().togglePlay();
    const start = shuffle ? Math.floor(Math.random() * a.songs.length) : 0;
    playerStore.getState().playSongs(a.songs, start, { context, shuffle: shuffle || undefined });
  };

  return (
    <div>
      <Hero
        kind="album"
        label={a.isCompilation ? 'Compilation' : 'Album'}
        title={a.name}
        coverArtId={a.coverArtId}
        meta={
          <>
            {a.artistId ? (
              <Link to={`/artist/${a.artistId}`} className="font-bold hover:underline">
                {a.artist}
              </Link>
            ) : (
              <span className="font-bold">{a.artist}</span>
            )}
            {a.year && (
              <>
                <Dot /> <span>{a.year}</span>
              </>
            )}
            <Dot /> <span>{pluralize(a.songCount || a.songs.length, 'song')},</span>
            <span className="text-fg/70">{formatLongDuration(a.duration)}</span>
            {a.genres.length > 0 && (
              <>
                <Dot />
                {a.genres.map((g, i) => (
                  <Link key={g} to={`/genre/${encodeURIComponent(g)}`} className="text-fg/70 hover:underline">
                    {g}
                    {i < a.genres.length - 1 ? ',' : ''}
                  </Link>
                ))}
              </>
            )}
          </>
        }
      />
      <ActionBar>
        <PlayButton size="lg" playing={isPlaying} onClick={() => play()} label={isPlaying ? 'Pause album' : 'Play album'} />
        <IconButton label="Shuffle album" size="lg" onClick={() => play(true)}>
          <Shuffle className="size-6" />
        </IconButton>
        <FavoriteButton kind="album" item={a} size="lg" />
        <IconButton label="Add album to playlist" size="lg" onClick={() => openDialog({ type: 'add-to-playlist', songs: a.songs })}>
          <ListPlus className="size-6" />
        </IconButton>
        <IconButton label="More options" size="lg" onClick={(e) => openAlbumMenu(e, a, a.songs)}>
          <MoreHorizontal className="size-6" />
        </IconButton>
      </ActionBar>

      <TrackList
        songs={a.songs}
        context={context}
        numbering="track"
        showArtwork={false}
        showAlbum={false}
        variant={compact ? 'compact' : 'list'}
        label={`${a.name} tracks`}
      />
      {multiDisc && <p className="px-7 pt-3 text-[12.5px] text-fg-3">Multiple discs — tracks are ordered by disc and track number.</p>}

      {a.created && (
        <p className="px-7 pt-6 text-[12.5px] text-fg-3">
          Added {new Date(a.created).toLocaleDateString(undefined, { dateStyle: 'long' })}
        </p>
      )}

      {more.length > 0 && (
        <div className="mt-10 px-1 md:px-3">
          <Shelf title={`More by ${a.artist}`} to={a.artistId ? `/artist/${a.artistId}` : undefined}>
            {more.map((x) => (
              <AlbumCard key={x.id} album={x} subtitle={x.year ? String(x.year) : 'Album'} />
            ))}
          </Shelf>
        </div>
      )}
    </div>
  );
}
