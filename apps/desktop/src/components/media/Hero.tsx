import type { ReactNode } from 'react';
import clsx from 'clsx';
import { rgbToCss } from '@sonora/ui';
import { useDominantColor } from '../../hooks/useDominantColor';
import { Artwork } from '../ui/Artwork';
import { Skeleton } from '../ui/Skeleton';

interface HeroProps {
  kind: 'album' | 'artist' | 'playlist' | 'favorites' | 'genre';
  label: string;
  title: string;
  coverArtId?: string;
  imageUrl?: string;
  art?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  round?: boolean;
}

/** Collection header with artwork-tinted gradient backdrop. */
export function Hero({ kind, label, title, coverArtId, imageUrl, art, meta, description, round }: HeroProps) {
  const color = useDominantColor(coverArtId);
  const titleSize = title.length > 40 ? 'text-[2rem] md:text-[2.6rem]' : title.length > 18 ? 'text-[2.3rem] md:text-[3.4rem]' : 'text-[2.6rem] md:text-[4.6rem]';
  return (
    <div className="relative -mt-16 px-4 pt-20 pb-6 max-md:mt-0 max-md:pt-6 md:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] transition-[background] duration-700"
        style={{ background: `linear-gradient(180deg, ${rgbToCss(color)} 0%, ${rgbToCss(color, 0.4)} 55%, transparent 100%)` }}
        aria-hidden
      />
      <div className="relative flex flex-col items-center gap-6 md:flex-row md:items-end">
        {art ?? (
          <Artwork
            coverArtId={coverArtId}
            src={imageUrl}
            kind={kind === 'artist' ? 'artist' : kind === 'playlist' ? 'playlist' : 'album'}
            size="hero"
            rounded={round ? 'full' : 'md'}
            priority
            alt={`${title} artwork`}
            className="size-[min(62vw,232px)] shrink-0 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]"
          />
        )}
        <div className="flex w-full min-w-0 flex-col gap-2 max-md:items-start">
          <span className="text-[13px] font-semibold text-fg/80 max-md:hidden">{label}</span>
          <h1 className={clsx('font-display leading-[1.02] font-extrabold tracking-tight text-balance break-words', titleSize)}>{title}</h1>
          {description && <div className="line-clamp-2 max-w-3xl text-[14px] text-fg/70">{description}</div>}
          {meta && <div className="flex flex-wrap items-center gap-x-1.5 text-[14px] text-fg/85">{meta}</div>}
        </div>
      </div>
    </div>
  );
}

export function HeroSkeleton({ round }: { round?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 pt-6 pb-6 md:flex-row md:items-end" aria-busy>
      <Skeleton className={clsx('size-[232px] shrink-0', round ? 'rounded-full' : 'rounded-md')} />
      <div className="flex w-full flex-col gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="relative flex items-center gap-3 px-4 pt-2 pb-5 md:px-6">{children}</div>;
}

export function Dot() {
  return <span aria-hidden className="text-fg/50">•</span>;
}
