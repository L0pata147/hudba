import { useEffect, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { Search as SearchIcon, X } from 'lucide-react-native';
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
  const d = search.data;

  return (
    <View style={{ flex: 1 }}>
      <TopInset>
        <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 12 }}>
          <T variant="h1">Search</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.textPrimary, borderRadius: 8, paddingHorizontal: 12, height: 48, gap: 8 }}>
            <SearchIcon color={t.bg} size={20} />
            <TextInput value={raw} onChangeText={setRaw} placeholder="Artists, songs or albums" placeholderTextColor="rgba(0,0,0,0.5)" style={{ flex: 1, color: t.bg, fontSize: 16, fontWeight: '500' }} accessibilityLabel="Search music" returnKeyType="search" autoCorrect={false} />
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
          ListHeaderComponent={<T variant="h2" style={{ marginBottom: 12 }}>Browse genres</T>}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item, index }) => (
            <View style={{ flex: 1, height: 96, borderRadius: 10, backgroundColor: COLORS[index % COLORS.length], padding: 12, marginBottom: 12 }}>
              <T style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{item.name}</T>
              <T variant="caption" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 'auto' }}>{item.albumCount} albums</T>
            </View>
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
            <View style={{ gap: 24, marginBottom: 12 }}>
              <Shelf title="Artists" items={d.artists} keyOf={(a) => a.id} render={(a) => <ArtistCard artist={a} width={120} />} />
              <Shelf title="Albums" items={d.albums} keyOf={(a) => a.id} render={(a) => <AlbumCard album={a} width={140} />} />
              <Shelf title="Playlists" items={d.playlists} keyOf={(p) => p.id} render={(p) => <PlaylistCard playlist={p} width={140} />} />
              {d.songs.length ? <T variant="h2" style={{ paddingHorizontal: 16 }}>Songs</T> : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <TrackRow song={item} onPress={() => playerStore.getState().playSongs(d.songs, index, { context: { type: 'search', name: `Search “${query}”` } })} onMore={() => openSong(item)} />
          )}
        />
      )}
      {search.isFetching && query ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: t.accent, opacity: 0.6 }} /> : null}
    </View>
  );
}
