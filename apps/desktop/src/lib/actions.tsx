import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  CircleMinus,
  Disc3,
  Download,
  Heart,
  HeartOff,
  ListEnd,
  ListPlus,
  ListStart,
  Pencil,
  Play,
  Radio,
  Shuffle,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { Album, Artist, Playlist, PlaybackContext, Song } from '@sonora/types';
import {
  downloadsStore,
  favoriteOverridesStore,
  fetchCollectionSongs,
  platform,
  playerStore,
  radioStore,
  resolveStarred,
  toast,
  usePlaylistMutations,
  useToggleFavorite,
} from '@sonora/core';
import type { RadioSeed } from '@sonora/core';
import { describeError } from '@sonora/api';
import { pluralize } from '@sonora/utils';
import { openMenuFrom, useUi, type MenuItemDef } from './ui-store';

export type CollectionKind = 'album' | 'playlist' | 'artist';

export async function playCollection(kind: CollectionKind, id: string, name: string, opts: { shuffle?: boolean; startIndex?: number } = {}): Promise<void> {
  try {
    const songs = await fetchCollectionSongs(kind, id);
    if (!songs.length) {
      toast.info('Nothing to play here yet.');
      return;
    }
    const context: PlaybackContext = { type: kind, id, name };
    const start = opts.shuffle ? Math.floor(Math.random() * songs.length) : (opts.startIndex ?? 0);
    playerStore.getState().playSongs(songs, start, { context, shuffle: opts.shuffle ?? playerStore.getState().queue.shuffled });
  } catch (err) {
    toast.error(describeError(err));
  }
}

/** Starts Radio and opens the Radio page. Errors (offline, empty seed) become toasts. */
export async function startRadio(seed: RadioSeed, song?: Song): Promise<void> {
  try {
    await radioStore.getState().start(seed, { song });
    toast.success(`Radio started from “${seed.name}”`);
  } catch (err) {
    toast.error(describeError(err));
  }
}

export async function queueCollection(kind: CollectionKind, id: string, mode: 'next' | 'end'): Promise<void> {
  try {
    const songs = await fetchCollectionSongs(kind, id);
    queueSongs(songs, mode);
  } catch (err) {
    toast.error(describeError(err));
  }
}

export function queueSongs(songs: Song[], mode: 'next' | 'end'): void {
  if (!songs.length) return;
  if (mode === 'next') playerStore.getState().playNext(songs);
  else playerStore.getState().addToQueue(songs);
  const what = songs.length === 1 ? `“${songs[0]?.title}”` : pluralize(songs.length, 'song');
  toast.success(mode === 'next' ? `${what} will play next` : `Added ${what} to queue`);
}

function downloadItems(songs: Song[]): MenuItemDef[] {
  if (!platform().offline || !songs.length) return [];
  const records = downloadsStore.getState().records;
  const allDone = songs.every((s) => records[s.id]?.status === 'done');
  if (allDone) {
    return [
      {
        id: 'remove-download',
        label: 'Remove download',
        icon: <CircleMinus />,
        onSelect: () => {
          for (const s of songs) void downloadsStore.getState().remove(s.id);
          toast.info('Removed from downloads');
        },
      },
    ];
  }
  return [
    {
      id: 'download',
      label: 'Download',
      icon: <Download />,
      onSelect: () => {
        downloadsStore.getState().download(songs);
        toast.info(`Downloading ${pluralize(songs.length, 'song')} for offline playback`);
      },
    },
  ];
}

/** Context menu builders shared by rows, cards and headers. */
export function useItemMenus() {
  const navigate = useNavigate();
  const toggleFavorite = useToggleFavorite();
  const { removeSongs, remove } = usePlaylistMutations();
  const openDialog = useUi((s) => s.openDialog);

  const favoriteItem = useCallback(
    (kind: 'song' | 'album' | 'artist', item: Song | Album | Artist): MenuItemDef => {
      const starred = resolveStarred(favoriteOverridesStore.getState().overrides, kind, item);
      return {
        id: 'favorite',
        label: starred ? 'Remove from Favorites' : 'Add to Favorites',
        icon: starred ? <HeartOff /> : <Heart />,
        onSelect: () => toggleFavorite.mutate({ kind, item, starred: !starred }),
      };
    },
    [toggleFavorite],
  );

  const openSongMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, song: Song, extra: { playlist?: Playlist; index?: number; queueUid?: string } = {}) => {
      const items: MenuItemDef[] = [
        {
          id: 'radio',
          label: 'Start radio',
          icon: <Radio />,
          onSelect: () => void startRadio({ kind: 'song', id: song.id, name: song.title, subtitle: song.artist, coverArtId: song.coverArtId }, song),
        },
        { id: 'next', label: 'Play next', icon: <ListStart />, onSelect: () => queueSongs([song], 'next') },
        { id: 'end', label: 'Add to queue', icon: <ListEnd />, onSelect: () => queueSongs([song], 'end') },
        { id: 'playlist', label: 'Add to playlist…', icon: <ListPlus />, onSelect: () => openDialog({ type: 'add-to-playlist', songs: [song] }) },
        favoriteItem('song', song),
        ...downloadItems([song]),
      ];
      if (extra.playlist && extra.index != null) {
        const pl = extra.playlist;
        const index = extra.index;
        items.push({
          id: 'remove-from-playlist',
          label: `Remove from ${pl.name}`,
          icon: <Trash2 />,
          danger: true,
          onSelect: () => removeSongs.mutate({ id: pl.id, indexes: [index] }),
        });
      }
      if (extra.queueUid) {
        const uid = extra.queueUid;
        items.push({ id: 'remove-queue', label: 'Remove from queue', icon: <Trash2 />, onSelect: () => playerStore.getState().removeFromQueue(uid) });
      }
      if (song.albumId) {
        const albumId = song.albumId;
        items.push({ id: 'album', label: 'Go to album', icon: <Disc3 />, separatorBefore: true, onSelect: () => navigate(`/album/${albumId}`) });
      }
      if (song.artistId) {
        const artistId = song.artistId;
        items.push({ id: 'artist', label: 'Go to artist', icon: <UserRound />, separatorBefore: !song.albumId, onSelect: () => navigate(`/artist/${artistId}`) });
      }
      openMenuFrom(e, items, { title: song.title, subtitle: song.artist, coverArtId: song.coverArtId });
    },
    [favoriteItem, navigate, openDialog, removeSongs],
  );

  const openAlbumMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, album: Album, songs?: Song[]) => {
      const items: MenuItemDef[] = [
        { id: 'play', label: 'Play', icon: <Play />, onSelect: () => void playCollection('album', album.id, album.name) },
        { id: 'shuffle', label: 'Shuffle', icon: <Shuffle />, onSelect: () => void playCollection('album', album.id, album.name, { shuffle: true }) },
        {
          id: 'radio',
          label: 'Start radio',
          icon: <Radio />,
          onSelect: () => void startRadio({ kind: 'album', id: album.id, name: album.name, subtitle: album.artist, coverArtId: album.coverArtId }),
        },
        { id: 'next', label: 'Play next', icon: <ListStart />, onSelect: () => void queueCollection('album', album.id, 'next') },
        { id: 'end', label: 'Add to queue', icon: <ListEnd />, onSelect: () => void queueCollection('album', album.id, 'end') },
        {
          id: 'playlist',
          label: 'Add to playlist…',
          icon: <ListPlus />,
          onSelect: () =>
            void fetchCollectionSongs('album', album.id)
              .then((s) => openDialog({ type: 'add-to-playlist', songs: s }))
              .catch((err: unknown) => toast.error(describeError(err))),
        },
        favoriteItem('album', album),
        ...(songs ? downloadItems(songs) : []),
      ];
      if (album.artistId) {
        const artistId = album.artistId;
        items.push({ id: 'artist', label: 'Go to artist', icon: <UserRound />, separatorBefore: true, onSelect: () => navigate(`/artist/${artistId}`) });
      }
      openMenuFrom(e, items, { title: album.name, subtitle: album.artist, coverArtId: album.coverArtId });
    },
    [favoriteItem, navigate, openDialog],
  );

  const openArtistMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, artist: Artist) => {
      openMenuFrom(
        e,
        [
          { id: 'play', label: 'Play', icon: <Play />, onSelect: () => void playCollection('artist', artist.id, artist.name) },
          { id: 'shuffle', label: 'Shuffle', icon: <Shuffle />, onSelect: () => void playCollection('artist', artist.id, artist.name, { shuffle: true }) },
          {
            id: 'radio',
            label: 'Start radio',
            icon: <Radio />,
            onSelect: () => void startRadio({ kind: 'artist', id: artist.id, name: artist.name, coverArtId: artist.coverArtId }),
          },
          { id: 'end', label: 'Add to queue', icon: <ListEnd />, onSelect: () => void queueCollection('artist', artist.id, 'end') },
          favoriteItem('artist', artist),
        ],
        { title: artist.name, subtitle: 'Artist', coverArtId: artist.coverArtId, round: true },
      );
    },
    [favoriteItem],
  );

  const openPlaylistMenu = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent, playlist: Playlist, songs?: Song[]) => {
      openMenuFrom(
        e,
        [
          { id: 'play', label: 'Play', icon: <Play />, onSelect: () => void playCollection('playlist', playlist.id, playlist.name) },
          { id: 'shuffle', label: 'Shuffle', icon: <Shuffle />, onSelect: () => void playCollection('playlist', playlist.id, playlist.name, { shuffle: true }) },
          {
            id: 'radio',
            label: 'Start radio',
            icon: <Radio />,
            onSelect: () => void startRadio({ kind: 'playlist', id: playlist.id, name: playlist.name, coverArtId: playlist.coverArtId }),
          },
          { id: 'next', label: 'Play next', icon: <ListStart />, onSelect: () => void queueCollection('playlist', playlist.id, 'next') },
          { id: 'end', label: 'Add to queue', icon: <ListEnd />, onSelect: () => void queueCollection('playlist', playlist.id, 'end') },
          ...(songs ? downloadItems(songs) : []),
          { id: 'edit', label: 'Edit details', icon: <Pencil />, separatorBefore: true, onSelect: () => openDialog({ type: 'edit-playlist', playlist }) },
          {
            id: 'delete',
            label: 'Delete playlist',
            icon: <Trash2 />,
            danger: true,
            onSelect: () =>
              openDialog({
                type: 'confirm',
                title: 'Delete playlist?',
                message: `“${playlist.name}” will be deleted from your server. This can't be undone.`,
                confirmLabel: 'Delete',
                danger: true,
                onConfirm: () =>
                  remove.mutate({ id: playlist.id, name: playlist.name }, { onSuccess: () => navigate('/library/playlists') }),
              }),
          },
        ],
        { title: playlist.name, subtitle: `Playlist · ${pluralize(playlist.songCount, 'song')}`, coverArtId: playlist.coverArtId },
      );
    },
    [navigate, openDialog, remove],
  );

  return { openSongMenu, openAlbumMenu, openArtistMenu, openPlaylistMenu };
}
