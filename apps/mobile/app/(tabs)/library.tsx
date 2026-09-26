import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { Plus } from 'lucide-react-native';
import { useArtists, useInfiniteAlbums, usePlaylistMutations, usePlaylists } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { Artwork, EmptyState, ErrorState, RowsSkeleton, T } from '../../src/components/ui';
import { TopInset } from '../../src/components/Screen';
import { useSheet } from '../../src/sheet-store';
import { useTheme } from '../../src/theme';

type Tab = 'playlists' | 'artists' | 'albums';

function Row({ title, subtitle, coverArtId, uri, round, kind, onPress }: { title: string; subtitle: string; coverArtId?: string; uri?: string; round?: boolean; kind: 'album' | 'artist' | 'playlist'; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${subtitle}`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? t.surfaceHover : 'transparent' })}>
      <Artwork coverArtId={coverArtId} uri={uri} kind={kind} round={round} size={120} style={{ width: 60, height: 60, borderRadius: round ? 30 : 6 }} />
      <View style={{ flex: 1 }}>
        <T numberOfLines={1} style={{ fontWeight: '600' }}>{title}</T>
        <T variant="caption" dim={1} numberOfLines={1}>{subtitle}</T>
      </View>
    </Pressable>
  );
}

export default function Library() {
  const t = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('playlists');
  const playlists = usePlaylists();
  const artists = useArtists();
  const albums = useInfiniteAlbums('alphabeticalByName');
  const albumItems = useMemo(() => albums.data?.pages.flat() ?? [], [albums.data]);
  const { create } = usePlaylistMutations();
  const openPrompt = useSheet((s) => s.openPrompt);
  const active = tab === 'playlists' ? playlists : tab === 'artists' ? artists : albums;

  return (
    <View style={{ flex: 1 }}>
      <TopInset>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 }}>
          <T variant="h1">Your Library</T>
          <Pressable onPress={() => openPrompt({ title: 'New playlist', confirm: 'Create', onSubmit: (name) => create.mutate({ name }, { onSuccess: (p) => router.push(`/playlist/${p.id}`) }) })} accessibilityRole="button" accessibilityLabel="Create playlist" hitSlop={10}>
            <Plus color={t.textPrimary} size={26} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }} accessibilityRole="tablist">
          {(['playlists', 'artists', 'albums'] as Tab[]).map((x) => (
            <Pressable key={x} onPress={() => setTab(x)} accessibilityRole="tab" accessibilityState={{ selected: tab === x }} style={{ paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: tab === x ? t.textPrimary : t.surfaceHover }}>
              <T style={{ fontWeight: '600', fontSize: 13, color: tab === x ? t.bg : t.textPrimary }}>{x[0]!.toUpperCase() + x.slice(1)}</T>
            </Pressable>
          ))}
        </View>
      </TopInset>
      {active.isError ? (
        <ErrorState error={active.error} onRetry={() => void active.refetch()} />
      ) : active.isPending ? (
        <RowsSkeleton />
      ) : tab === 'playlists' ? (
        <FlashList
          data={playlists.data ?? []}
          keyExtractor={(p) => p.id}
          ListEmptyComponent={<EmptyState title="No playlists yet" message="Tap + to create your first playlist." />}
          renderItem={({ item }) => <Row kind="playlist" title={item.name} subtitle={`Playlist · ${pluralize(item.songCount, 'song')}`} coverArtId={item.coverArtId} onPress={() => router.push(`/playlist/${item.id}`)} />}
        />
      ) : tab === 'artists' ? (
        <FlashList
          data={artists.data ?? []}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => <Row kind="artist" round title={item.name} subtitle={pluralize(item.albumCount, 'album')} coverArtId={item.coverArtId} uri={item.imageUrl} onPress={() => router.push(`/artist/${item.id}`)} />}
        />
      ) : (
        <FlashList
          data={albumItems}
          keyExtractor={(a) => a.id}
          onEndReached={() => albums.hasNextPage && !albums.isFetchingNextPage && void albums.fetchNextPage()}
          onEndReachedThreshold={0.6}
          renderItem={({ item }) => <Row kind="album" title={item.name} subtitle={`${item.artist}${item.year ? ` · ${item.year}` : ''}`} coverArtId={item.coverArtId} onPress={() => router.push(`/album/${item.id}`)} />}
        />
      )}
    </View>
  );
}
