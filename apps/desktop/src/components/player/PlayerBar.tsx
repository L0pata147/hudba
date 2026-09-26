import { Link } from 'react-router';
import clsx from 'clsx';
import { ChevronUp, ListMusic, Maximize2, MicVocal, Radio } from 'lucide-react';
import { useCurrentItem, usePlayer } from '@sonora/core';
import { Artwork } from '../ui/Artwork';
import { IconButton } from '../ui/Button';
import { useUi } from '../../lib/ui-store';
import { FavoriteButton } from './FavoriteButton';
import { ProgressBar, TransportControls, VolumeControl } from './Controls';

/** Persistent desktop player bar. */
export function PlayerBar() {
  const item = useCurrentItem();
  const context = usePlayer((s) => s.context);
  const status = usePlayer((s) => s.status);
  const { queueOpen, toggleQueue, setNowPlayingOpen, setLyricsOpen, lyricsOpen } = useUi();
  const song = item?.song;
  return (
    <div role="region" aria-label="Player" data-status={status} className="grid h-[88px] grid-cols-[minmax(180px,1fr)_minmax(320px,2fr)_minmax(180px,1fr)] items-center gap-4 px-3">
      <div className="flex min-w-0 items-center gap-3">
        {song ? (
          <>
            <button
              type="button"
              aria-label="Open now playing"
              onClick={() => setNowPlayingOpen(true)}
              className="group relative shrink-0 overflow-hidden rounded-md"
            >
              <Artwork coverArtId={song.coverArtId} size="thumb" kind="song" className="size-14" priority />
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <ChevronUp className="size-5" />
              </span>
            </button>
            <div className="min-w-0">
              <Link to={song.albumId ? `/album/${song.albumId}` : '#'} className="block truncate text-[14px] font-semibold hover:underline" title={song.title}>
                {song.title}
              </Link>
              <div className="truncate text-[12.5px] text-fg-2">
                {song.artistId ? (
                  <Link to={`/artist/${song.artistId}`} className="hover:text-fg hover:underline">
                    {song.artist}
                  </Link>
                ) : (
                  song.artist
                )}
                {context?.type === 'radio' ? (
                  <Link to="/radio" className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-1.5 py-px align-middle text-[11px] font-bold text-accent hover:underline">
                    <Radio className="size-3" /> Radio
                  </Link>
                ) : (
                  context?.name && <span className="text-fg-3"> · {context.name}</span>
                )}
              </div>
            </div>
            <FavoriteButton kind="song" item={song} size="sm" />
          </>
        ) : (
          <p className="text-[13px] text-fg-3">Pick something to play</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <TransportControls />
        <ProgressBar className="w-full max-w-[640px]" />
      </div>

      <div className="flex items-center justify-end gap-1">
        <IconButton label="Lyrics" size="sm" active={lyricsOpen} disabled={!song} onClick={() => { setLyricsOpen(!lyricsOpen); if (!lyricsOpen) setNowPlayingOpen(true); }}>
          <MicVocal className="size-[18px]" />
        </IconButton>
        <IconButton label={queueOpen ? 'Hide queue' : 'Show queue'} size="sm" active={queueOpen} aria-pressed={queueOpen} onClick={toggleQueue}>
          <ListMusic className="size-[18px]" />
        </IconButton>
        <VolumeControl className={clsx('max-lg:[&>[role=slider]]:w-16')} />
        <IconButton label="Full screen player" size="sm" disabled={!song} onClick={() => setNowPlayingOpen(true)}>
          <Maximize2 className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
