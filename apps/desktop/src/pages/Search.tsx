import { useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import clsx from 'clsx';
import { Search as SearchIcon, X } from 'lucide-react';
import type { TopResult } from '@sonora/types';
import { playerStore, useGenres, useSearch } from '@sonora/core';
import { normalizeForSearch } from '@sonora/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useIsMobile } from '../hooks/useMediaQuery';
import { AlbumCard, ArtistCard, PlaylistCard } from '../components/media/Cards';
import { CardGrid, Shelf } from '../components/media/Shelf';
import { TrackList } from '../components/media/TrackList';
import { Artwork } from '../components/ui/Artwork';
import { PlayButton } from '../components/ui/PlayButton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { Skeleton, TrackRowSkeleton } from '../components/ui/Skeleton';
import { playCollection } from '../lib/actions';
import { useUi } from '../lib/ui-store';

const GENRE_COLORS = ['#E8603C', '#1E3264', '#8D67AB', '#E1118C', '#148A08', '#BA5D07', '#503750', '#27856A', '#0D73EC', '#A56752', '#777777', '#509BF5'];

function pickTop(query: string, r: NonNullable<ReturnType<typeof useSearch>['data']>): TopResult | null {
  const q = normalizeForSearch(query);
  const exact = <T extends { name?: string; title?: string }>(x: T) => normalizeForSearch(x.name ?? x.title ?? '') === q;
  const artist = r.artists.find(exact);
  if (artist) return { kind: 'artist', item: artist };
  const album = r.albums.find(exact);
  if (album) return { kind: 'album', item: album };
  const pl = r.playlists.find(exact);
  if (pl) return { kind: 'playlist', item: pl };
  if (r.artists[0] && normalizeForSearch(r.artists[0].name).startsWith(q)) return { kind: 'artist', item: r.artists[0] };
  if (r.songs[0]) return { kind: 'song', item: r.songs[0] };
  if (r.albums[0]) return { kind: 'album', item: r.albums[0] };
  if (r.artists[0]) return { kind: 'artist', item: r.artists[0] };
  if (r.playlists[0]) return { kind: 'playlist', item: r.playlists[0] };
  return null;
}

function TopResultCard({ top, songs }: { top: TopResult; songs: NonNullable<ReturnType<typeof useSearch>['data']>['songs'] }) {
  const navigate = useNavigate();
  const title = top.kind === 'song' ? top.item.title : top.item.name;
  const subtitle =
    top.kind === 'artist' ? 'Artist' : top.kind === 'album' ? `Album · ${top.item.artist}` : top.kind === 'song' ? `Song · ${top.item.artist}` : 'Playlist';
  const to =
    top.kind === 'artist' ? `/artist/${top.item.id}` : top.kind === 'album' ? `/album/${top.item.id}` : top.kind === 'playlist' ? `/playlist/${top.item.id}` : top.item.albumId ? `/album/${top.item.albumId}` : '';
  const play = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (top.kind === 'song') playerStore.getState().playSongs(songs, songs.indexOf(top.item), { context: { type: 'search', name: 'Search results' } });
    else void playCollection(top.kind, top.item.id, title);
  };
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => to && navigate(to)}
      onKeyDown={(e) => e.key === 'Enter' && to && navigate(to)}
      className="group relative flex h-full min-h-[220px] cursor-pointer flex-col gap-5 rounded-lg bg-surface p-5 transition-colors hover:bg-surface-hover"
    >
      <Artwork
        coverArtId={top.item.coverArtId}
        src={top.kind === 'artist' ? top.item.imageUrl : undefined}
        kind={top.kind}
        rounded={top.kind === 'artist' ? 'full' : 'md'}
        className="size-24 shadow-card"
      />
      <div className="min-w-0">
        <p className="truncate font-display text-[1.9rem] leading-tight font-extrabold">{title}</p>
        <p className="mt-1 text-[14px] text-fg-2">
          <span className="rounded-full bg-bg/60 px-2.5 py-1 text-[12px] font-bold text-fg">{subtitle}</span>
        </p>
      </div>
      <PlayButton size="lg" playing={false} onClick={play} label={`Play ${title}`} className="absolute right-5 bottom-5 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100" />
    </div>
  );
}

function BrowseGenres() {
  const genres = useGenres();
  if (genres.isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-[1.6] rounded-lg" />
        ))}
      </div>
    );
  }
  if (genres.isError) return <ErrorState error={genres.error} onRetry={() => void genres.refetch()} />;
  if (!genres.data?.length) return <EmptyState title="No genres yet" message="Genres come from the tags in your music files." />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-4">
      {genres.data.map((g, i) => (
        <Link
          key={g.name}
          to={`/genre/${encodeURIComponent(g.name)}`}
          className="group relative aspect-[1.6] overflow-hidden rounded-lg p-4 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: GENRE_COLORS[i % GENRE_COLORS.length] }}
        >
          <span className="relative z-10 font-display text-[1.25rem] leading-tight font-extrabold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.25)]">{g.name}</span>
          <span className="absolute bottom-3 left-4 z-10 text-[12px] font-semibold text-white/80">{g.albumCount} albums</span>
          <span className="absolute -right-6 -bottom-6 size-24 rotate-[25deg] rounded-md bg-black/20 shadow-lg transition-transform duration-300 group-hover:rotate-[18deg]" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('q') ?? '';
  const query = useDebouncedValue(raw.trim(), 220);
  const search = useSearch(query);
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSignal = useUi((s) => s.searchFocusSignal);

  useEffect(() => {
    if (isMobile && focusSignal) inputRef.current?.focus();
  }, [isMobile, focusSignal]);

  const data = search.data;
  const top = useMemo(() => (data && query ? pickTop(query, data) : null), [data, query]);
  const empty = data && !data.artists.length && !data.albums.length && !data.songs.length && !data.playlists.length;
  const stale = raw.trim() !== query || search.isFetching;

  return (
    <div className="px-2 pt-2 md:px-3">
      {isMobile && (
        <div className="sticky top-0 z-20 -mx-2 bg-bg-elevated px-4 pt-4 pb-3">
          <h1 className="mb-3 font-display text-[1.7rem] font-extrabold">Search</h1>
          <div role="search" className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-bg/60" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={raw}
              onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
              placeholder="Artists, songs or albums"
              aria-label="Search music"
              enterKeyHint="search"
              className="h-12 w-full rounded-md bg-fg pr-10 pl-11 text-[15px] font-medium text-bg outline-none placeholder:text-bg/55 [&::-webkit-search-cancel-button]:hidden"
            />
            {raw && (
              <button type="button" aria-label="Clear search" onClick={() => setParams({}, { replace: true })} className="absolute top-1/2 right-3 -translate-y-1/2 text-bg/70">
                <X className="size-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {!query ? (
        <div className="px-3 pt-2">
          <h2 className="mb-4 font-display text-[1.35rem] font-bold">Browse genres</h2>
          <BrowseGenres />
        </div>
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} />
      ) : !data ? (
        <div className="grid gap-6 px-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Skeleton className="h-[220px] rounded-lg" />
          <TrackRowSkeleton count={4} />
        </div>
      ) : empty ? (
        <EmptyState icon={<SearchIcon />} title={`No results for “${query}”`} message="Check the spelling, or try fewer or different keywords." />
      ) : (
        <div className={clsx('flex flex-col gap-8 transition-opacity', stale && 'opacity-70')} aria-busy={stale}>
          <div className="grid gap-6 px-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {top && (
              <section aria-label="Top result">
                <h2 className="mb-3 font-display text-[1.35rem] font-bold">Top result</h2>
                <TopResultCard top={top} songs={data.songs} />
              </section>
            )}
            {data.songs.length > 0 && (
              <section aria-label="Songs" className="min-w-0">
                <h2 className="mb-3 font-display text-[1.35rem] font-bold">Songs</h2>
                <div className="-mx-3 sm:-mx-4">
                  <TrackList songs={data.songs.slice(0, 5)} context={{ type: 'search', name: `Search “${query}”` }} showHeader={false} showAlbum={false} label="Top songs" />
                </div>
              </section>
            )}
          </div>
          {data.artists.length > 0 && (
            <Shelf title="Artists">
              {data.artists.map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </Shelf>
          )}
          {data.albums.length > 0 && (
            <Shelf title="Albums">
              {data.albums.map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
            </Shelf>
          )}
          {data.playlists.length > 0 && (
            <section aria-label="Playlists" className="flex flex-col gap-1">
              <h2 className="px-3 font-display text-[1.35rem] font-bold">Playlists</h2>
              <CardGrid>
                {data.playlists.map((p) => (
                  <PlaylistCard key={p.id} playlist={p} />
                ))}
              </CardGrid>
            </section>
          )}
          {data.songs.length > 5 && (
            <section aria-label="All songs">
              <h2 className="px-3 pb-3 font-display text-[1.35rem] font-bold">All songs</h2>
              <TrackList songs={data.songs} context={{ type: 'search', name: `Search “${query}”` }} label="All matching songs" />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
