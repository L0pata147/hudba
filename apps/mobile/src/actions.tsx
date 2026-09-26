import { useRouter } from 'expo-router';
import { Disc3, Download, Heart, HeartOff, ListEnd, ListPlus, ListStart, Radio, Trash2, UserRound, CircleMinus } from 'lucide-react-native';
import type { Playlist, PlaybackContext, Song } from '@sonora/types';
import {
  downloadsStore,
  favoriteOverridesStore,
  fetchCollectionSongs,
  playerStore,
  radioStore,
  resolveStarred,
  type RadioSeed,
  toast,
  usePlaylistMutations,
  useToggleFavorite,
} from '@sonora/core';
import { describeError } from '@sonora/api';
import { pluralize } from '@sonora/utils';
import { useSheet, type SheetAction } from './sheet-store';
import { useTheme } from './theme';

export async function playCollection(kind: 'album' | 'playlist' | 'artist', id: string, name: string, shuffle = false) {
  try {
    const songs = await fetchCollectionSongs(kind, id);
    if (!songs.length) return;
    const context: PlaybackContext = { type: kind, id, name };
    playerStore.getState().playSongs(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, { context, shuffle: shuffle || undefined });
  } catch (err) {
    toast.error(describeError(err));
  }
}

/** Starts Radio; the Radio tab shows what it is playing. */
export async function startRadio(seed: RadioSeed, song?: Song) {
  try {
    await radioStore.getState().start(seed, { song });
    toast.success(`Radio started from “${seed.name}”`);
  } catch (err) {
    toast.error(describeError(err));
  }
}

export function queueSongs(songs: Song[], mode: 'next' | 'end') {
  if (mode === 'next') playerStore.getState().playNext(songs);
  else playerStore.getState().addToQueue(songs);
  toast.success(mode === 'next' ? 'Will play next' : `Added ${pluralize(songs.length, 'song')} to queue`);
}

export function useSongSheet() {
  const t = useTheme();
  const router = useRouter();
  const open = useSheet((s) => s.open);
  const openAdd = useSheet((s) => s.openAddToPlaylist);
  const fav = useToggleFavorite();
  const { removeSongs } = usePlaylistMutations();
  const ic = t.textSecondary;
  return (song: Song, extra: { playlist?: Playlist; index?: number; actions?: SheetAction[] } = {}) => {
    const starred = resolveStarred(favoriteOverridesStore.getState().overrides, 'song', song);
    const rec = downloadsStore.getState().records[song.id];
    const actions: SheetAction[] = [
      ...(extra.actions ?? []),
      {
        label: 'Start radio',
        icon: <Radio color={ic} size={22} />,
        onPress: () => void startRadio({ kind: 'song', id: song.id, name: song.title, subtitle: song.artist, coverArtId: song.coverArtId }, song),
      },
      { label: 'Play next', icon: <ListStart color={ic} size={22} />, onPress: () => queueSongs([song], 'next') },
      { label: 'Add to queue', icon: <ListEnd color={ic} size={22} />, onPress: () => queueSongs([song], 'end') },
      { label: 'Add to playlist', icon: <ListPlus color={ic} size={22} />, onPress: () => openAdd([song]) },
      {
        label: starred ? 'Remove from Favorites' : 'Add to Favorites',
        icon: starred ? <HeartOff color={ic} size={22} /> : <Heart color={ic} size={22} />,
        onPress: () => fav.mutate({ kind: 'song', item: song, starred: !starred }),
      },
      rec?.status === 'done'
        ? { label: 'Remove download', icon: <CircleMinus color={ic} size={22} />, onPress: () => void downloadsStore.getState().remove(song.id) }
        : { label: 'Download', icon: <Download color={ic} size={22} />, onPress: () => downloadsStore.getState().download([song]) },
    ];
    if (extra.playlist && extra.index != null) {
      const { playlist, index } = extra;
      actions.push({ label: `Remove from ${playlist.name}`, danger: true, icon: <Trash2 color={t.danger} size={22} />, onPress: () => removeSongs.mutate({ id: playlist.id, indexes: [index] }) });
    }
    if (song.albumId) actions.push({ label: 'Go to album', icon: <Disc3 color={ic} size={22} />, onPress: () => router.push(`/album/${song.albumId}`) });
    if (song.artistId) actions.push({ label: 'Go to artist', icon: <UserRound color={ic} size={22} />, onPress: () => router.push(`/artist/${song.artistId}`) });
    open({ title: song.title, subtitle: song.artist, coverArtId: song.coverArtId, actions });
  };
}

export function useCollectionSheet() {
  const t = useTheme();
  const open = useSheet((s) => s.open);
  const openAdd = useSheet((s) => s.openAddToPlaylist);
  const ic = t.textSecondary;
  return (kind: 'album' | 'playlist' | 'artist', id: string, name: string, coverArtId?: string, extra: SheetAction[] = []) => {
    const load = () => fetchCollectionSongs(kind, id);
    open({
      title: name,
      subtitle: kind[0]!.toUpperCase() + kind.slice(1),
      coverArtId,
      actions: [
        { label: 'Start radio', icon: <Radio color={ic} size={22} />, onPress: () => void startRadio({ kind, id, name, coverArtId }) },
        { label: 'Play next', icon: <ListStart color={ic} size={22} />, onPress: () => void load().then((s) => queueSongs(s, 'next')).catch((e: unknown) => toast.error(describeError(e))) },
        { label: 'Add to queue', icon: <ListEnd color={ic} size={22} />, onPress: () => void load().then((s) => queueSongs(s, 'end')).catch((e: unknown) => toast.error(describeError(e))) },
        { label: 'Add to playlist', icon: <ListPlus color={ic} size={22} />, onPress: () => void load().then(openAdd).catch((e: unknown) => toast.error(describeError(e))) },
        {
          label: 'Download',
          icon: <Download color={ic} size={22} />,
          onPress: () =>
            void load()
              .then((s) => {
                downloadsStore.getState().download(s);
                toast.info(`Downloading ${pluralize(s.length, 'song')}`);
              })
              .catch((e: unknown) => toast.error(describeError(e))),
        },
        ...extra,
      ],
    });
  };
}
