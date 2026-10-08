import { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { MicVocal } from 'lucide-react';
import type { Song } from '@sonora/types';
import { lyricsHint, playerStore, useLyrics, usePlayer, useSession } from '@sonora/core';
import { Skeleton } from '../ui/Skeleton';

/** Lyrics with live highlighting when the server provides synced lyrics. */
export function Lyrics({ song }: { song: Song }) {
  const { data, isPending, isError, refetch, isFetching } = useLyrics(song);
  const server = useSession((s) => s.session?.serverInfo);
  const positionMs = usePlayer((s) => s.position * 1000);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIdx = useMemo(() => {
    if (!data?.synced) return -1;
    let idx = -1;
    data.lines.forEach((l, i) => {
      if (l.start !== undefined && l.start <= positionMs + 250) idx = i;
    });
    return idx;
  }, [data, positionMs]);

  useEffect(() => {
    if (activeIdx < 0) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-line="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 p-2" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-6" />
        ))}
      </div>
    );
  }
  if (isError || !data || !data.lines.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-fg-2">
        <MicVocal className="size-8" />
        <p className="font-semibold">No lyrics for this song</p>
        <p className="max-w-xs text-sm text-fg-3">{lyricsHint(server)}</p>
        <button
          type="button"
          disabled={isFetching}
          onClick={() => void refetch()}
          className="mt-1 rounded-full bg-surface-hover px-4 py-1.5 text-sm font-semibold text-fg hover:bg-surface-active disabled:opacity-60"
        >
          {isFetching ? 'Looking…' : 'Try again'}
        </button>
      </div>
    );
  }
  return (
    <div ref={containerRef} className="flex flex-col gap-3 py-[30vh] font-display text-[1.6rem] leading-snug font-bold md:text-[2rem]" aria-live="off">
      {data.lines.map((line, i) => (
        <p
          key={i}
          data-line={i}
          onClick={() => line.start !== undefined && playerStore.getState().seek(line.start / 1000)}
          className={clsx(
            'transition-[color,opacity] duration-300',
            data.synced ? (i === activeIdx ? 'text-fg' : i < activeIdx ? 'text-fg/45' : 'text-fg/30') : 'text-fg/90',
            data.synced && line.start !== undefined && 'cursor-pointer hover:text-fg/80',
          )}
        >
          {line.value || '♪'}
        </p>
      ))}
    </div>
  );
}
