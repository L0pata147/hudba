import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings } from 'lucide-react-native';
import { playerStore, recentSongs, useAlbumList, useArtists, useHistory, usePlaylists, useSession, useStarred } from '@sonora/core';
import { greeting } from '@sonora/utils';
import { AlbumCard, ArtistCard, Card, PlaylistCard, Shelf } from '../../src/components/media';
import { ErrorState, Skeleton, T, Artwork, Tap } from '../../src/components/ui';
import { TopInset } from '../../src/components/Screen';
import { useTheme } from '../../src/theme';

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const username = useSession((s) => s.session?.user.username ?? '');
  const recent = useAlbumList('recent', 20);
  const newest = useAlbumList('newest', 20);
  const frequent = useAlbumList('frequent', 20);
  const random = useAlbumList('random', 20);
  const starred = useStarred();
  const playlists = usePlaylists();
  const artists = useArtists();
  const history = useHistory((s) => s.entries);
  const played = useMemo(() => recentSongs(history, 12), [history]);
  const quick = useMemo(() => [...(recent.data ?? []), ...(newest.data ?? [])].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i).slice(0, 6), [recent.data, newest.data]);
  const refreshing = recent.isRefetching || newest.isRefetching;
  const refresh = () => void Promise.all([recent.refetch(), newest.refetch(), frequent.refetch(), random.refetch(), starred.refetch(), playlists.refetch()]);

  if (newest.isError && recent.isError) return <TopInset><ErrorState error={newest.error} onRetry={refresh} /></TopInset>;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32, gap: 28 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}>
      <LinearGradient colors={[t.accentSoft, 'transparent']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 320 }} />
      <TopInset>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
          <T variant="h1" numberOfLines={1} style={{ flex: 1 }}>{greeting()}{username ? `, ${username}` : ''}</T>
          <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" hitSlop={10}>
            <Settings color={t.textPrimary} size={24} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 16 }}>
          {newest.isPending
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} style={{ width: '48.5%', height: 56 }} />)
            : quick.map((a) => (
                <Tap key={a.id} onPress={() => router.push(`/album/${a.id}`)} accessibilityRole="button" accessibilityLabel={a.name} style={{ width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surfaceHover, borderRadius: 6, overflow: 'hidden' }}>
                  <Artwork coverArtId={a.coverArtId} size={96} style={{ width: 56, height: 56, borderRadius: 0 }} />
                  <T numberOfLines={2} style={{ flex: 1, fontWeight: '700', fontSize: 13 }}>{a.name}</T>
                </Tap>
              ))}
        </View>
      </TopInset>
      <Shelf title="Recently played" items={recent.data ?? []} keyOf={(a) => a.id} render={(a) => <AlbumCard album={a} />} />
      <Shelf
        title="Jump back in"
        items={played}
        keyOf={(s) => s.id}
        render={(s) => (
          <Card kind="album" title={s.title} subtitle={s.artist} coverArtId={s.coverArtId} onPress={() => playerStore.getState().playSongs(played, played.indexOf(s), { context: { type: 'songs', name: 'Recently played' } })} />
        )}
      />
      <Shelf title="Recently added" items={newest.data ?? []} keyOf={(a) => a.id} render={(a) => <AlbumCard album={a} />} />
      <Shelf title="Your favorite albums" items={starred.data?.albums ?? []} keyOf={(a) => a.id} render={(a) => <AlbumCard album={a} />} />
      <Shelf title="Your playlists" items={playlists.data ?? []} keyOf={(p) => p.id} render={(p) => <PlaylistCard playlist={p} />} />
      <Shelf title="Most played" items={frequent.data ?? []} keyOf={(a) => a.id} render={(a) => <AlbumCard album={a} />} />
      <Shelf title="Artists" items={(artists.data ?? []).slice().sort((a, b) => b.albumCount - a.albumCount).slice(0, 20)} keyOf={(a) => a.id} render={(a) => <ArtistCard artist={a} />} />
      <Shelf title="Rediscover" items={random.data ?? []} keyOf={(a) => a.id} render={(a) => <AlbumCard album={a} />} />
    </ScrollView>
  );
}
