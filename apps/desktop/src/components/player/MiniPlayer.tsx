import { useRef, useState } from 'react';
import { playerStore, useCurrentItem, usePlayer } from '@sonora/core';
import { Artwork } from '../ui/Artwork';
import { PauseGlyph, PlayGlyph } from '../ui/PlayButton';
import { useDominantColor } from '../../hooks/useDominantColor';
import { rgbToCss } from '@sonora/ui';
import { useUi } from '../../lib/ui-store';
import { FavoriteButton } from './FavoriteButton';

/**
 * Mobile mini player. Tap opens the full player, swipe left/right skips,
 * swipe up expands.
 */
export function MiniPlayer() {
  const item = useCurrentItem();
  const status = usePlayer((s) => s.status);
  const progress = usePlayer((s) => (s.duration > 0 ? s.position / s.duration : 0));
  const color = useDominantColor(item?.song.coverArtId);
  const open = useUi((s) => s.setNowPlayingOpen);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  if (!item) return null;
  const { song } = item;
  const playing = status === 'playing' || status === 'buffering' || status === 'loading';

  return (
    <div className="px-2 pb-1.5">
      <div
        role="button"
        tabIndex={0}
        aria-label={`Now playing: ${song.title} by ${song.artist}. Open player`}
        onClick={() => Math.abs(dx) < 6 && open(true)}
        onKeyDown={(e) => e.key === 'Enter' && open(true)}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const ddx = e.clientX - start.current.x;
          if (Math.abs(ddx) > 8) setDx(ddx);
          if (start.current.y - e.clientY > 40) {
            start.current = null;
            setDx(0);
            open(true);
          }
        }}
        onPointerUp={() => {
          if (dx > 70) playerStore.getState().previous();
          else if (dx < -70) playerStore.getState().next();
          start.current = null;
          setTimeout(() => setDx(0), 0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
        className="relative flex h-[58px] touch-pan-y items-center gap-3 overflow-hidden rounded-md pr-1 pl-2 shadow-pop transition-[background-color] duration-500"
        style={{ backgroundColor: rgbToCss(color) }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 transition-transform" style={{ transform: `translateX(${dx * 0.5}px)` }}>
          <Artwork coverArtId={song.coverArtId} size="thumb" kind="song" rounded="sm" className="size-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-white">{song.title}</div>
            <div className="truncate text-[12.5px] text-white/70">{song.artist}</div>
          </div>
        </div>
        <FavoriteButton kind="song" item={song} size="md" className="!text-white" />
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={(e) => {
            e.stopPropagation();
            playerStore.getState().togglePlay();
          }}
          className="flex size-10 items-center justify-center rounded-full text-white active:scale-90"
        >
          {playing ? <PauseGlyph className="size-6" /> : <PlayGlyph className="size-6" />}
        </button>
        <div className="absolute inset-x-2 bottom-0 h-[2px] overflow-hidden rounded-full bg-white/20" aria-hidden>
          <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
