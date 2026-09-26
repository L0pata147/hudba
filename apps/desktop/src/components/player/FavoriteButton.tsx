import clsx from 'clsx';
import { Heart } from 'lucide-react';
import type { Album, Artist, Song } from '@sonora/types';
import { useIsStarred, useToggleFavorite } from '@sonora/core';

export function FavoriteButton({
  kind,
  item,
  size = 'md',
  className,
}: {
  kind: 'song' | 'album' | 'artist';
  item: Song | Album | Artist;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const starred = useIsStarred(kind, item);
  const toggle = useToggleFavorite();
  const name = 'title' in item ? item.title : item.name;
  const icon = size === 'lg' ? 'size-7' : size === 'md' ? 'size-5' : 'size-4';
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? `Remove ${name} from Favorites` : `Add ${name} to Favorites`}
      title={starred ? 'Remove from Favorites' : 'Add to Favorites'}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ kind, item, starred: !starred });
      }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full p-1.5 transition-[transform,color] duration-200 hover:scale-110 active:scale-90',
        starred ? 'text-accent' : 'text-fg-2 hover:text-fg',
        className,
      )}
    >
      <Heart className={clsx(icon, starred && 'animate-pop')} fill={starred ? 'currentColor' : 'none'} />
    </button>
  );
}
