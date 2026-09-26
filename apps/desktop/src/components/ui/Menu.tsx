import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useUi } from '../../lib/ui-store';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Artwork } from './Artwork';
import { Sheet } from './Dialog';

/** Global context menu host: popover on desktop, bottom sheet on mobile. */
export function MenuHost() {
  const menu = useUi((s) => s.menu);
  const close = useUi((s) => s.closeMenu);
  const isMobile = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const dismiss = (restoreFocus = true) => {
    const target = menu?.returnFocus;
    close();
    if (restoreFocus && target && document.contains(target)) target.focus();
  };

  useLayoutEffect(() => {
    if (!menu || isMobile || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const margin = 8;
    let left = menu.x - width;
    if (left < margin) left = Math.min(menu.x, window.innerWidth - width - margin);
    let top = menu.y;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, menu.y - height - 8);
    setPos({ left: Math.max(margin, left), top });
    ref.current.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, [menu, isMobile]);

  useEffect(() => {
    if (!menu) {
      setPos(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    };
    const onScroll = () => !isMobile && dismiss(false);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, isMobile]);

  if (!menu) return null;

  const items = menu.items.map((item) => (
    <div key={item.id}>
      {item.separatorBefore && <div className="mx-2 my-1 h-px bg-line" role="separator" />}
      <button
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onClick={() => {
          dismiss(false);
          item.onSelect();
        }}
        className={clsx(
          'flex w-full items-center gap-3 rounded-sm px-3 text-left text-[14px] font-medium outline-none transition-colors disabled:opacity-40',
          isMobile ? 'h-12' : 'h-9',
          item.danger ? 'text-danger hover:bg-danger/10 focus-visible:bg-danger/10' : 'text-fg hover:bg-surface-active focus-visible:bg-surface-active',
        )}
      >
        {item.icon && <span className="text-fg-2 [&>svg]:size-[18px]">{item.icon}</span>}
        <span className="truncate">{item.label}</span>
      </button>
    </div>
  ));

  if (isMobile) {
    return (
      <Sheet open onClose={() => dismiss(false)} label={menu.header?.title ?? 'Options'}>
        {menu.header && (
          <div className="mb-2 flex items-center gap-3 border-b border-line px-2 pb-4">
            <Artwork coverArtId={menu.header.coverArtId} size="thumb" className="size-12" rounded={menu.header.round ? 'full' : 'sm'} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{menu.header.title}</p>
              {menu.header.subtitle && <p className="truncate text-sm text-fg-2">{menu.header.subtitle}</p>}
            </div>
          </div>
        )}
        <div role="menu" aria-label={menu.header?.title ?? 'Options'}>
          {items}
        </div>
      </Sheet>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[80]" onPointerDown={() => dismiss(false)} onContextMenu={(e) => { e.preventDefault(); dismiss(false); }}>
      <div
        ref={ref}
        role="menu"
        aria-label={menu.header?.title ?? 'Options'}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
          const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = e.key === 'ArrowDown' ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }}
        className="animate-pop absolute min-w-[220px] max-w-[300px] rounded-md bg-surface-hover p-1.5 shadow-pop ring-1 ring-line"
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      >
        {items}
      </div>
    </div>,
    document.body,
  );
}
