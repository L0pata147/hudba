import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { AudioLines, ChevronDown, ListMusic, MicVocal, MoreHorizontal, SlidersVertical } from 'lucide-react';
import { rgbToCss } from '@sonora/ui';
import { playerStore, preferencesStore, useCurrentItem, usePlayer, usePreferences } from '@sonora/core';
import { Artwork } from '../ui/Artwork';
import { IconButton } from '../ui/Button';
import { useDominantColor } from '../../hooks/useDominantColor';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useUi } from '../../lib/ui-store';
import { useItemMenus } from '../../lib/actions';
import { FavoriteButton } from './FavoriteButton';
import { ProgressBar, TransportControls, VolumeControl } from './Controls';
import { QueuePanel } from './QueuePanel';
import { Lyrics } from './Lyrics';
import { Visualizer } from './Visualizer';

/**
 * Full-screen "Now Playing" view (mobile full player / desktop immersive
 * mode). Background is tinted by the artwork's dominant color. On touch:
 * swipe down to close, swipe the artwork sideways to skip.
 */
export function NowPlaying() {
  const open = useUi((s) => s.nowPlayingOpen);
  const setOpen = useUi((s) => s.setNowPlayingOpen);
  const lyricsOpen = useUi((s) => s.lyricsOpen);
  const openDialog = useUi((s) => s.openDialog);
  const eqOn = usePreferences((s) => s.equalizer.enabled);
  const visualizer = usePreferences((s) => s.visualizer);
  const toggleVisualizer = () => preferencesStore.getState().set('visualizer', !preferencesStore.getState().visualizer);
  const setLyricsOpen = useUi((s) => s.setLyricsOpen);
  const [panel, setPanel] = useState<'none' | 'queue'>('none');
  const item = useCurrentItem();
  const context = usePlayer((s) => s.context);
  const color = useDominantColor(item?.song.coverArtId);
  const isMobile = useIsMobile();
  const { openSongMenu } = useItemMenus();
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === 'v' || e.key === 'V') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) toggleVisualizer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!item && open) setOpen(false);
  }, [item, open, setOpen]);

  if (!open || !item) return null;
  const { song } = item;
  const showSide = lyricsOpen || panel === 'queue';

  const onPointerUp = () => {
    if (!drag.current) return;
    if (offset.y > 120) setOpen(false);
    else if (offset.x < -80) playerStore.getState().next();
    else if (offset.x > 80) playerStore.getState().previous();
    drag.current = null;
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing: ${song.title}`}
      className="animate-sheet-up fixed inset-0 z-[70] flex flex-col overflow-hidden text-fg"
      style={{
        backgroundColor: 'var(--bg)',
        backgroundImage: `linear-gradient(180deg, ${rgbToCss(color)} 0%, ${rgbToCss(color, 0.55)} 45%, var(--bg) 100%)`,
        transform: offset.y > 0 ? `translateY(${offset.y}px)` : undefined,
        transition: drag.current ? 'none' : 'transform .25s',
      }}
    >
      <div className="safe-bottom mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 flex-col px-5 pt-[max(env(safe-area-inset-top),12px)] md:px-10">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3">
          <IconButton ref={closeRef} label="Close player" onClick={() => setOpen(false)} className="!text-fg">
            <ChevronDown className="size-7" />
          </IconButton>
          <div className="min-w-0 text-center">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-fg/70 uppercase">Playing from {context?.type ?? 'queue'}</p>
            <p className="truncate text-[14px] font-bold">{context?.name ?? 'Your queue'}</p>
          </div>
          <IconButton label="More options" onClick={(e) => openSongMenu(e, song, { queueUid: item.uid })} className="!text-fg">
            <MoreHorizontal className="size-6" />
          </IconButton>
        </header>

        <div className={clsx('grid min-h-0 flex-1 gap-8', showSide && !isMobile ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : 'grid-cols-1')}>
          <div className={clsx('flex min-h-0 flex-col justify-center', showSide && isMobile && 'hidden')}>
            <div
              className="flex min-h-0 flex-1 touch-none items-center justify-center py-4"
              onPointerDown={(e) => {
                drag.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const dx = e.clientX - drag.current.x;
                const dy = e.clientY - drag.current.y;
                setOffset(Math.abs(dy) > Math.abs(dx) ? { x: 0, y: Math.max(0, dy) } : { x: dx, y: 0 });
              }}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {visualizer ? (
                // Fill only backwards: a finished animation that keeps applying would make a stacking
                // context and trap the visualizer's fullscreen view under the player controls.
                <div className="size-full max-w-[1200px] animate-[fade-in_0.28s_var(--ease-out-soft)_backwards]">
                  <Visualizer song={song} />
                </div>
              ) : (
                <Artwork
                  key={song.id}
                  coverArtId={song.coverArtId}
                  size="full"
                  kind="song"
                  rounded="lg"
                  priority
                  className="animate-pop aspect-square w-full max-w-[min(560px,40dvh)] md:max-w-[min(560px,52vh)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
                  alt={`${song.album ?? song.title} cover`}
                />
              )}
            </div>
            <div className="mx-auto w-full max-w-[560px] shrink-0" style={{ transform: `translateX(${offset.x * 0.3}px)` }}>
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-[1.6rem] font-extrabold leading-tight md:text-[2rem]">{song.title}</h2>
                  <p className="truncate text-[16px] text-fg/75">
                    {song.artistId ? (
                      <Link to={`/artist/${song.artistId}`} onClick={() => setOpen(false)} className="hover:underline">
                        {song.artist}
                      </Link>
                    ) : (
                      song.artist
                    )}
                    {song.album && song.albumId && (
                      <>
                        {' · '}
                        <Link to={`/album/${song.albumId}`} onClick={() => setOpen(false)} className="hover:underline">
                          {song.album}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <FavoriteButton kind="song" item={song} size="lg" />
              </div>
              <ProgressBar layout="stacked" className="mt-5" />
              <div className="mt-3">
                <TransportControls size="lg" />
              </div>
              <div className="mt-4 mb-4 flex items-center justify-between">
                <IconButton label="Lyrics" active={lyricsOpen} aria-pressed={lyricsOpen} onClick={() => { setLyricsOpen(!lyricsOpen); setPanel('none'); }}>
                  <MicVocal className="size-5" />
                </IconButton>
                {!isMobile && <VolumeControl />}
                <IconButton label="Visualizer (V)" active={visualizer} aria-pressed={visualizer} onClick={toggleVisualizer}>
                  <AudioLines className="size-5" />
                </IconButton>
                <IconButton label={eqOn ? 'Equalizer (on)' : 'Equalizer'} active={eqOn} onClick={() => openDialog({ type: 'equalizer' })}>
                  <SlidersVertical className="size-5" />
                </IconButton>
                <IconButton label="Queue" active={panel === 'queue'} aria-pressed={panel === 'queue'} onClick={() => { setPanel(panel === 'queue' ? 'none' : 'queue'); setLyricsOpen(false); }}>
                  <ListMusic className="size-5" />
                </IconButton>
              </div>
            </div>
          </div>

          {showSide && (
            <div className="animate-fade-in flex min-h-0 flex-col">
              {isMobile && (
                <div className="flex items-center gap-3 pb-2">
                  <Artwork coverArtId={song.coverArtId} size="thumb" rounded="sm" className="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{song.title}</p>
                    <p className="truncate text-sm text-fg/70">{song.artist}</p>
                  </div>
                  <IconButton label="Back to player" onClick={() => { setLyricsOpen(false); setPanel('none'); }}>
                    <ChevronDown className="size-6" />
                  </IconButton>
                </div>
              )}
              {lyricsOpen ? (
                <div className="min-h-0 flex-1 overflow-y-auto rounded-xl px-2 [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)]">
                  <Lyrics song={song} />
                </div>
              ) : (
                <QueuePanel className="min-h-0 flex-1 rounded-xl bg-black/25 backdrop-blur-md" />
              )}
              {isMobile && (
                <div className="py-3">
                  <ProgressBar layout="stacked" />
                  <TransportControls size="lg" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
