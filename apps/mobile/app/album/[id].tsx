import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { playerStore, useAlbum, useContextPlayState } from '@sonora/core';
import { formatLongDuration, pluralize } from '@sonora/utils';
import { TrackRow } from '../../src/components/media';
import { CollectionHeader } from '../../src/components/Collection';
import { FavoriteToggle } from '../../src/components/FavoriteToggle';
import { BackButton, TopInset } from '../../src/components/Screen';
import { ErrorState, RowsSkeleton } from '../../src/components/ui';
import { useCollectionSheet, useSongSheet } from '../../src/actions';

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const album = useAlbum(id);
  const { isCurrent, isPlaying } = useContextPlayState('album', id);
  const openSong = useSongSheet();
  const openCollection = useCollectionSheet();
  if (album.isError) return <TopInset><BackButton /><View style={{ marginTop: 48 }}><ErrorState error={album.error} onRetry={() => void album.refetch()} /></View></TopInset>;
  if (!album.data) return <TopInset><BackButton /><View style={{ marginTop: 64 }}><RowsSkeleton /></View></TopInset>;
  const a = album.data;
  const context = { type: 'album' as const, id: a.id, name: a.name };
  const play = (shuffle = false) => {
    if (isCurrent && !shuffle) return playerStore.getState().togglePlay();
    playerStore.getState().playSongs(a.songs, shuffle ? Math.floor(Math.random() * a.songs.length) : 0, { context, shuffle: shuffle || undefined });
  };
  return (
    <View style={{ flex: 1 }}>
      <BackButton />
      <FlashList
        data={a.songs}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={
          <CollectionHeader
            title={a.name}
            subtitle={a.artist}
            meta={[a.year, pluralize(a.songs.length, 'song'), formatLongDuration(a.duration)].filter(Boolean).join(' · ')}
            coverArtId={a.coverArtId}
            playing={isPlaying}
            onPlay={() => play()}
            onShuffle={() => play(true)}
            onMore={() => openCollection('album', a.id, a.name, a.coverArtId)}
            extra={<FavoriteToggle kind="album" item={a} />}
          />
        }
        renderItem={({ item, index }) => <TrackRow song={item} number={item.track ?? index + 1} showArt={false} onPress={() => playerStore.getState().playSongs(a.songs, index, { context })} onMore={() => openSong(item)} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </View>
  );
}
