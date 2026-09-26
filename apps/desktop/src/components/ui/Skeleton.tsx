import clsx from 'clsx';

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-md', className)} aria-hidden />;
}

export function CardSkeleton({ round }: { round?: boolean }) {
  return (
    <div className="flex flex-col gap-3 p-3" aria-hidden>
      <Skeleton className={clsx('aspect-square w-full', round ? 'rounded-full' : 'rounded-lg')} />
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function TrackRowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-14 items-center gap-4 px-4">
          <Skeleton className="h-3 w-5" />
          <Skeleton className="size-10 rounded-sm" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

export function ShelfSkeleton({ round, count = 6 }: { round?: boolean; count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy>
      <Skeleton className="mx-3 h-6 w-48" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] overflow-hidden [grid-template-rows:1fr] [grid-auto-rows:0]">
        {Array.from({ length: count }, (_, i) => (
          <CardSkeleton key={i} round={round} />
        ))}
      </div>
    </div>
  );
}
