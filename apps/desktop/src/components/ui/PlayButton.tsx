import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

/** Custom play / pause glyphs (Sonora's own rounded shapes). */
export function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5.6c0-1.1 1.2-1.8 2.2-1.2l9.1 5.6c.9.6.9 1.9 0 2.5l-9.1 5.6c-1 .6-2.2-.1-2.2-1.2V5.6z" fill="currentColor" />
    </svg>
  );
}

export function PauseGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="6" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor" />
      <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" fill="currentColor" />
    </svg>
  );
}

interface PlayButtonProps {
  playing: boolean;
  loading?: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
  variant?: 'accent' | 'light';
}

const sizes = { sm: 'size-9', md: 'size-11', lg: 'size-14', xl: 'size-16' };
const glyphs = { sm: 'size-4', md: 'size-5', lg: 'size-6', xl: 'size-7' };

export function PlayButton({ playing, loading, onClick, size = 'md', label, className, variant = 'accent' }: PlayButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? (playing ? 'Pause' : 'Play')}
      title={label ?? (playing ? 'Pause' : 'Play')}
      className={clsx(
        'group/play inline-flex shrink-0 items-center justify-center rounded-full transition-[transform,background,box-shadow] duration-200 ease-soft hover:scale-[1.06] active:scale-95',
        variant === 'accent'
          ? 'bg-accent text-on-accent shadow-[0_10px_30px_-8px_var(--accent)] hover:bg-accent-strong'
          : 'bg-fg text-bg',
        sizes[size],
        className,
      )}
    >
      {loading ? (
        <Loader2 className={clsx(glyphs[size], 'animate-spin')} aria-hidden />
      ) : playing ? (
        <PauseGlyph className={glyphs[size]} />
      ) : (
        <PlayGlyph className={clsx(glyphs[size], 'translate-x-[1px]')} />
      )}
    </button>
  );
}

/** Animated equalizer shown next to the playing track. */
export function Equalizer({ paused, className }: { paused?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex h-3.5 items-end gap-[2px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="eq-bar h-full" style={paused ? { animationPlayState: 'paused', transform: 'scaleY(0.35)' } : undefined} />
      ))}
    </span>
  );
}
