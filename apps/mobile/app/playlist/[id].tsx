import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Pencil, Trash2, ArrowUp } from 'lucide-react-native';
import { playerStore, useContextPlayState, usePlaylist, usePlaylistMutations, useSession } from '@sonora/core';
import { formatLongDuration, moveItem, pluralize } from '@sonora/utils';
import { TrackRow } from '../../src/components/media';
import { CollectionHeader } from '../../src/components/Collection';
import { BackButton, TopInset } from '../../src/components/Screen';
import { EmptyState, ErrorState, RowsSkeleton } from '../../src/components/ui';
import { useCollectionSheet, useSongSheet } from '../../src/actions';
import { useSheet } from '../../src/sheet-store';
import { useTheme } from '../../src/theme';

export default function PlaylistScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlist = usePlaylist(id);
  const { rename, remove, reorder } = usePlaylistMutations();
  const { isCurrent, isPlaying } = useContextPlayState('playlist', id);
  const username = useSession((s) => s.session?.credentials.username);
  const openSong = useSongSheet();
  const openCollection = useCollectionSheet();
  const { openPrompt } = useSheet();
  if (playlist.isError) return <TopInset><BackButton /><View style={{ marginTop: 48 }}><ErrorState error={playlist.error} onRetry={() => void playlist.refetch()} /></View></TopInset>;
  if (!playlist.data) return <TopInset><BackButton /><View style={{ marginTop: 64 }}><RowsSkeleton /></View></TopInset>;
  const p = playlist.data;
  const editable = !p.owner || p.owner === username;
  const context = { type: 'playlist' as const, id: p.id, name: p.name };
  const play = (shuffle = false) => {
    if (!p.songs.length) return;
    if (isCurrent && !shuffle) return playerStore.getState().togglePlay();
    playerStore.getState().playSongs(p.songs, shuffle ? Math.floor(Math.random() * p.songs.length) : 0, { context, shuffle: shuffle || undefined });
  };
  const more = () =>
    openCollection(
      'playlist',
      p.id,
      p.name,
      p.coverArtId,
      editable
        ? [
            { label: 'Rename', icon: <Pencil color={t.textSecondary} size={22} />, onPress: () => openPrompt({ title: 'Rename playlist', initial: p.name, confirm: 'Save', onSubmit: (name) => rename.mutate({ id: p.id, name }) }) },
            { label: 'Delete playlist', danger: true, icon: <Trash2 color={t.danger} size={22} />, onPress: () => remove.mutate({ id: p.id, name: p.name }, { onSuccess: () => router.back() }) },
          ]
        : [],
    );
  // Touch-friendly reordering from the song menu (drag & drop is available on desktop).
  const songMenu = (index: number) =>
    openSong(p.songs[index]!, {
      playlist: editable ? p : undefined,
      index,
      actions:
        editable && index > 0
          ? [{ label: 'Move up', icon: <ArrowUp color={t.textSecondary} size={22} />, onPress: () => reorder.mutate({ id: p.id, songs: moveItem(p.songs, index, index - 1) }) }]
          : [],
    });
  return (
    <View style={{ flex: 1 }}>
      <BackButton />
      <FlashList
        data={p.songs}
        keyExtractor={(s, i) => `${s.id}-${i}`}
        ListHeaderComponent={
          <CollectionHeader
            kind="playlist"
            title={p.name}
            subtitle={p.owner}
            meta={[pluralize(p.songCount, 'song'), p.duration ? formatLongDuration(p.duration) : ''].filter(Boolean).join(' · ')}
            coverArtId={p.coverArtId}
            playing={isPlaying}
            onPlay={() => play()}
            onShuffle={() => play(true)}
            onMore={more}
          />
        }
        ListEmptyComponent={<EmptyState title="This playlist is empty" message="Add songs from their ⋮ menu." />}
        renderItem={({ item, index }) => <TrackRow song={item} onPress={() => playerStore.getState().playSongs(p.songs, index, { context })} onMore={() => songMenu(index)} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}
