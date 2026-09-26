import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import clsx from 'clsx';
import { useCurrentItem, useSession } from '@sonora/core';
import { ScrollContext } from '../../lib/scroll';
import { useUi } from '../../lib/ui-store';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import { PlayerBar } from '../player/PlayerBar';
import { MiniPlayer } from '../player/MiniPlayer';
import { NowPlaying } from '../player/NowPlaying';
import { QueuePanel } from '../player/QueuePanel';
import { Sheet } from '../ui/Dialog';
import { Dialogs } from '../dialogs/Dialogs';
import { AlertTriangle } from 'lucide-react';

function InsecureBanner() {
  const insecure = useSession((s) => s.insecureConnection);
  const [dismissed, setDismissed] = useState(false);
  if (!insecure || dismissed) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-warning/15 px-4 py-2 text-[13px] text-warning">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="flex-1">Your server is connected over plain HTTP. Credentials and music are sent unencrypted — use HTTPS if the server is reachable from the internet.</span>
      <button type="button" className="font-semibold hover:underline" onClick={() => setDismissed(true)}>
        Dismiss
      </button>
    </div>
  );
}

export function AppShell() {
  const scrollRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();
  const hasItem = Boolean(useCurrentItem());
  const queueOpen = useUi((s) => s.queueOpen);
  const setQueueOpen = useUi((s) => s.setQueueOpen);
  useKeyboardShortcuts();

  // Reset scroll on navigation, like a normal page load.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrolled(false);
  }, [location.pathname]);

  // Toasts sit above whatever bottom chrome is visible.
  useEffect(() => {
    const px = isMobile ? 64 + (hasItem ? 66 : 0) : 96;
    document.documentElement.style.setProperty('--bottom-chrome', `${px}px`);
  }, [isMobile, hasItem]);

  const main = (
    <main
      ref={scrollRef}
      id="main"
      tabIndex={-1}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}
      className={clsx('relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-bg-elevated outline-none', !isMobile && 'rounded-lg')}
    >
      {!isMobile && <TopBar scrolled={scrolled} />}
      <div key={location.pathname} className="animate-fade-in pb-10">
        <Outlet />
      </div>
    </main>
  );

  return (
    <ScrollContext.Provider value={scrollRef}>
      <a href="#main" className="sr-only z-[200] rounded-md bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      {isMobile ? (
        <div className="flex h-[100dvh] flex-col bg-bg">
          <InsecureBanner />
          {main}
          <div className="relative z-40 shrink-0">
            <MiniPlayer />
            <MobileNav />
          </div>
          <Sheet open={queueOpen} onClose={() => setQueueOpen(false)} label="Queue" className="h-[85vh]">
            <QueuePanel className="h-full" onClose={() => setQueueOpen(false)} />
          </Sheet>
        </div>
      ) : (
        <div className="flex h-screen flex-col gap-2 bg-bg p-2 pb-0">
          <InsecureBanner />
          <div className="flex min-h-0 flex-1 gap-2">
            <Sidebar />
            {main}
            {queueOpen && (
              <aside className="animate-rise flex w-[340px] shrink-0 flex-col rounded-lg bg-bg-elevated max-lg:absolute max-lg:top-2 max-lg:right-2 max-lg:bottom-[96px] max-lg:z-40 max-lg:shadow-pop max-lg:ring-1 max-lg:ring-line" aria-label="Queue panel">
                <QueuePanel className="h-full" onClose={() => setQueueOpen(false)} />
              </aside>
            )}
          </div>
          <PlayerBar />
        </div>
      )}
      <NowPlaying />
      <Dialogs />
    </ScrollContext.Provider>
  );
}
