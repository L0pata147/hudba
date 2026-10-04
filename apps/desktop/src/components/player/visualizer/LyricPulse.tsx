import clsx from 'clsx';
import type { Song } from '@sonora/types';
import { useLyrics, usePlayer } from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';

/**
 * Current lyric line as big words that the host's render loop scales with the
 * spectrum (each word follows its own band). Without synced lyrics the line is
 * estimated from the song position; without lyrics the title pulses instead.
 */
export function LyricPulse({ song, color, immersive }: { song: Song; color: RGB; immersive: boolean }) {
  const { data } = useLyrics(song);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration) || song.duration || 1;
  const lines = (data?.lines ?? []).filter((l) => l.value.trim());
  let idx = -1;
  if (data?.synced) lines.forEach((l, i) => l.start !== undefined && l.start <= position * 1000 + 250 && (idx = i));
  else if (lines.length) idx = Math.min(lines.length - 1, Math.floor((position / duration) * lines.length));
  const current = idx >= 0 ? lines[idx]!.value : lines.length && data?.synced ? '♪' : song.title;
  const before = idx > 0 ? lines[idx - 1]!.value : '';
  const after = idx >= 0 ? (lines[idx + 1]?.value ?? '') : lines.length ? (lines[0]?.value ?? '') : song.artist;
  const words = current.split(/\s+/).filter(Boolean);
  return (
    <div className="pointer-events-none absolute inset-x-[8%] top-1/2 flex -translate-y-1/2 flex-col items-center gap-4 text-center" data-testid="lyric-pulse">
      <p className={clsx('line-clamp-1 font-semibold text-white/35', immersive ? 'text-[22px]' : 'text-[15px]')}>{before}</p>
      <p
        key={`${idx}:${current}`}
        className={clsx('animate-lyric-in flex flex-wrap justify-center gap-x-[0.5em] gap-y-1 font-display leading-tight font-extrabold text-white', immersive ? 'text-[3.4rem]' : 'text-[2.1rem]')}
        style={{ textShadow: `0 0 28px ${rgbToCss(color, 0.65)}, 0 2px 10px rgba(0,0,0,0.6)` }}
      >
        {words.map((w, i) => (
          <span key={i} data-word className="inline-block origin-[50%_80%] will-change-transform">
            {w}
          </span>
        ))}
      </p>
      <p className={clsx('line-clamp-1 font-semibold text-white/45', immersive ? 'text-[22px]' : 'text-[15px]')}>{after}</p>
    </div>
  );
}
