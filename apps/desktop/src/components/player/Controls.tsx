import { useState } from 'react';
import clsx from 'clsx';
import { Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume, Volume1, Volume2, VolumeX } from 'lucide-react';
import { playerStore, usePlayer, usePlayerShallow } from '@sonora/core';
import { formatDuration } from '@sonora/utils';
import { IconButton } from '../ui/Button';
import { PlayButton } from '../ui/PlayButton';
import { Slider } from '../ui/Slider';

export function useIsPlaying() {
  return usePlayer((s) => s.status === 'playing' || s.status === 'buffering' || s.status === 'loading');
}

export function TransportControls({ size = 'md', variant = 'light' }: { size?: 'md' | 'lg'; variant?: 'light' | 'accent' }) {
  const { shuffled, repeat, status, hasQueue } = usePlayerShallow((s) => ({
    shuffled: s.queue.shuffled,
    repeat: s.repeat,
    status: s.status,
    hasQueue: s.queue.items.length > 0,
  }));
  const playing = status === 'playing' || status === 'buffering' || status === 'loading';
  const big = size === 'lg';
  const s = playerStore.getState;
  return (
    <div className={clsx('flex items-center', big ? 'justify-between gap-2' : 'gap-2')}>
      <IconButton label={shuffled ? 'Disable shuffle' : 'Enable shuffle'} size={big ? 'lg' : 'sm'} active={shuffled} aria-pressed={shuffled} onClick={() => s().toggleShuffle()}>
        <Shuffle className={big ? 'size-6' : 'size-[18px]'} />
        {shuffled && <span className="absolute bottom-0.5 size-1 rounded-full bg-accent" aria-hidden />}
      </IconButton>
      <IconButton label="Previous" size={big ? 'lg' : 'sm'} disabled={!hasQueue} onClick={() => s().previous()} className="!text-fg">
        <SkipBack className={big ? 'size-8' : 'size-5'} fill="currentColor" />
      </IconButton>
      <PlayButton
        size={big ? 'xl' : 'sm'}
        variant={variant}
        playing={playing}
        loading={status === 'loading' || status === 'buffering'}
        onClick={() => s().togglePlay()}
      />
      <IconButton label="Next" size={big ? 'lg' : 'sm'} disabled={!hasQueue} onClick={() => s().next()} className="!text-fg">
        <SkipForward className={big ? 'size-8' : 'size-5'} fill="currentColor" />
      </IconButton>
      <IconButton
        label={repeat === 'off' ? 'Enable repeat' : repeat === 'all' ? 'Enable repeat one' : 'Disable repeat'}
        size={big ? 'lg' : 'sm'}
        active={repeat !== 'off'}
        onClick={() => s().cycleRepeat()}
      >
        {repeat === 'one' ? <Repeat1 className={big ? 'size-6' : 'size-[18px]'} /> : <Repeat className={big ? 'size-6' : 'size-[18px]'} />}
        {repeat !== 'off' && <span className="absolute bottom-0.5 size-1 rounded-full bg-accent" aria-hidden />}
      </IconButton>
    </div>
  );
}

export function ProgressBar({ className, layout = 'inline' }: { className?: string; layout?: 'inline' | 'stacked' }) {
  const { position, duration, buffered, hasItem } = usePlayerShallow((s) => ({
    position: s.position,
    duration: s.duration,
    buffered: s.buffered,
    hasItem: s.queue.index >= 0,
  }));
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? position;
  const slider = (
    <Slider
      label="Seek"
      value={position}
      max={duration}
      buffered={buffered}
      step={5}
      disabled={!hasItem || duration <= 0}
      valueText={`${formatDuration(shown)} of ${formatDuration(duration)}`}
      onScrub={setScrub}
      onChange={(v) => playerStore.getState().seek(v)}
      size={layout === 'stacked' ? 'md' : 'sm'}
      className="flex-1"
    />
  );
  if (layout === 'stacked') {
    return (
      <div className={className}>
        {slider}
        <div className="mt-1 flex justify-between text-[12px] text-fg-2 tabular-nums">
          <span>{formatDuration(shown)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={clsx('flex items-center gap-2.5 text-[12px] text-fg-2 tabular-nums', className)}>
      <span className="w-10 text-right">{formatDuration(shown)}</span>
      {slider}
      <span className="w-10">{formatDuration(duration)}</span>
    </div>
  );
}

export function VolumeControl({ className }: { className?: string }) {
  const { volume, muted } = usePlayerShallow((s) => ({ volume: s.volume, muted: s.muted }));
  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeX : effective < 0.34 ? Volume : effective < 0.67 ? Volume1 : Volume2;
  return (
    <div className={clsx('flex items-center gap-1.5', className)}>
      <IconButton label={muted ? 'Unmute' : 'Mute'} size="sm" onClick={() => playerStore.getState().toggleMute()}>
        <Icon className="size-[18px]" />
      </IconButton>
      <Slider
        label="Volume"
        value={effective * 100}
        max={100}
        step={5}
        valueText={`${Math.round(effective * 100)}%`}
        onScrub={(v) => v !== null && playerStore.getState().setVolume(v / 100)}
        onChange={(v) => playerStore.getState().setVolume(v / 100)}
        className="w-24"
      />
    </div>
  );
}
