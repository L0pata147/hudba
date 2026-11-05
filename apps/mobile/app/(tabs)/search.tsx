import { useEffect, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Clock, Search as SearchIcon, X } from 'lucide-react-native';
import { useRecentSearches } from '../../src/recent-searches';
import { playerStore, useGenres, useSearch } from '@sonora/core';
import { ArtistCard, AlbumCard, PlaylistCard, Shelf, TrackRow } from '../../src/components/media';
import { EmptyState, ErrorState, RowsSkeleton, T } from '../../src/components/ui';
import { TopInset } from '../../src/components/Screen';
import { useSongSheet } from '../../src/actions';
import { useTheme } from '../../src/theme';

const COLORS = ['#E8603C', '#1E3264', '#8D67AB', '#E1118C', '#148A08', '#BA5D07', '#27856A', '#0D73EC'];

export default function Search() {
  const t = useTheme();
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQuery(raw.trim()), 250);
    return () => clearTimeout(id);
  }, [raw]);
  const search = useSearch(query);
  const genres = useGenres();
  const openSong = useSongSheet();
  const router = useRouter();
  const recents = useRecentSearches();
  const remember = () => recents.add(query);
  const d = search.data;

  return (
    <View style={{ flex: 1 }}>
      <TopInset>
        <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 12 }}>
          <T variant="h1">Search</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.textPrimary, borderRadius: 8, paddingHorizontal: 12, height: 48, gap: 8 }}>
            <SearchIcon color={t.bg} size={20} />
            <TextInput value={raw} onChangeText={setRaw} placeholder="Artists, songs or albums" placeholderTextColor="rgba(0,0,0,0.5)" style={{ flex: 1, color: t.bg, fontSize: 16, fontWeight: '500' }} accessibilityLabel="Search music" returnKeyType="search" autoCorrect={false} onSubmitEditing={() => recents.add(raw)} />
            {raw ? (
              <Pressable onPress={() => setRaw('')} accessibilityLabel="Clear search" hitSlop={10}>
                <X color={t.bg} size={20} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </TopInset>
      {!query ? (
        <FlatList
          data={genres.data ?? []}
          numColumns={2}
          keyExtractor={(g) => g.name}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              {recents.queries.length ? (
                <View style={{ marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <T variant="h2">Recent searches</T>
                    <Pressable onPress={recents.clear} accessibilityRole="button" hitSlop={10}>
                      <T variant="caption" dim={1} style={{ fontWeight: '700' }}>Clear</T>
                    </Pressable>
                  </View>
                  {recents.queries.map((q) => (
                    <Pressable key={q} onPress={() => setRaw(q)} accessibilityRole="button" accessibilityLabel={`Search for ${q}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
                      <Clock color={t.textSecondary} size={18} />
                      <T numberOfLines={1} style={{ flex: 1 }}>{q}</T>
                      <Pressable onPress={() => recents.remove(q)} accessibilityRole="button" accessibilityLabel={`Remove ${q}`} hitSlop={10}>
                        <X color={t.textMuted} size={18} />
                      </Pressable>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <T variant="h2" style={{ marginBottom: 12 }}>Browse genres</T>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => router.push(`/genre/${encodeURIComponent(item.name)}`)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.songCount} songs`}
              style={({ pressed }) => ({ flex: 1, height: 96, borderRadius: 10, backgroundColor: COLORS[index % COLORS.length], padding: 12, marginBottom: 12, opacity: pressed ? 0.8 : 1 })}
            >
              <T style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{item.name}</T>
              <T variant="caption" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 'auto' }}>{item.songCount} songs · {item.albumCount} albums</T>
            </Pressable>
          )}
        />
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} />
      ) : !d ? (
        <RowsSkeleton />
      ) : !d.songs.length && !d.albums.length && !d.artists.length && !d.playlists.length ? (
        <EmptyState icon={<SearchIcon color={t.textSecondary} size={36} />} title={`No results for “${query}”`} message="Check the spelling, or try different keywords." />
      ) : (
        <FlatList
          data={d.songs}
          keyExtractor={(s) => s.id}
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 24 }}
          ListHeaderComponent={
            <View style={{ gap: 24, marginBottom: 12 }} onTouchStart={remember}>
              <Shelf title="Artists" items={d.artists} keyOf={(a) => a.id} render={(a) => <ArtistCard artist={a} width={120} />} />
              <Shelf title="Albums" items={d.albums} keyOf={(a) => a.id} render={(a) => <AlbumCard album={a} width={140} />} />
              <Shelf title="Playlists" items={d.playlists} keyOf={(p) => p.id} render={(p) => <PlaylistCard playlist={p} width={140} />} />
              {d.songs.length ? <T variant="h2" style={{ paddingHorizontal: 16 }}>Songs</T> : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <TrackRow
              song={item}
              onPress={() => {
                remember();
                playerStore.getState().playSongs(d.songs, index, { context: { type: 'search', name: `Search “${query}”` } });
              }}
              onMore={() => openSong(item)}
            />
          )}
        />
      )}
      {search.isFetching && query ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: t.accent, opacity: 0.6 }} /> : null}
    </View>
  );
}
