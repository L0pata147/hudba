import { useCallback, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { LayoutGrid, List, Plus, Rows3, Search, Shuffle } from 'lucide-react';
import type { AlbumListType, ViewMode } from '@sonora/types';
import {
  playerStore,
  preferencesStore,
  useArtists,
  useGenres,
  useInfiniteAlbums,
  useInfiniteSongs,
  usePlaylists,
  usePreferences,
} from '@sonora/core';
import { normalizeForSearch } from '@sonora/api';
import { pluralize } from '@sonora/utils';
import { AlbumCard, ArtistCard, PlaylistCard } from '../components/media/Cards';
import { AlbumRow, ArtistRow, PlaylistRow } from '../components/media/Rows';
import { VirtualGrid, VirtualRows } from '../components/media/VirtualCollection';
import { TrackList } from '../components/media/TrackList';
import { CardGrid } from '../components/media/Shelf';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Controls';
import { EmptyState, ErrorState } from '../components/ui/States';
import { CardSkeleton, TrackRowSkeleton } from '../components/ui/Skeleton';
import { useUi } from '../lib/ui-store';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const TABS = [
  { id: 'playlists', label: 'Playlists' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'songs', label: 'Songs' },
  { id: 'genres', label: 'Genres' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const ALBUM_SORTS: { value: AlbumListType; label: string }[] = [
  { value: 'alphabeticalByName', label: 'Name' },
  { value: 'alphabeticalByArtist', label: 'Artist' },
  { value: 'newest', label: 'Recently added' },
  { value: 'recent', label: 'Recently played' },
  { value: 'frequent', label: 'Most played' },
  { value: 'starred', label: 'Favorites' },
  { value: 'random', label: 'Random' },
];

function GridSkeleton({ round }: { round?: boolean }) {
  return (
    <CardGrid>
      {Array.from({ length: 12 }, (_, i) => (
        <CardSkeleton key={i} round={round} />
      ))}
    </CardGrid>
  );
}

function FilterField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-52 rounded-full bg-surface-hover pr-3 pl-9 text-[13px] text-fg outline-none focus:ring-2 focus:ring-accent max-sm:w-40"
      />
    </div>
  );
}

function PlaylistsTab({ view }: { view: ViewMode }) {
  const playlists = usePlaylists();
  const openDialog = useUi((s) => s.openDialog);
  if (playlists.isError) return <ErrorState error={playlists.error} onRetry={() => void playlists.refetch()} />;
  if (playlists.isPending) return <GridSkeleton />;
  if (!playlists.data.length)
    return (
      <EmptyState
        title="No playlists yet"
        message="Create a playlist to collect your favorite songs. Playlists sync with your Navidrome server."
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openDialog({ type: 'create-playlist' })}>
            Create playlist
          </Button>
        }
      />
    );
  if (view === 'grid')
    return (
      <CardGrid>
        {playlists.data.map((p) => (
          <PlaylistCard key={p.id} playlist={p} />
        ))}
      </CardGrid>
    );
  return (
    <div role="list">
      {playlists.data.map((p) => (
        <div role="listitem" key={p.id}>
          <PlaylistRow playlist={p} compact={view === 'compact'} />
        </div>
      ))}
    </div>
  );
}

function ArtistsTab({ view, filter }: { view: ViewMode; filter: string }) {
  const artists = useArtists();
  const q = useDebouncedValue(normalizeForSearch(filter), 120);
  const items = useMemo(() => (artists.data ?? []).filter((a) => !q || normalizeForSearch(a.name).includes(q)), [artists.data, q]);
  if (artists.isError) return <ErrorState error={artists.error} onRetry={() => void artists.refetch()} />;
  if (artists.isPending) return <GridSkeleton round />;
  if (!items.length) return <EmptyState title={q ? 'No matching artists' : 'No artists yet'} />;
  if (view === 'grid') return <VirtualGrid items={items} getKey={(a) => a.id} renderItem={(a) => <ArtistCard artist={a} />} />;
  return <VirtualRows items={items} getKey={(a) => a.id} rowHeight={view === 'compact' ? 44 : 64} renderRow={(a) => <ArtistRow artist={a} compact={view === 'compact'} />} />;
}

function AlbumsTab({ view, sort }: { view: ViewMode; sort: AlbumListType }) {
  const albums = useInfiniteAlbums(sort);
  const items = useMemo(() => albums.data?.pages.flat() ?? [], [albums.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = albums;
  const more = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  if (albums.isError) return <ErrorState error={albums.error} onRetry={() => void albums.refetch()} />;
  if (albums.isPending) return <GridSkeleton />;
  if (!items.length) return <EmptyState title={sort === 'starred' ? 'No favorite albums yet' : sort === 'recent' || sort === 'frequent' ? 'Nothing played yet' : 'No albums yet'} />;
  return (
    <>
      {view === 'grid' ? (
        <VirtualGrid items={items} getKey={(a) => a.id} renderItem={(a) => <AlbumCard album={a} />} onEndReached={more} />
      ) : (
        <VirtualRows items={items} getKey={(a) => a.id} rowHeight={view === 'compact' ? 44 : 64} renderRow={(a) => <AlbumRow album={a} compact={view === 'compact'} />} onEndReached={more} />
      )}
      {isFetchingNextPage && <p className="py-6 text-center text-[13px] text-fg-3">Loading more…</p>}
    </>
  );
}

function SongsTab({ view }: { view: ViewMode }) {
  const songs = useInfiniteSongs();
  const items = useMemo(() => songs.data?.pages.flat() ?? [], [songs.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = songs;
  if (songs.isError) return <ErrorState error={songs.error} onRetry={() => void songs.refetch()} />;
  if (songs.isPending) return <TrackRowSkeleton count={12} />;
  if (!items.length) return <EmptyState title="No songs yet" />;
  return (
    <>
      <div className="flex items-center gap-3 px-4 pb-4 md:px-6">
        <Button
          variant="primary"
          icon={<Shuffle className="size-4" />}
          onClick={() => playerStore.getState().playSongs(items, Math.floor(Math.random() * items.length), { context: { type: 'songs', name: 'All songs' }, shuffle: true })}
        >
          Shuffle {hasNextPage ? `${items.length} loaded songs` : pluralize(items.length, 'song')}
        </Button>
      </div>
      <TrackList songs={items} context={{ type: 'songs', name: 'All songs' }} variant={view === 'compact' ? 'compact' : 'list'} label="All songs" />
      {hasNextPage && (
        <div className="flex justify-center py-6">
          <Button variant="outline" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            Load more songs
          </Button>
        </div>
      )}
    </>
  );
}

function GenresTab() {
  const genres = useGenres();
  const navigate = useNavigate();
  if (genres.isError) return <ErrorState error={genres.error} onRetry={() => void genres.refetch()} />;
  if (genres.isPending) return <TrackRowSkeleton count={8} />;
  if (!genres.data.length) return <EmptyState title="No genres" message="Genres come from the tags in your music files." />;
  return (
    <div className="grid grid-cols-1 gap-2 px-3 sm:grid-cols-2 lg:grid-cols-3">
      {genres.data.map((g) => (
        <button
          key={g.name}
          type="button"
          onClick={() => navigate(`/genre/${encodeURIComponent(g.name)}`)}
          className="flex items-center justify-between rounded-md bg-surface px-4 py-3.5 text-left transition-colors hover:bg-surface-hover"
        >
          <span className="truncate font-semibold">{g.name}</span>
          <span className="shrink-0 text-[13px] text-fg-2">
            {pluralize(g.albumCount, 'album')} · {pluralize(g.songCount, 'song')}
          </span>
        </button>
      ))}
    </div>
  );
}

export function LibraryPage() {
  const params = useParams();
  const tab: Tab = (TABS.find((t) => t.id === params.tab)?.id ?? 'playlists') as Tab;
  const [search, setSearch] = useSearchParams();
  const sort = (ALBUM_SORTS.find((s) => s.value === search.get('sort'))?.value ?? 'alphabeticalByName') as AlbumListType;
  const view = usePreferences((s) => s.libraryView);
  const [filter, setFilter] = useState('');
  const openDialog = useUi((s) => s.openDialog);

  return (
    <div className="pt-2">
      <div className="flex flex-col gap-4 px-4 pt-4 pb-5 md:px-6 md:pt-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[1.9rem] font-extrabold tracking-tight">Your Library</h1>
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => openDialog({ type: 'create-playlist' })}>
            <span className="max-sm:hidden">New playlist</span>
          </Button>
        </div>
        <nav aria-label="Library sections" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {TABS.map((t) => (
            <NavLink
              key={t.id}
              to={`/library/${t.id}`}
              className={clsx(
                'inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors',
                tab === t.id ? 'bg-fg text-bg' : 'bg-surface-hover text-fg hover:bg-surface-active',
              )}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {tab === 'artists' && <FilterField value={filter} onChange={setFilter} placeholder="Filter artists" />}
            {tab === 'albums' && (
              <label className="flex items-center gap-2 text-[13px] text-fg-2">
                Sort by
                <select
                  value={sort}
                  onChange={(e) => setSearch({ sort: e.target.value }, { replace: true })}
                  className="h-9 rounded-full bg-surface-hover px-3 text-[13px] font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {ALBUM_SORTS.map((s) => (
                    <option key={s.value} value={s.value} className="bg-bg-elevated">
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {tab !== 'genres' && (
            <Segmented<ViewMode>
              label="View mode"
              iconOnly
              value={tab === 'songs' && view === 'grid' ? 'list' : view}
              onChange={(v) => preferencesStore.getState().set('libraryView', v)}
              options={[
                ...(tab === 'songs' ? [] : [{ value: 'grid' as const, label: 'Grid', icon: <LayoutGrid /> }]),
                { value: 'list', label: 'List', icon: <List /> },
                { value: 'compact', label: 'Compact list', icon: <Rows3 /> },
              ]}
            />
          )}
        </div>
      </div>
      <div className="px-1 md:px-3">
        {tab === 'playlists' && <PlaylistsTab view={view} />}
        {tab === 'artists' && <ArtistsTab view={view} filter={filter} />}
        {tab === 'albums' && <AlbumsTab view={view} sort={sort} />}
        {tab === 'songs' && <SongsTab view={view} />}
        {tab === 'genres' && <GenresTab />}
      </div>
    </div>
  );
}
