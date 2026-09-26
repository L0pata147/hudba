import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { IconButton } from './Button';

function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(
        (el) => !el.hasAttribute('disabled'),
      );
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const firstEl = els[0]!;
        const lastEl = els[els.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return ref;
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Centered modal on desktop, bottom sheet on mobile. */
export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const isMobile = useIsMobile();
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  if (isMobile) {
    return (
      <Sheet open={open} onClose={onClose} label={title}>
        <div className="px-2">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
          <div className="mt-5">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </div>
      </Sheet>
    );
  }
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[90] flex items-center justify-center bg-overlay p-6 backdrop-blur-sm" onPointerDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        className={clsx('animate-pop relative w-full max-w-[440px] rounded-xl bg-bg-elevated p-6 shadow-pop ring-1 ring-line', className)}
      >
        <IconButton label="Close" size="sm" className="absolute top-4 right-4" onClick={onClose}>
          <X className="size-[18px]" />
        </IconButton>
        <h2 className="pr-10 font-display text-xl font-bold">{title}</h2>
        {description && <p className="mt-1 text-sm text-fg-2">{description}</p>}
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}

/** Touch bottom sheet with drag-to-dismiss. */
export function Sheet({ open, onClose, label, children, className }: SheetProps) {
  const ref = useFocusTrap(open, onClose);
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  if (!open) return null;
  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[90] bg-overlay backdrop-blur-[2px]" onPointerDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onPointerDown={(e) => e.stopPropagation()}
        className={clsx(
          'animate-sheet-up safe-bottom absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-xl bg-bg-elevated px-3 pt-2 pb-4 shadow-pop',
          className,
        )}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: start.current === null ? 'transform .2s' : 'none' }}
      >
        <div
          className="flex cursor-grab touch-none justify-center pt-1 pb-3"
          onPointerDown={(e) => {
            start.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current !== null && setDragY(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => {
            if (dragY > 90) onClose();
            start.current = null;
            setDragY(0);
          }}
        >
          <span className="h-1.5 w-10 rounded-full bg-fg/20" aria-hidden />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
