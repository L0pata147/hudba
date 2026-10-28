import { useNavigate, useParams } from 'react-router';
import { CloudUpload, ListEnd, ListStart, MoreHorizontal, RefreshCw, Shuffle, Sparkles } from 'lucide-react';
import { formatLongDuration, pluralize } from '@sonora/utils';
import { playerStore, toast, useContextPlayState, useDailyMixes, usePlaylistMutations, usePreferences } from '@sonora/core';
import { ActionBar, Dot, Hero, HeroSkeleton } from '../components/media/Hero';
import { TrackList } from '../components/media/TrackList';
import { PlayButton } from '../components/ui/PlayButton';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState, ErrorState } from '../components/ui/States';
import { TrackRowSkeleton } from '../components/ui/Skeleton';
import { openMenuFrom } from '../lib/ui-store';
import { MixArt } from '../components/mixes/MixArt';
import { playMix } from '../components/mixes/MixCard';

/** One of today's daily mixes. */
export function MixPage() {
  const { id = '' } = useParams();
  const { mixes, loading, error, remake, remaking } = useDailyMixes();
  const index = mixes.findIndex((m) => m.id === id);
  const mix = mixes[index];
  const { isCurrent, isPlaying } = useContextPlayState('mix', id);
  const compact = usePreferences((s) => s.compactMode);
  const { create } = usePlaylistMutations();
  const navigate = useNavigate();

  if (error) return <ErrorState error={error} />;
  if (loading) {
    return (
      <div>
        <HeroSkeleton />
        <p className="px-6 pb-2 text-[14px] text-fg-2">Making today’s mixes…</p>
        <TrackRowSkeleton />
      </div>
    );
  }
  if (!mix) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="This mix isn’t in today’s mixes"
        message="Daily mixes change every day."
        action={<Button onClick={() => navigate('/')}>Today’s mixes</Button>}
      />
    );
  }

  const duration = mix.songs.reduce((s, x) => s + x.duration, 0);
  const day = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' });
  const more = (e: React.MouseEvent) =>
    openMenuFrom(e, [
      { id: 'next', label: 'Play next', icon: <ListStart />, onSelect: () => playerStore.getState().playNext(mix.songs) },
      { id: 'end', label: 'Add to queue', icon: <ListEnd />, onSelect: () => playerStore.getState().addToQueue(mix.songs) },
      {
        id: 'save',
        label: 'Save to server as a playlist',
        icon: <CloudUpload />,
        separatorBefore: true,
        // the mix changes tomorrow; a playlist keeps today's songs
        onSelect: () => create.mutate({ name: `${mix.name} ${day}`, songs: mix.songs }, { onSuccess: (p) => toast.success(`Saved “${p.name}” to the server`) }),
      },
      {
        id: 'remake',
        label: 'Make new mixes for today',
        icon: <RefreshCw />,
        disabled: remaking,
        onSelect: () => void remake().catch(() => toast.error('Couldn’t read your library. Try again.')),
      },
    ]);

  return (
    <div>
      <Hero
        kind="playlist"
        label="Daily mix"
        title={mix.name}
        art={<MixArt large name={mix.name} coverArtIds={mix.coverArtIds} index={index} className="size-[min(62vw,232px)] shrink-0 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]" />}
        description={mix.description}
        meta={
          <>
            <span>{pluralize(mix.songs.length, 'song')}</span>
            {duration > 0 && <span className="text-fg/70">, {formatLongDuration(duration)}</span>}
            <Dot />
            <span className="text-fg/70">a new mix tomorrow</span>
          </>
        }
      />
      <ActionBar>
        <PlayButton
          size="lg"
          playing={isPlaying}
          onClick={() => (isCurrent ? playerStore.getState().togglePlay() : playMix(mix))}
          label={isPlaying ? 'Pause mix' : 'Play mix'}
        />
        <IconButton label="Shuffle mix" size="lg" onClick={() => playMix(mix, true)}>
          <Shuffle className="size-6" />
        </IconButton>
        <IconButton label="More options" size="lg" onClick={more}>
          <MoreHorizontal className="size-6" />
        </IconButton>
      </ActionBar>
      <TrackList songs={mix.songs} context={{ type: 'mix', id: mix.id, name: mix.name }} variant={compact ? 'compact' : 'list'} label={`${mix.name} tracks`} />
    </div>
  );
}
