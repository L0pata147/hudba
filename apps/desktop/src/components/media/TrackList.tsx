import { memo, useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock3, DownloadCloud, GripVertical, Heart, MoreHorizontal } from 'lucide-react';
import type { PlaybackContext, Playlist, Song } from '@sonora/types';
import { playerStore, useDownloads, useIsStarred, useSongPlayState, useToggleFavorite } from '@sonora/core';
import { formatDuration, formatRelativeTime } from '@sonora/utils';
import { Artwork } from '../ui/Artwork';
import { Equalizer, PauseGlyph, PlayGlyph } from '../ui/PlayButton';
import { useItemMenus } from '../../lib/actions';
import { useScrollElement } from '../../lib/scroll';

export type TrackListVariant = 'list' | 'compact';

interface TrackListProps {
  songs: Song[];
  context: PlaybackContext;
  /** Show the album track number instead of the list position. */
  numbering?: 'position' | 'track';
  showArtwork?: boolean;
  showAlbum?: boolean;
  showHeader?: boolean;
  /** Extra column: date added / played */
  dateColumn?: { label: string; value: (song: Song, index: number) => string | undefined };
  playlist?: Playlist;
  onReorder?: (from: number, to: number) => void;
  variant?: TrackListVariant;
  /** Custom play handler (e.g. history). Defaults to playing the list. */
  onPlay?: (index: number) => void;
  label?: string;
}

const VIRTUALIZE_AFTER = 80;
const SORTABLE_LIMIT = 1500;

function gridTemplate(showAlbum: boolean, hasDate: boolean): string {
  const cols = ['2.5rem', 'minmax(0,4fr)'];
  if (showAlbum) cols.push('minmax(0,3fr)');
  if (hasDate) cols.push('minmax(0,1.6fr)');
  cols.push('7.5rem');
  return cols.join(' ');
}

export function TrackList({
  songs,
  context,
  numbering = 'position',
  showArtwork = true,
  showAlbum = true,
  showHeader = true,
  dateColumn,
  playlist,
  onReorder,
  variant = 'list',
  onPlay,
  label = 'Tracks',
}: TrackListProps) {
  const scrollRef = useScrollElement();
  const listRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const rowHeight = variant === 'compact' ? 40 : 56;
  const sortable = Boolean(onReorder) && songs.length <= SORTABLE_LIMIT;
  const virtual = !sortable && songs.length > VIRTUALIZE_AFTER;
  const template = gridTemplate(showAlbum, Boolean(dateColumn));

  useLayoutEffect(() => {
    const el = listRef.current;
    const scroller = scrollRef.current;
    if (!el || !scroller) return;
    const measure = () => setOffset(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scrollRef, virtual]);

  const virtualizer = useVirtualizer({
    count: virtual ? songs.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    scrollMargin: offset,
  });

  const play = useCallback(
    (index: number) => {
      if (onPlay) return onPlay(index);
      const song = songs[index];
      const state = playerStore.getState();
      const cur = state.queue.items[state.queue.index];
      if (song && cur?.song.id === song.id && state.context?.type === context.type && state.context?.id === context.id) {
        state.togglePlay();
        return;
      }
      state.playSongs(songs, index, { context });
    },
    [songs, context, onPlay],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = sortable ? songs.map((s, i) => `${s.id}::${i}`) : [];
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onReorder?.(from, to);
  };

  const rowProps = (song: Song, index: number) => ({
    song,
    index,
    number: numbering === 'track' ? (song.track ?? index + 1) : index + 1,
    showArtwork,
    showAlbum,
    template,
    variant,
    date: dateColumn?.value(song, index),
    playlist,
    onPlay: play,
  });

  return (
    <div role="table" aria-label={label} aria-rowcount={songs.length} className="px-1 sm:px-3">
      {showHeader && (
        <div
          role="row"
          className="sticky top-[var(--header-h,0px)] z-10 mb-2 grid h-9 items-center gap-4 border-b border-line bg-bg/0 px-4 text-[12px] font-semibold tracking-wider text-fg-3 uppercase max-md:hidden"
          style={{ gridTemplateColumns: template }}
        >
          <span role="columnheader" className="text-right">#</span>
          <span role="columnheader">Title</span>
          {showAlbum && <span role="columnheader">Album</span>}
          {dateColumn && <span role="columnheader">{dateColumn.label}</span>}
          <span role="columnheader" className="flex justify-end pr-9" aria-label="Duration">
            <Clock3 className="size-4" />
          </span>
        </div>
      )}
      <div ref={listRef} role="rowgroup">
        {sortable ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              {songs.map((song, i) => (
                <SortableRow key={ids[i]} id={ids[i]!} {...rowProps(song, i)} />
              ))}
            </SortableContext>
          </DndContext>
        ) : virtual ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const song = songs[v.index]!;
              return (
                <TrackRow
                  key={`${song.id}-${v.index}`}
                  {...rowProps(song, v.index)}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
                />
              );
            })}
          </div>
        ) : (
          songs.map((song, i) => <TrackRow key={`${song.id}-${i}`} {...rowProps(song, i)} />)
        )}
      </div>
    </div>
  );
}

interface TrackRowProps {
  song: Song;
  index: number;
  number: number;
  showArtwork: boolean;
  showAlbum: boolean;
  template: string;
  variant: TrackListVariant;
  date?: string;
  playlist?: Playlist;
  onPlay: (index: number) => void;
  style?: CSSProperties;
  dragHandle?: React.ReactNode;
  rowRef?: (el: HTMLElement | null) => void;
  dragging?: boolean;
}

function SortableRow(props: Omit<TrackRowProps, 'style' | 'dragHandle' | 'rowRef'> & { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } = useSortable({ id: props.id });
  return (
    <TrackRow
      {...props}
      rowRef={setNodeRef}
      dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 20 : undefined }}
      dragHandle={
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${props.song.title}`}
          className="cursor-grab touch-none rounded p-1 text-fg-3 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 active:cursor-grabbing max-md:opacity-100"
        >
          <GripVertical className="size-4" />
        </button>
      }
    />
  );
}

export const TrackRow = memo(function TrackRow({
  song,
  index,
  number,
  showArtwork,
  showAlbum,
  template,
  variant,
  date,
  playlist,
  onPlay,
  style,
  dragHandle,
  rowRef,
  dragging,
}: TrackRowProps) {
  const { isCurrent, isPlaying } = useSongPlayState(song.id);
  const starred = useIsStarred('song', song);
  const toggleFavorite = useToggleFavorite();
  const offline = useDownloads((s) => s.records[song.id]?.status === 'done');
  const { openSongMenu } = useItemMenus();
  const compact = variant === 'compact';

  return (
    <div
      ref={rowRef}
      role="row"
      aria-rowindex={index + 1}
      aria-selected={isCurrent}
      tabIndex={0}
      style={{ ...style, gridTemplateColumns: template }}
      onClick={() => onPlay(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onPlay(index);
        } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          openSongMenu(e, song, { playlist, index });
        }
      }}
      onContextMenu={(e) => openSongMenu(e, song, { playlist, index })}
      className={clsx(
        'group grid cursor-default items-center gap-4 rounded-md px-4 select-none transition-colors duration-100 hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none max-md:!grid-cols-[minmax(0,1fr)_auto] max-md:gap-3 max-md:px-2',
        compact ? 'h-10' : 'h-14',
        isCurrent && 'bg-accent-soft/40',
        dragging && 'bg-surface-active shadow-pop',
      )}
    >
      <div className="flex items-center justify-end text-[14px] text-fg-2 tabular-nums max-md:hidden" role="cell">
        {dragHandle}
        <span className="relative flex size-5 items-center justify-center">
          <span className={clsx('group-hover:invisible', isCurrent && 'text-accent')}>
            {isCurrent ? <Equalizer paused={!isPlaying} /> : number}
          </span>
          <span className="invisible absolute inset-0 flex items-center justify-center text-fg group-hover:visible" aria-hidden>
            {isPlaying ? <PauseGlyph className="size-4" /> : <PlayGlyph className="size-4" />}
          </span>
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-3" role="cell">
        {showArtwork && !compact && <Artwork coverArtId={song.coverArtId} size="thumb" kind="song" rounded="sm" className="size-10 shrink-0" />}
        {dragHandle && <span className="md:hidden">{dragHandle}</span>}
        <div className="min-w-0">
          <div className={clsx('truncate text-[15px] font-medium', isCurrent ? 'text-accent' : 'text-fg')}>{song.title}</div>
          {!compact && (
            <div className="flex items-center gap-1.5 truncate text-[13px] text-fg-2">
              {offline && <DownloadCloud className="size-3.5 shrink-0 text-accent" aria-label="Available offline" />}
              {song.artists.length > 1 ? (
                song.artists.map((a, i) => (
                  <span key={a.id}>
                    <Link to={`/artist/${a.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-fg hover:underline" tabIndex={-1}>
                      {a.name}
                    </Link>
                    {i < song.artists.length - 1 && ', '}
                  </span>
                ))
              ) : song.artistId ? (
                <Link to={`/artist/${song.artistId}`} onClick={(e) => e.stopPropagation()} className="truncate hover:text-fg hover:underline" tabIndex={-1}>
                  {song.artist}
                </Link>
              ) : (
                <span className="truncate">{song.artist}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {showAlbum && (
        <div className="truncate text-[14px] text-fg-2 max-md:hidden" role="cell">
          {song.albumId ? (
            <Link to={`/album/${song.albumId}`} onClick={(e) => e.stopPropagation()} className="hover:text-fg hover:underline" tabIndex={-1}>
              {song.album}
            </Link>
          ) : (
            song.album
          )}
        </div>
      )}

      {date !== undefined && (
        <div className="truncate text-[13px] text-fg-2 max-md:hidden" role="cell">
          {date}
        </div>
      )}

      <div className="flex items-center justify-end gap-1" role="cell">
        <button
          type="button"
          aria-label={starred ? `Remove ${song.title} from Favorites` : `Add ${song.title} to Favorites`}
          aria-pressed={starred}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite.mutate({ kind: 'song', item: song, starred: !starred });
          }}
          className={clsx(
            'rounded-full p-1.5 transition-all hover:scale-110 max-md:hidden',
            starred ? 'text-accent' : 'text-fg-2 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100',
          )}
        >
          <Heart className="size-4" fill={starred ? 'currentColor' : 'none'} />
        </button>
        <span className="w-11 text-right text-[13px] text-fg-2 tabular-nums max-md:hidden">{formatDuration(song.duration)}</span>
        <button
          type="button"
          aria-label={`More options for ${song.title}`}
          onClick={(e) => openSongMenu(e, song, { playlist, index })}
          className="rounded-full p-1.5 text-fg-2 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 max-md:opacity-100"
        >
          <MoreHorizontal className="size-[18px]" />
        </button>
      </div>
    </div>
  );
});

export const relativeDate = (iso?: string) => (iso ? formatRelativeTime(iso) : undefined);
