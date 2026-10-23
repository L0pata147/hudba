import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { CloudUpload, Dices, ListEnd, ListStart, MoreHorizontal, Pencil, RefreshCw, Shuffle, Sparkles, Trash2 } from 'lucide-react';
import { formatLongDuration, pluralize } from '@sonora/utils';
import {
  describeSmartRules,
  evaluateSmartPlaylist,
  playerStore,
  smartPlaylistsStore,
  toast,
  useContextPlayState,
  useLibrarySongs,
  usePlaylistMutations,
  usePreferences,
  useSmartPlaylists,
} from '@sonora/core';
import { ActionBar, Dot, Hero, HeroSkeleton } from '../components/media/Hero';
import { TrackList } from '../components/media/TrackList';
import { PlayButton } from '../components/ui/PlayButton';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState, ErrorState } from '../components/ui/States';
import { TrackRowSkeleton } from '../components/ui/Skeleton';
import { openMenuFrom, useUi } from '../lib/ui-store';
import { SmartArt } from '../components/media/SmartArt';

/** A seeded random so a "random" smart playlist keeps its order until you reshuffle it. */
function seededRandom(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function SmartPlaylistPage() {
  const { id = '' } = useParams();
  const smart = useSmartPlaylists((s) => s.playlists.find((p) => p.id === id));
  const library = useLibrarySongs();
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const { isCurrent, isPlaying } = useContextPlayState('smart', id);
  const openDialog = useUi((s) => s.openDialog);
  const compact = usePreferences((s) => s.compactMode);
  const { create } = usePlaylistMutations();
  const navigate = useNavigate();
  const songs = useMemo(
    () => (smart && library.data ? evaluateSmartPlaylist(library.data, smart.rules, Date.now(), seededRandom(seed)) : []),
    [smart, library.data, seed],
  );

  if (!smart) {
    return <EmptyState icon={<Sparkles />} title="This smart playlist no longer exists" action={<Button onClick={() => navigate('/library/playlists')}>Your playlists</Button>} />;
  }
  if (library.isError) return <ErrorState error={library.error} onRetry={() => void library.refetch()} />;

  const context = { type: 'smart' as const, id: smart.id, name: smart.name };
  const duration = songs.reduce((s, x) => s + x.duration, 0);
  const play = (shuffle = false) => {
    if (!songs.length) return;
    if (isCurrent && !shuffle) return playerStore.getState().togglePlay();
    playerStore.getState().playSongs(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, { context, shuffle: shuffle || undefined });
  };
  const more = (e: React.MouseEvent) =>
    openMenuFrom(e, [
      { id: 'next', label: 'Play next', icon: <ListStart />, disabled: !songs.length, onSelect: () => playerStore.getState().playNext(songs) },
      { id: 'end', label: 'Add to queue', icon: <ListEnd />, disabled: !songs.length, onSelect: () => playerStore.getState().addToQueue(songs) },
      ...(smart.rules.sort === 'random' ? [{ id: 'reshuffle', label: 'Pick again', icon: <Dices />, onSelect: () => setSeed((s) => s + 1) }] : []),
      { id: 'refresh', label: 'Re-read the library', icon: <RefreshCw />, onSelect: () => void library.refetch() },
      {
        id: 'save',
        label: 'Save to server as a playlist',
        icon: <CloudUpload />,
        separatorBefore: true,
        disabled: !songs.length,
        // a normal playlist with today's songs: it shows up in other apps and on your phone
        onSelect: () => create.mutate({ name: smart.name, songs }, { onSuccess: (p) => toast.success(`Saved “${p.name}” to the server`) }),
      },
      { id: 'edit', label: 'Edit rules', icon: <Pencil />, onSelect: () => openDialog({ type: 'smart-playlist', id: smart.id }) },
      {
        id: 'delete',
        label: 'Delete smart playlist',
        icon: <Trash2 />,
        danger: true,
        onSelect: () =>
          openDialog({
            type: 'confirm',
            title: 'Delete smart playlist?',
            message: `“${smart.name}” and its rules will be removed from this computer. Your songs stay where they are.`,
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: () => {
              smartPlaylistsStore.getState().remove(smart.id);
              navigate('/library/playlists');
            },
          }),
      },
    ]);

  return (
    <div>
      {library.isPending ? (
        <HeroSkeleton />
      ) : (
        <Hero
          kind="playlist"
          label="Smart playlist"
          title={smart.name}
          art={<SmartArt className="size-[min(62vw,232px)] shrink-0 rounded-md shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]" />}
          description={describeSmartRules(smart.rules)}
          meta={
            <>
              <span>{pluralize(songs.length, 'song')}</span>
              {duration > 0 && <span className="text-fg/70">, {formatLongDuration(duration)}</span>}
              <Dot />
              <span className="text-fg/70">updates by itself</span>
            </>
          }
        />
      )}
      <ActionBar>
        <PlayButton size="lg" playing={isPlaying} onClick={() => play()} label={isPlaying ? 'Pause smart playlist' : 'Play smart playlist'} />
        <IconButton label="Shuffle smart playlist" size="lg" onClick={() => play(true)} disabled={!songs.length}>
          <Shuffle className="size-6" />
        </IconButton>
        <IconButton label="Edit rules" size="lg" onClick={() => openDialog({ type: 'smart-playlist', id: smart.id })}>
          <Pencil className="size-5" />
        </IconButton>
        <IconButton label="More options" size="lg" onClick={more}>
          <MoreHorizontal className="size-6" />
        </IconButton>
      </ActionBar>
      {library.isPending ? (
        <>
          <p className="px-6 pb-2 text-[14px] text-fg-2">Reading your library…</p>
          <TrackRowSkeleton />
        </>
      ) : songs.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="No songs match these rules"
          message="Loosen a rule or two — for example allow more years or more genres."
          action={
            <Button variant="primary" onClick={() => openDialog({ type: 'smart-playlist', id: smart.id })}>
              Edit rules
            </Button>
          }
        />
      ) : (
        <TrackList songs={songs} context={context} variant={compact ? 'compact' : 'list'} label={`${smart.name} tracks`} />
      )}
    </div>
  );
}
