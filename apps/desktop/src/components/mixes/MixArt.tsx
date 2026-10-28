import clsx from 'clsx';
import { Artwork } from '../ui/Artwork';

/** Mix colours, from the logo. */
const COLORS = ['#5CFFC8', '#5CE1FF', '#5C9BFF', '#8B6BFF', '#C25CFF', '#FF7AB8'];

export const mixColor = (index: number) => COLORS[index % COLORS.length]!;

/** A daily mix tile: four album covers with the mix's name on a coloured band. */
export function MixArt({ name, coverArtIds, index, className, large }: { name: string; coverArtIds: string[]; index: number; className?: string; large?: boolean }) {
  const color = mixColor(index);
  const covers = coverArtIds.length >= 4 ? coverArtIds.slice(0, 4) : coverArtIds.slice(0, 1);
  return (
    <div className={clsx('relative overflow-hidden rounded-md bg-surface-active', className)} aria-hidden>
      <div className={clsx('grid size-full', covers.length === 4 && 'grid-cols-2 grid-rows-2')}>
        {covers.length ? (
          covers.map((id) => <Artwork key={id} coverArtId={id} size="thumb" kind="album" rounded="sm" className="size-full rounded-none!" />)
        ) : (
          <div className="size-full" style={{ background: `linear-gradient(135deg, ${color}, #08080B)` }} />
        )}
      </div>
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 35%, ${color}33 60%, ${color}EE 100%)` }} />
      <span className="absolute top-2 left-2 rounded-sm bg-black/55 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-white uppercase backdrop-blur-sm">Daily</span>
      <span className={clsx('absolute inset-x-0 bottom-0 line-clamp-2 px-3 pb-2.5 font-display leading-tight font-extrabold break-words text-[#08080B]', large ? 'text-[1.6rem]' : 'text-[0.95rem]')}>{name}</span>
    </div>
  );
}
