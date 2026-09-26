import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Heart } from 'lucide-react-native';
import { playerStore, useStarred } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { AlbumCard, ArtistCard, Shelf, TrackRow } from '../../src/components/media';
import { EmptyState, ErrorState, PlayButton, RowsSkeleton, T } from '../../src/components/ui';
import { TopInset } from '../../src/components/Screen';
import { useSongSheet } from '../../src/actions';
import { useTheme } from '../../src/theme';

export default function Favorites() {
  const t = useTheme();
  const starred = useStarred();
  const openSong = useSongSheet();
  const songs = starred.data?.songs ?? [];
  const context = { type: 'favorites' as const, id: 'songs', name: 'Favorite songs' };
  return (
    <View style={{ flex: 1 }}>
      {starred.isError ? (
        <TopInset><ErrorState error={starred.error} onRetry={() => void starred.refetch()} /></TopInset>
      ) : starred.isPending ? (
        <TopInset><RowsSkeleton /></TopInset>
      ) : (
        <FlashList
          data={songs}
          keyExtractor={(s) => s.id}
          ListHeaderComponent={
            <TopInset>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T variant="h1">Favorites</T>
                  <T dim={1}>{pluralize(songs.length, 'song')}</T>
                </View>
                {songs.length ? <PlayButton playing={false} onPress={() => playerStore.getState().playSongs(songs, 0, { context })} /> : null}
              </View>
              <View style={{ gap: 20, marginVertical: 16 }}>
                <Shelf title="Albums" items={starred.data.albums} keyOf={(a) => a.id} render={(a) => <AlbumCard album={a} width={130} />} />
                <Shelf title="Artists" items={starred.data.artists} keyOf={(a) => a.id} render={(a) => <ArtistCard artist={a} width={110} />} />
              </View>
            </TopInset>
          }
          ListEmptyComponent={<EmptyState icon={<Heart color={t.textSecondary} size={36} />} title="Songs you like will appear here" message="Save songs by tapping the heart." />}
          renderItem={({ item, index }) => <TrackRow song={item} onPress={() => playerStore.getState().playSongs(songs, index, { context })} onMore={() => openSong(item)} />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}
