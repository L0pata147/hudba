import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { DownloadCloud, History, ListMusic, Plus, Sparkles } from 'lucide-react-native';
import { describeSmartRules, playerStore, SMART_TEMPLATES, smartPlaylistsStore, useArtists, useInfiniteAlbums, useInfiniteSongs, usePlaylistMutations, usePlaylists, useSmartPlaylists } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { Artwork, EmptyState, ErrorState, RowsSkeleton, T } from '../../src/components/ui';
import { TopInset } from '../../src/components/Screen';
import { useSheet } from '../../src/sheet-store';
import { TrackRow } from '../../src/components/media';
import { useSongSheet } from '../../src/actions';
import { useTheme } from '../../src/theme';

type Tab = 'playlists' | 'songs' | 'artists' | 'albums';

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
  const songs = useInfiniteSongs();
  const songItems = useMemo(() => songs.data?.pages.flat() ?? [], [songs.data]);
  const openSong = useSongSheet();
  const { create } = usePlaylistMutations();
  const openPrompt = useSheet((s) => s.openPrompt);
  const openSheet = useSheet((s) => s.open);
  const smart = useSmartPlaylists((s) => s.playlists);
  const newPlaylist = () => openPrompt({ title: 'New playlist', confirm: 'Create', onSubmit: (name) => create.mutate({ name }, { onSuccess: (p) => router.push(`/playlist/${p.id}`) }) });
  const newSmart = () =>
    openSheet({
      title: 'New smart playlist',
      subtitle: 'Picks songs from your whole library and keeps itself up to date',
      actions: SMART_TEMPLATES.map((tpl) => ({
        label: tpl.name,
        icon: <Sparkles color={t.textSecondary} size={22} />,
        onPress: () => router.push(`/smart/${smartPlaylistsStore.getState().create(tpl.name, tpl.rules).id}`),
      })),
    });
  const create_ = () =>
    openSheet({
      title: 'Create',
      actions: [
        { label: 'Playlist', icon: <ListMusic color={t.textSecondary} size={22} />, onPress: () => setTimeout(newPlaylist, 400) },
        { label: 'Smart playlist', icon: <Sparkles color={t.textSecondary} size={22} />, onPress: () => setTimeout(newSmart, 400) },
      ],
    });
  const active = tab === 'playlists' ? playlists : tab === 'songs' ? songs : tab === 'artists' ? artists : albums;

  return (
    <View style={{ flex: 1 }}>
      <TopInset>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 }}>
          <T variant="h1">Your Library</T>
          <Pressable onPress={create_} accessibilityRole="button" accessibilityLabel="Create playlist" hitSlop={10}>
            <Plus color={t.textPrimary} size={26} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
          {[
            { label: 'History', Icon: History, to: '/history' },
            { label: 'Downloaded', Icon: DownloadCloud, to: '/downloads' },
          ].map(({ label, Icon, to }) => (
            <Pressable key={to} onPress={() => router.push(to)} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: pressed ? t.surfaceActive : t.surface })}>
              <Icon color={t.accent} size={18} />
              <T style={{ fontWeight: '700', fontSize: 14 }}>{label}</T>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 }} accessibilityRole="tablist">
          {(['playlists', 'songs', 'artists', 'albums'] as Tab[]).map((x) => (
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
          ListHeaderComponent={
            smart.length ? (
              <View>
                {smart.map((p) => (
                  <Pressable key={p.id} onPress={() => router.push(`/smart/${p.id}`)} accessibilityRole="button" accessibilityLabel={`${p.name}, smart playlist`} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? t.surfaceHover : 'transparent' })}>
                    <View style={{ width: 60, height: 60, borderRadius: 6, backgroundColor: '#8B6BFF', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles color="#fff" size={26} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T numberOfLines={1} style={{ fontWeight: '600' }}>{p.name}</T>
                      <T variant="caption" dim={1} numberOfLines={1}>Smart playlist · {describeSmartRules(p.rules)}</T>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={smart.length ? null : <EmptyState title="No playlists yet" message="Tap + to create a playlist or a smart playlist." />}
          renderItem={({ item }) => <Row kind="playlist" title={item.name} subtitle={`Playlist · ${pluralize(item.songCount, 'song')}`} coverArtId={item.coverArtId} onPress={() => router.push(`/playlist/${item.id}`)} />}
        />
      ) : tab === 'songs' ? (
        <FlashList
          data={songItems}
          keyExtractor={(s) => s.id}
          onEndReached={() => songs.hasNextPage && !songs.isFetchingNextPage && void songs.fetchNextPage()}
          onEndReachedThreshold={0.6}
          ListEmptyComponent={<EmptyState title="No songs yet" message="Add music to your Navidrome library and run a scan." />}
          renderItem={({ item, index }) => (
            <TrackRow
              song={item}
              // the loaded songs become the queue, starting with this one
              onPress={() => playerStore.getState().playSongs(songItems, index, { context: { type: 'songs', name: 'Songs' } })}
              onMore={() => openSong(item)}
            />
          )}
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
