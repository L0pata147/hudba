import { lazy, Suspense, useEffect } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { favoriteOverridesStore, restoreQueueFromServer, usePreferences, useSession } from '@sonora/core';
import { AppShell } from './components/layout/AppShell';
import { MenuHost } from './components/ui/Menu';
import { Toaster } from './components/ui/Toaster';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { applyTheme } from './lib/theme';
import { TrackRowSkeleton } from './components/ui/Skeleton';

// Secondary routes are code-split to keep start-up fast.
const SearchPage = lazy(() => import('./pages/Search').then((m) => ({ default: m.SearchPage })));
const LibraryPage = lazy(() => import('./pages/Library').then((m) => ({ default: m.LibraryPage })));
const AlbumPage = lazy(() => import('./pages/Album').then((m) => ({ default: m.AlbumPage })));
const ArtistPage = lazy(() => import('./pages/Artist').then((m) => ({ default: m.ArtistPage })));
const PlaylistPage = lazy(() => import('./pages/Playlist').then((m) => ({ default: m.PlaylistPage })));
const FavoritesPage = lazy(() => import('./pages/Favorites').then((m) => ({ default: m.FavoritesPage })));
const HistoryPage = lazy(() => import('./pages/History').then((m) => ({ default: m.HistoryPage })));
const DownloadsPage = lazy(() => import('./pages/Downloads').then((m) => ({ default: m.DownloadsPage })));
const GenrePage = lazy(() => import('./pages/Genre').then((m) => ({ default: m.GenrePage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFoundPage })));

const page = (el: React.ReactNode) => <Suspense fallback={<div className="pt-24"><TrackRowSkeleton /></div>}>{el}</Suspense>;

// Hash routing works identically in the browser, a static host and Tauri's custom protocol.
const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: page(<SearchPage />) },
      { path: 'library', element: <Navigate to="/library/playlists" replace /> },
      { path: 'library/:tab', element: page(<LibraryPage />) },
      { path: 'album/:id', element: page(<AlbumPage />) },
      { path: 'artist/:id', element: page(<ArtistPage />) },
      { path: 'playlist/:id', element: page(<PlaylistPage />) },
      { path: 'favorites', element: page(<FavoritesPage />) },
      { path: 'history', element: page(<HistoryPage />) },
      { path: 'downloads', element: page(<DownloadsPage />) },
      { path: 'genre/:name', element: page(<GenrePage />) },
      { path: 'settings', element: page(<SettingsPage />) },
      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
]);

function useThemeSync() {
  const theme = usePreferences((s) => s.theme);
  const accent = usePreferences((s) => s.accent);
  const compact = usePreferences((s) => s.compactMode);
  useEffect(() => {
    applyTheme(theme, accent, compact);
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme(theme, accent, compact);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme, accent, compact]);
}

export function App() {
  const session = useSession((s) => s.session);
  const qc = useQueryClient();
  useThemeSync();

  // Leaving an account must not leak its cached data into the next one.
  useEffect(() => {
    if (!session) {
      qc.clear();
      favoriteOverridesStore.getState().reset();
    } else {
      void restoreQueueFromServer();
    }
  }, [session, qc]);

  return (
    <>
      {session ? <RouterProvider router={router} /> : <LoginPage />}
      <MenuHost />
      <Toaster />
    </>
  );
}
