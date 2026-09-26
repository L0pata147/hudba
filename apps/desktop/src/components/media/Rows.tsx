import { Link } from 'react-router';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import type { Album, Artist, Playlist } from '@sonora/types';
import { pluralize, formatLongDuration } from '@sonora/utils';
import { Artwork } from '../ui/Artwork';
import { useItemMenus } from '../../lib/actions';

interface RowProps {
  to: string;
  title: string;
  subtitle: string;
  meta?: string;
  coverArtId?: string;
  imageUrl?: string;
  round?: boolean;
  compact?: boolean;
  kind: 'album' | 'artist' | 'playlist';
  onMenu: (e: React.MouseEvent) => void;
}

export function MediaRow({ to, title, subtitle, meta, coverArtId, imageUrl, round, compact, kind, onMenu }: RowProps) {
  return (
    <div className={clsx('group relative mx-1 flex items-center gap-3 rounded-md px-2 hover:bg-surface-hover focus-within:bg-surface-hover sm:mx-3', compact ? 'h-11' : 'h-16')} onContextMenu={onMenu}>
      {!compact && <Artwork coverArtId={coverArtId} src={imageUrl} kind={kind} size="thumb" rounded={round ? 'full' : 'sm'} className="size-12 shrink-0" />}
      <div className="min-w-0 flex-1">
        <Link to={to} className="block truncate text-[15px] font-medium after:absolute after:inset-0 focus-visible:outline-none">
          {title}
        </Link>
        {!compact && <p className="truncate text-[13px] text-fg-2">{subtitle}</p>}
      </div>
      {compact && <span className="w-1/3 truncate text-[13px] text-fg-2 max-sm:hidden">{subtitle}</span>}
      {meta && <span className="w-28 shrink-0 text-right text-[13px] text-fg-3 max-sm:hidden">{meta}</span>}
      <button type="button" aria-label={`More options for ${title}`} onClick={onMenu} className="relative z-10 rounded-full p-1.5 text-fg-2 opacity-0 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 max-md:opacity-100">
        <MoreHorizontal className="size-[18px]" />
      </button>
    </div>
  );
}

export function AlbumRow({ album, compact }: { album: Album; compact?: boolean }) {
  const { openAlbumMenu } = useItemMenus();
  return (
    <MediaRow
      to={`/album/${album.id}`}
      kind="album"
      title={album.name}
      subtitle={album.artist}
      meta={[album.year, pluralize(album.songCount, 'song')].filter(Boolean).join(' · ')}
      coverArtId={album.coverArtId}
      compact={compact}
      onMenu={(e) => openAlbumMenu(e, album)}
    />
  );
}

export function ArtistRow({ artist, compact }: { artist: Artist; compact?: boolean }) {
  const { openArtistMenu } = useItemMenus();
  return (
    <MediaRow
      to={`/artist/${artist.id}`}
      kind="artist"
      title={artist.name}
      subtitle="Artist"
      meta={pluralize(artist.albumCount, 'album')}
      coverArtId={artist.coverArtId}
      imageUrl={artist.imageUrl}
      round
      compact={compact}
      onMenu={(e) => openArtistMenu(e, artist)}
    />
  );
}

export function PlaylistRow({ playlist, compact }: { playlist: Playlist; compact?: boolean }) {
  const { openPlaylistMenu } = useItemMenus();
  return (
    <MediaRow
      to={`/playlist/${playlist.id}`}
      kind="playlist"
      title={playlist.name}
      subtitle={`Playlist · ${playlist.owner ?? ''}`}
      meta={`${pluralize(playlist.songCount, 'song')}${playlist.duration ? ` · ${formatLongDuration(playlist.duration)}` : ''}`}
      coverArtId={playlist.coverArtId}
      compact={compact}
      onMenu={(e) => openPlaylistMenu(e, playlist)}
    />
  );
}
