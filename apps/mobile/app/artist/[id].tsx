import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useArtist, useArtistTopSongs, useContextPlayState, playerStore } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { AlbumCard, Shelf, TrackRow } from '../../src/components/media';
import { CollectionHeader } from '../../src/components/Collection';
import { FavoriteToggle } from '../../src/components/FavoriteToggle';
import { BackButton, TopInset } from '../../src/components/Screen';
import { ErrorState, RowsSkeleton, T } from '../../src/components/ui';
import { playCollection, useCollectionSheet, useSongSheet } from '../../src/actions';

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const artist = useArtist(id);
  const top = useArtistTopSongs(artist.data);
  const { isCurrent, isPlaying } = useContextPlayState('artist', id);
  const openSong = useSongSheet();
  const openCollection = useCollectionSheet();
  if (artist.isError) return <TopInset><BackButton /><View style={{ marginTop: 48 }}><ErrorState error={artist.error} onRetry={() => void artist.refetch()} /></View></TopInset>;
  if (!artist.data) return <TopInset><BackButton /><View style={{ marginTop: 64 }}><RowsSkeleton /></View></TopInset>;
  const a = artist.data;
  const songs = top.data?.songs ?? [];
  const albums = [...a.albums].sort((x, y) => (y.year ?? 0) - (x.year ?? 0));
  return (
    <View style={{ flex: 1 }}>
      <BackButton />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <CollectionHeader
          kind="artist"
          round
          title={a.name}
          meta={pluralize(a.albumCount || albums.length, 'album')}
          coverArtId={a.coverArtId}
          uri={a.imageUrl}
          playing={isPlaying}
          onPlay={() => (isCurrent ? playerStore.getState().togglePlay() : void playCollection('artist', a.id, a.name))}
          onShuffle={() => void playCollection('artist', a.id, a.name, true)}
          onMore={() => openCollection('artist', a.id, a.name, a.coverArtId)}
          extra={<FavoriteToggle kind="artist" item={a} />}
        />
        {songs.length ? (
          <>
            <T variant="h2" style={{ paddingHorizontal: 16, marginBottom: 6 }}>{top.data?.source === 'server' ? 'Popular' : 'Tracks'}</T>
            {songs.slice(0, 5).map((s, i) => (
              <TrackRow key={s.id} song={s} onPress={() => playerStore.getState().playSongs(songs, i, { context: { type: 'artist', id: a.id, name: a.name } })} onMore={() => openSong(s)} />
            ))}
          </>
        ) : top.isPending ? <RowsSkeleton count={3} /> : null}
        <View style={{ marginTop: 24 }}>
          <Shelf title="Discography" items={albums} keyOf={(x) => x.id} render={(x) => <AlbumCard album={x} />} />
        </View>
      </ScrollView>
    </View>
  );
}
