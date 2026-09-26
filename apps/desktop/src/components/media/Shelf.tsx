import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '../ui/Button';

interface ShelfProps {
  title: string;
  subtitle?: string;
  to?: string;
  children: ReactNode;
}

/**
 * Horizontal section. On wide screens it shows a single row that scrolls
 * horizontally with arrow buttons; on touch it scrolls with snap.
 */
export function Shelf({ title, subtitle, to, children }: ShelfProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };
  return (
    <section className="animate-rise flex flex-col gap-1" aria-label={title}>
      <div className="flex items-end justify-between gap-4 px-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.35rem] font-bold tracking-tight">{to ? <Link to={to} className="hover:underline">{title}</Link> : title}</h2>
          {subtitle && <p className="text-[13px] text-fg-2">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 max-md:hidden">
          {to && (
            <Link to={to} className="mr-2 text-[13px] font-semibold text-fg-2 hover:text-fg hover:underline">
              Show all
            </Link>
          )}
          <IconButton label={`Scroll ${title} left`} size="sm" variant="solid" onClick={() => scrollBy(-1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label={`Scroll ${title} right`} size="sm" variant="solid" onClick={() => scrollBy(1)}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      </div>
      <div
        ref={scroller}
        className="no-scrollbar grid snap-x snap-mandatory auto-cols-[44%] grid-flow-col overflow-x-auto scroll-smooth sm:auto-cols-[30%] md:auto-cols-[24%] lg:auto-cols-[19%] xl:auto-cols-[15.5%] 2xl:auto-cols-[12.3%] [&>*]:snap-start"
      >
        {children}
      </div>
    </section>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(172px,1fr))]">{children}</div>;
}
