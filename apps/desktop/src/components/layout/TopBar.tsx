import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, LogOut, Search, Settings, X } from 'lucide-react';
import { resetForLogout, useSession } from '@sonora/core';
import { IconButton } from '../ui/Button';
import { useUi, openMenuFrom } from '../../lib/ui-store';

/** Sticky header: history navigation, search field and account menu. */
export function TopBar({ scrolled }: { scrolled: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearch = location.pathname.startsWith('/search');
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSignal = useUi((s) => s.searchFocusSignal);
  const username = useSession((s) => s.session?.credentials.username ?? '');
  const server = useSession((s) => s.session?.server.name ?? '');
  const [value, setValue] = useState(params.get('q') ?? '');

  // Sync from the URL only for external navigation (back/forward), never while typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setValue(onSearch ? (params.get('q') ?? '') : '');
  }, [onSearch, params]);

  useEffect(() => {
    if (focusSignal > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusSignal]);

  const update = (q: string) => {
    setValue(q);
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search', { replace: onSearch });
  };

  return (
    <header
      className={clsx(
        'sticky top-0 z-30 flex h-16 items-center gap-3 px-4 transition-colors duration-200 lg:px-6',
        scrolled ? 'bg-bg-elevated/95 shadow-[0_1px_0_var(--border)] backdrop-blur-md' : 'bg-transparent',
      )}
    >
      <div className="flex gap-1.5">
        <IconButton label="Go back" size="sm" variant="solid" className="!bg-black/30" onClick={() => navigate(-1)}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <IconButton label="Go forward" size="sm" variant="solid" className="!bg-black/30" onClick={() => navigate(1)}>
          <ChevronRight className="size-5" />
        </IconButton>
      </div>

      <div role="search" className="group relative w-full max-w-[420px]">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-fg-3 group-focus-within:text-fg" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => update(e.target.value)}
          onFocus={() => !onSearch && navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search')}
          onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget.blur(), value && update(''))}
          placeholder="What do you want to listen to?"
          aria-label="Search music"
          className="h-11 w-full rounded-full bg-surface-hover pr-10 pl-11 text-[14px] text-fg ring-1 ring-transparent transition-shadow outline-none hover:ring-line focus:bg-surface-active focus:ring-2 focus:ring-fg/80 [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button type="button" aria-label="Clear search" onClick={() => update('')} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-fg-2 hover:text-fg">
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded bg-surface-active px-1.5 py-0.5 font-sans text-[11px] text-fg-3 max-lg:hidden">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K
          </kbd>
        )}
      </div>

      <div className="flex-1" />
      <button
        type="button"
        aria-label="Account menu"
        onClick={(e) =>
          openMenuFrom(
            e,
            [
              { id: 'settings', label: 'Settings', icon: <Settings />, onSelect: () => navigate('/settings') },
              { id: 'logout', label: 'Log out', icon: <LogOut />, separatorBefore: true, onSelect: () => resetForLogout() },
            ],
            { title: username, subtitle: server },
          )
        }
        className="flex size-9 items-center justify-center rounded-full bg-accent font-display text-[15px] font-bold text-on-accent uppercase ring-4 ring-black/30 transition-transform hover:scale-105"
      >
        {username.slice(0, 1) || '?'}
      </button>
    </header>
  );
}
