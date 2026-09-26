import { useParams } from 'react-router';
import { ListMusic, MoreHorizontal, Pencil, Shuffle } from 'lucide-react';
import { moveItem, formatLongDuration, pluralize, formatRelativeTime } from '@sonora/utils';
import { playerStore, useContextPlayState, usePlaylist, usePlaylistMutations, usePreferences, useSession } from '@sonora/core';
import { ActionBar, Dot, Hero, HeroSkeleton } from '../components/media/Hero';
import { TrackList } from '../components/media/TrackList';
import { PlayButton } from '../components/ui/PlayButton';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState, ErrorState } from '../components/ui/States';
import { TrackRowSkeleton } from '../components/ui/Skeleton';
import { useItemMenus } from '../lib/actions';
import { useUi } from '../lib/ui-store';
import { useNavigate } from 'react-router';

export function PlaylistPage() {
  const { id } = useParams();
  const playlist = usePlaylist(id);
  const { reorder } = usePlaylistMutations();
  const { isCurrent, isPlaying } = useContextPlayState('playlist', id);
  const { openPlaylistMenu } = useItemMenus();
  const openDialog = useUi((s) => s.openDialog);
  const username = useSession((s) => s.session?.credentials.username);
  const compact = usePreferences((s) => s.compactMode);
  const navigate = useNavigate();

  if (playlist.isError) return <ErrorState error={playlist.error} onRetry={() => void playlist.refetch()} />;
  if (playlist.isPending || !playlist.data) {
    return (
      <>
        <HeroSkeleton />
        <TrackRowSkeleton />
      </>
    );
  }
  const p = playlist.data;
  const editable = !p.owner || p.owner === username;
  const context = { type: 'playlist' as const, id: p.id, name: p.name };
  const play = (shuffle = false) => {
    if (!p.songs.length) return;
    if (isCurrent && !shuffle) return playerStore.getState().togglePlay();
    const start = shuffle ? Math.floor(Math.random() * p.songs.length) : 0;
    playerStore.getState().playSongs(p.songs, start, { context, shuffle: shuffle || undefined });
  };

  return (
    <div>
      <Hero
        kind="playlist"
        label={p.public ? 'Public playlist' : 'Playlist'}
        title={p.name}
        coverArtId={p.coverArtId}
        description={p.comment}
        meta={
          <>
            {p.owner && <span className="font-bold">{p.owner}</span>}
            {p.owner && <Dot />}
            <span>{pluralize(p.songCount, 'song')}</span>
            {p.duration > 0 && <span className="text-fg/70">, {formatLongDuration(p.duration)}</span>}
            {p.changed && (
              <>
                <Dot /> <span className="text-fg/70">updated {formatRelativeTime(p.changed)}</span>
              </>
            )}
          </>
        }
      />
      <ActionBar>
        <PlayButton size="lg" playing={isPlaying} onClick={() => play()} label={isPlaying ? 'Pause playlist' : 'Play playlist'} />
        <IconButton label="Shuffle playlist" size="lg" onClick={() => play(true)} disabled={!p.songs.length}>
          <Shuffle className="size-6" />
        </IconButton>
        {editable && (
          <IconButton label="Edit details" size="lg" onClick={() => openDialog({ type: 'edit-playlist', playlist: p })}>
            <Pencil className="size-5" />
          </IconButton>
        )}
        <IconButton label="More options" size="lg" onClick={(e) => openPlaylistMenu(e, p, p.songs)}>
          <MoreHorizontal className="size-6" />
        </IconButton>
      </ActionBar>
      {p.songs.length === 0 ? (
        <EmptyState
          icon={<ListMusic />}
          title="This playlist is empty"
          message="Find songs you like and add them with the ⋯ menu or “Add to playlist”."
          action={
            <Button variant="primary" onClick={() => navigate('/search')}>
              Find songs
            </Button>
          }
        />
      ) : (
        <TrackList
          songs={p.songs}
          context={context}
          playlist={editable ? p : undefined}
          onReorder={editable ? (from, to) => reorder.mutate({ id: p.id, songs: moveItem(p.songs, from, to) }) : undefined}
          variant={compact ? 'compact' : 'list'}
          label={`${p.name} tracks`}
        />
      )}
    </div>
  );
}
