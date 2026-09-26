import { memo, useState } from 'react';
import clsx from 'clsx';
import { Disc3, ListMusic, Music2, UserRound } from 'lucide-react';
import { artworkUrl, type ArtSize } from '../../lib/artwork';

type Kind = 'album' | 'artist' | 'playlist' | 'song';

const fallbackIcons = { album: Disc3, artist: UserRound, playlist: ListMusic, song: Music2 };

interface ArtworkProps {
  coverArtId?: string;
  /** Direct image URL (e.g. external artist images); used when no coverArtId. */
  src?: string;
  size?: ArtSize;
  kind?: Kind;
  alt?: string;
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  priority?: boolean;
}

const radius = { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg', full: 'rounded-full' };

/**
 * Lazy-loaded artwork with a branded placeholder, fade-in and graceful
 * fallback when the image is missing. Browsers/WebViews cache the images
 * via HTTP cache; URLs are stable per session so they are reused.
 */
export const Artwork = memo(function Artwork({ coverArtId, src, size = 'card', kind = 'album', alt = '', className, rounded = 'md', priority }: ArtworkProps) {
  const url = artworkUrl(coverArtId, size) ?? src;
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [lastUrl, setLastUrl] = useState(url);
  if (url !== lastUrl) {
    setLastUrl(url);
    setState('loading');
  }
  const Icon = fallbackIcons[kind];
  const showFallback = !url || state === 'error';
  return (
    <div className={clsx('relative overflow-hidden bg-surface-hover', radius[rounded], className)}>
      {showFallback ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-active to-surface text-fg-3">
          <Icon className="size-[34%]" strokeWidth={1.5} aria-hidden />
        </div>
      ) : (
        <>
          {state === 'loading' && <div className="skeleton absolute inset-0" aria-hidden />}
          <img
            src={url}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            onLoad={() => setState('loaded')}
            onError={() => setState('error')}
            className={clsx('absolute inset-0 size-full object-cover transition-opacity duration-300', state === 'loaded' ? 'opacity-100' : 'opacity-0')}
          />
        </>
      )}
    </div>
  );
});
