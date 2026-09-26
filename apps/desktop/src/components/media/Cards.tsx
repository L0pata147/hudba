import { memo, type ReactNode } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import type { Album, Artist, Playlist } from '@sonora/types';
import { playerStore, useContextPlayState } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { Artwork } from '../ui/Artwork';
import { PlayButton } from '../ui/PlayButton';
import { playCollection, useItemMenus, type CollectionKind } from '../../lib/actions';

interface MediaCardProps {
  to: string;
  kind: CollectionKind;
  id: string;
  title: string;
  subtitle: ReactNode;
  coverArtId?: string;
  imageUrl?: string;
  round?: boolean;
  onMenu?: (e: React.MouseEvent | React.KeyboardEvent) => void;
}

/** Artwork-first card with hover play button (albums, artists, playlists). */
export const MediaCard = memo(function MediaCard({ to, kind, id, title, subtitle, coverArtId, imageUrl, round, onMenu }: MediaCardProps) {
  const { isCurrent, isPlaying } = useContextPlayState(kind, id);
  const onPlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCurrent) playerStore.getState().togglePlay();
    else void playCollection(kind, id, title);
  };
  return (
    <div className="group relative rounded-lg p-3 transition-colors duration-200 hover:bg-surface-hover focus-within:bg-surface-hover" onContextMenu={onMenu}>
      <div className="relative">
        <Artwork
          coverArtId={coverArtId}
          src={imageUrl}
          kind={kind === 'artist' ? 'artist' : kind}
          rounded={round ? 'full' : 'md'}
          className="aspect-square w-full shadow-card"
        />
        <div
          className={clsx(
            'absolute right-2 bottom-2 transition-all duration-200 ease-soft',
            isCurrent ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100',
          )}
        >
          <PlayButton size="md" playing={isPlaying} onClick={onPlay} label={isPlaying ? `Pause ${title}` : `Play ${title}`} className="relative z-10" />
        </div>
      </div>
      <div className="mt-3 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <Link to={to} className={clsx('block truncate text-[15px] font-semibold after:absolute after:inset-0 after:content-[""] focus-visible:outline-none', isCurrent && 'text-accent')} title={title}>
            {title}
          </Link>
          <div className="mt-0.5 truncate text-[13px] text-fg-2">{subtitle}</div>
        </div>
        {onMenu && (
          <button
            type="button"
            aria-label={`More options for ${title}`}
            onClick={onMenu}
            className="relative z-10 -mr-1 rounded-full p-1 text-fg-2 opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 max-md:opacity-100"
          >
            <MoreHorizontal className="size-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
});

export function AlbumCard({ album, subtitle }: { album: Album; subtitle?: ReactNode }) {
  const { openAlbumMenu } = useItemMenus();
  return (
    <MediaCard
      to={`/album/${album.id}`}
      kind="album"
      id={album.id}
      title={album.name}
      subtitle={subtitle ?? [album.year, album.artist].filter(Boolean).join(' · ')}
      coverArtId={album.coverArtId}
      onMenu={(e) => openAlbumMenu(e, album)}
    />
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  const { openArtistMenu } = useItemMenus();
  return (
    <MediaCard
      to={`/artist/${artist.id}`}
      kind="artist"
      id={artist.id}
      title={artist.name}
      subtitle={artist.albumCount ? pluralize(artist.albumCount, 'album') : 'Artist'}
      coverArtId={artist.coverArtId}
      imageUrl={artist.imageUrl}
      round
      onMenu={(e) => openArtistMenu(e, artist)}
    />
  );
}

export function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const { openPlaylistMenu } = useItemMenus();
  return (
    <MediaCard
      to={`/playlist/${playlist.id}`}
      kind="playlist"
      id={playlist.id}
      title={playlist.name}
      subtitle={playlist.comment || pluralize(playlist.songCount, 'song')}
      coverArtId={playlist.coverArtId}
      onMenu={(e) => openPlaylistMenu(e, playlist)}
    />
  );
}
