import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useScrollElement } from '../../lib/scroll';

function useOffsetInScroller(ref: React.RefObject<HTMLElement | null>) {
  const scrollRef = useScrollElement();
  const [offset, setOffset] = useState(0);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = scrollRef.current;
    if (!el || !scroller) return;
    const measure = () => {
      setOffset(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop);
      setWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, scrollRef]);
  return { offset, width, scrollRef };
}

interface VirtualGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  minItemWidth?: number;
  /** extra height under the square artwork */
  footer?: number;
  onEndReached?: () => void;
}

/** Row-virtualized responsive card grid — stays fast with tens of thousands of items. */
export function VirtualGrid<T>({ items, getKey, renderItem, minItemWidth = 172, footer = 72, onEndReached }: VirtualGridProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const { offset, width, scrollRef } = useOffsetInScroller(ref);
  const columns = Math.max(2, Math.floor((width || 800) / minItemWidth));
  const itemWidth = (width || 800) / columns;
  const rows = Math.ceil(items.length / columns);
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => itemWidth + footer,
    overscan: 3,
    scrollMargin: offset,
  });
  useEffect(() => virtualizer.measure(), [itemWidth, virtualizer]);
  const last = virtualizer.getVirtualItems().at(-1);
  useEffect(() => {
    if (last && last.index >= rows - 2) onEndReached?.();
  }, [last, rows, onEndReached]);

  return (
    <div ref={ref} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          className="absolute inset-x-0 grid"
          style={{ top: 0, transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
            <div key={getKey(item)}>{renderItem(item)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface VirtualRowsProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderRow: (item: T, index: number) => ReactNode;
  rowHeight: number;
  onEndReached?: () => void;
  className?: string;
}

export function VirtualRows<T>({ items, getKey, renderRow, rowHeight, onEndReached, className }: VirtualRowsProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const { offset, scrollRef } = useOffsetInScroller(ref);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    scrollMargin: offset,
  });
  const last = virtualizer.getVirtualItems().at(-1);
  useEffect(() => {
    if (last && last.index >= items.length - 10) onEndReached?.();
  }, [last, items.length, onEndReached]);
  return (
    <div ref={ref} role="list" className={clsx('relative', className)} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((v) => {
        const item = items[v.index]!;
        return (
          <div
            key={getKey(item)}
            role="listitem"
            className="absolute inset-x-0"
            style={{ top: 0, height: v.size, transform: `translateY(${v.start - virtualizer.options.scrollMargin}px)` }}
          >
            {renderRow(item, v.index)}
          </div>
        );
      })}
    </div>
  );
}
