import { Link } from 'react-router';
import clsx from 'clsx';
import { playerStore, useContextPlayState, type DailyMix } from '@sonora/core';
import { PlayButton } from '../ui/PlayButton';
import { MixArt } from './MixArt';

export function playMix(mix: DailyMix, shuffle = false) {
  if (!mix.songs.length) return;
  playerStore.getState().playSongs(mix.songs, shuffle ? Math.floor(Math.random() * mix.songs.length) : 0, { context: { type: 'mix', id: mix.id, name: mix.name }, shuffle: shuffle || undefined });
}

/** Home shelf card for a daily mix. */
export function MixCard({ mix, index }: { mix: DailyMix; index: number }) {
  const { isCurrent, isPlaying } = useContextPlayState('mix', mix.id);
  return (
    <div className="group relative rounded-lg p-3 transition-colors duration-200 hover:bg-surface-hover focus-within:bg-surface-hover">
      <div className="relative">
        <MixArt name={mix.name} coverArtIds={mix.coverArtIds} index={index} className="aspect-square w-full shadow-card" />
        <div
          className={clsx(
            'absolute right-2 bottom-2 z-10 transition-all duration-200 ease-soft',
            isCurrent ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100',
          )}
        >
          <PlayButton
            size="md"
            playing={isPlaying}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isCurrent) playerStore.getState().togglePlay();
              else playMix(mix);
            }}
            label={isPlaying ? `Pause ${mix.name}` : `Play ${mix.name}`}
            className="relative z-10"
          />
        </div>
      </div>
      <Link to={`/mix/${encodeURIComponent(mix.id)}`} className={clsx('mt-3 block truncate text-[15px] font-semibold after:absolute after:inset-0 after:content-[""] focus-visible:outline-none', isCurrent && 'text-accent')} title={mix.name}>
        {mix.name}
      </Link>
      <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-2">{mix.description}</p>
    </div>
  );
}
