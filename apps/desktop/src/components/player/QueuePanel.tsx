import clsx from 'clsx';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ListX, X } from 'lucide-react';
import type { QueueItem } from '@sonora/types';
import { playerStore, upcomingItems, usePlayer, usePlayerShallow, currentItem } from '@sonora/core';
import { formatDuration } from '@sonora/utils';
import { Artwork } from '../ui/Artwork';
import { Button, IconButton } from '../ui/Button';
import { Equalizer } from '../ui/PlayButton';
import { EmptyState } from '../ui/States';
import { useItemMenus } from '../../lib/actions';

function SortableQueueRow({ item, index }: { item: QueueItem; index: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid });
  return (
    <QueueRow
      item={item}
      index={index}
      rowRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragging={isDragging}
      handle={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${item.song.title} (position ${index + 1})`}
          className="cursor-grab touch-none text-fg-3 hover:text-fg active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      }
    />
  );
}

function QueueRow({
  item,
  current,
  rowRef,
  style,
  dragging,
  handle,
}: {
  item: QueueItem;
  index: number;
  current?: boolean;
  rowRef?: (el: HTMLElement | null) => void;
  style?: React.CSSProperties;
  dragging?: boolean;
  handle?: React.ReactNode;
}) {
  const { openSongMenu } = useItemMenus();
  const playing = usePlayer((s) => s.status === 'playing');
  const { song } = item;
  return (
    <li
      ref={rowRef}
      style={style}
      className={clsx('group flex items-center gap-3 rounded-md p-1.5 pr-1 hover:bg-surface-hover', dragging && 'relative z-10 bg-surface-active shadow-pop')}
      onContextMenu={(e) => openSongMenu(e, song, { queueUid: item.uid })}
    >
      {handle}
      <button
        type="button"
        onClick={() => (current ? playerStore.getState().togglePlay() : playerStore.getState().playItem(item.uid))}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={current ? `${song.title} (now playing)` : `Play ${song.title}`}
      >
        <Artwork coverArtId={song.coverArtId} size="thumb" kind="song" rounded="sm" className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className={clsx('flex items-center gap-2 truncate text-[14px] font-medium', current && 'text-accent')}>
            {current && <Equalizer paused={!playing} />}
            <span className="truncate">{song.title}</span>
          </div>
          <div className="truncate text-[12.5px] text-fg-2">{song.artist}</div>
        </div>
      </button>
      <span className="text-[12px] text-fg-3 tabular-nums group-hover:hidden">{formatDuration(song.duration)}</span>
      {!current && (
        <IconButton label={`Remove ${song.title} from queue`} size="xs" className="hidden group-hover:inline-flex group-focus-within:inline-flex max-md:inline-flex" onClick={() => playerStore.getState().removeFromQueue(item.uid)}>
          <X className="size-4" />
        </IconButton>
      )}
    </li>
  );
}

/** Full queue: now playing, up next (drag & drop), clear. */
export function QueuePanel({ onClose, className }: { onClose?: () => void; className?: string }) {
  const { queue, context } = usePlayerShallow((s) => ({ queue: s.queue, context: s.context }));
  const now = currentItem(queue);
  const upcoming = upcomingItems(queue);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = queue.items.findIndex((i) => i.uid === e.active.id);
    const to = queue.items.findIndex((i) => i.uid === e.over?.id);
    playerStore.getState().moveInQueue(from, to);
  };

  return (
    <section aria-label="Queue" className={clsx('flex min-h-0 flex-col', className)}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="font-display text-lg font-bold">Queue</h2>
        <div className="flex items-center gap-1">
          {upcoming.length > 0 && (
            <Button size="sm" variant="ghost" icon={<ListX className="size-4" />} onClick={() => playerStore.getState().clearQueue()}>
              Clear
            </Button>
          )}
          {onClose && (
            <IconButton label="Close queue" size="sm" onClick={onClose}>
              <X className="size-[18px]" />
            </IconButton>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!now ? (
          <EmptyState title="Your queue is empty" message="Play an album or playlist, or add songs with “Add to queue”." />
        ) : (
          <>
            <h3 className="px-2 pt-2 pb-1 text-[13px] font-bold text-fg-2">Now playing</h3>
            <ul>
              <QueueRow item={now} index={queue.index} current />
            </ul>
            {upcoming.length > 0 && (
              <>
                <h3 className="px-2 pt-4 pb-1 text-[13px] font-bold text-fg-2">
                  Next {context?.name ? <span className="font-medium text-fg-3">from {context.name}</span> : null}
                </h3>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={upcoming.slice(0, 300).map((i) => i.uid)} strategy={verticalListSortingStrategy}>
                    <ul>
                      {upcoming.slice(0, 300).map((item, i) => (
                        <SortableQueueRow key={item.uid} item={item} index={queue.index + 1 + i} />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
                {upcoming.length > 300 && <p className="px-3 pt-2 text-[12.5px] text-fg-3">+ {upcoming.length - 300} more songs</p>}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
