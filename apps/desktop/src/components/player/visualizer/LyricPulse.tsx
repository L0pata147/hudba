import clsx from 'clsx';
import type { Song } from '@sonora/types';
import { useLyrics, usePlayer } from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';

/**
 * Current lyric line as big karaoke words. The host's render loop fills each
 * word as it is sung (`--fill`, timed by the line's start and the next line's
 * start, split by word length) and lifts it with its own part of the spectrum.
 * Without synced lyrics the line is estimated from the song position; without
 * lyrics the title pulses instead.
 */
export function LyricPulse({ song, color, immersive }: { song: Song; color: RGB; immersive: boolean }) {
  const { data } = useLyrics(song);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration) || song.duration || 1;
  const lines = (data?.lines ?? []).filter((l) => l.value.trim());
  const synced = !!data?.synced;
  let idx = -1;
  if (synced) lines.forEach((l, i) => l.start !== undefined && l.start <= position * 1000 + 250 && (idx = i));
  else if (lines.length) idx = Math.min(lines.length - 1, Math.floor((position / duration) * lines.length));
  const current = idx >= 0 ? lines[idx]!.value : lines.length && synced ? '♪' : song.title;
  const before = idx > 0 ? lines[idx - 1]!.value : '';
  const after = idx >= 0 ? lines.slice(idx + 1, idx + 3).map((l) => l.value) : lines.length ? lines.slice(0, 2).map((l) => l.value) : [song.artist];
  const words = current.split(/\s+/).filter(Boolean);
  // Word boundaries as fractions of the line, by length (a word takes as long as it is long).
  const total = words.reduce((s, w) => s + w.length + 1, 0) || 1;
  let acc = 0;
  const spans = words.map((w) => {
    const a = acc / total;
    acc += w.length + 1;
    return [a, acc / total] as const;
  });
  const start = synced && idx >= 0 ? (lines[idx]!.start ?? 0) : 0;
  const end = synced && idx >= 0 ? (lines[idx + 1]?.start ?? start + 4000) : 0;
  const karaoke = synced && idx >= 0;
  return (
    <div className="pointer-events-none absolute inset-x-[7%] top-1/2 flex -translate-y-1/2 flex-col items-center gap-4 text-center" data-testid="lyric-pulse">
      <p className={clsx('line-clamp-1 font-semibold text-white/30', immersive ? 'text-[22px]' : 'text-[15px]')}>{before}</p>
      <p
        key={`${idx}:${current}`}
        data-line-start={karaoke ? start : undefined}
        data-line-end={karaoke ? end : undefined}
        className={clsx(
          'animate-lyric-in flex flex-wrap justify-center gap-x-[0.5em] gap-y-1 font-display leading-tight font-extrabold',
          immersive ? 'text-[3.6rem]' : 'text-[2.2rem]',
        )}
        style={{ ['--glow' as string]: rgbToCss(color, 0.85) }}
      >
        {words.map((w, i) => (
          <span
            key={i}
            data-word
            data-w0={spans[i]![0]}
            data-w1={spans[i]![1]}
            className="karaoke-word inline-block origin-[50%_80%] will-change-transform"
            style={{ ['--fill' as string]: karaoke ? 0 : 1 }}
          >
            {w}
          </span>
        ))}
      </p>
      {after.map((line, i) => (
        <p key={i} className={clsx('line-clamp-1 font-semibold', i ? 'text-white/25' : 'text-white/45', immersive ? 'text-[22px]' : 'text-[15px]')}>
          {line}
        </p>
      ))}
    </div>
  );
}
