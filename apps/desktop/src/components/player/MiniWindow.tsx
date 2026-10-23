import { Maximize2, SkipBack, SkipForward } from 'lucide-react';
import { playerStore, useCurrentItem, usePlayer, usePlayerShallow } from '@sonora/core';
import { Artwork } from '../ui/Artwork';
import { IconButton } from '../ui/Button';
import { PlayButton } from '../ui/PlayButton';
import { useMiniMode } from '../../lib/mini-mode';

/**
 * The mini player: the whole window as a small strip on top of other windows —
 * cover, title, controls and progress. Drag it anywhere by its background.
 */
export function MiniWindow() {
  const item = useCurrentItem();
  const status = usePlayer((s) => s.status);
  const { position, duration } = usePlayerShallow((s) => ({ position: s.position, duration: s.duration }));
  const exit = useMiniMode((s) => s.exit);
  const playing = status === 'playing' || status === 'buffering' || status === 'loading';
  const song = item?.song;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <div data-tauri-drag-region data-testid="mini-player" className="skin-bg relative flex h-screen items-center gap-3 overflow-hidden bg-bg-elevated px-3 select-none">
      <Artwork coverArtId={song?.coverArtId} size="thumb" kind="song" rounded="sm" className="pointer-events-none size-[76px] shrink-0 shadow-lg" />
      <div data-tauri-drag-region className="min-w-0 flex-1">
        <p data-tauri-drag-region className="truncate text-[14px] font-bold">
          {song?.title ?? 'Nothing playing'}
        </p>
        <p data-tauri-drag-region className="truncate text-[12.5px] text-fg-2">
          {song?.artist ?? 'Pick something in the full window'}
        </p>
        <div className="mt-2 flex items-center gap-1">
          <IconButton label="Previous" size="sm" disabled={!song} onClick={() => playerStore.getState().previous()}>
            <SkipBack className="size-4" fill="currentColor" />
          </IconButton>
          <PlayButton size="sm" playing={playing} onClick={() => playerStore.getState().togglePlay()} label={playing ? 'Pause' : 'Play'} />
          <IconButton label="Next" size="sm" disabled={!song} onClick={() => playerStore.getState().next()}>
            <SkipForward className="size-4" fill="currentColor" />
          </IconButton>
        </div>
      </div>
      <IconButton label="Back to the full window" size="sm" className="self-start" onClick={() => void exit()}>
        <Maximize2 className="size-4" />
      </IconButton>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10" aria-hidden>
        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
