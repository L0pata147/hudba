import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Radio, Tags } from 'lucide-react-native';
import { useInfiniteSongs } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { SongListScreen } from '../../src/components/SongListScreen';
import { IconArt, genreColor } from '../../src/components/Tiles';
import { startRadio } from '../../src/actions';
import { useTheme } from '../../src/theme';

/** All songs of a genre, loaded as you scroll; play, shuffle or start a genre radio. */
export default function GenreScreen() {
  const t = useTheme();
  const { name = '' } = useLocalSearchParams<{ name: string }>();
  const songs = useInfiniteSongs({ genre: name });
  const items = useMemo(() => songs.data?.pages.flat() ?? [], [songs.data]);
  return (
    <SongListScreen
      title={name}
      subtitle="Genre"
      meta={songs.hasNextPage ? `${items.length}+ songs` : pluralize(items.length, 'song')}
      art={<IconArt name={name} color={genreColor(name)} Icon={Tags} size={230} />}
      songs={items}
      context={{ type: 'genre', id: name, name }}
      loading={songs.isPending}
      error={songs.isError ? songs.error : undefined}
      onRetry={() => void songs.refetch()}
      onEndReached={() => songs.hasNextPage && !songs.isFetchingNextPage && void songs.fetchNextPage()}
      empty={{ title: 'No songs in this genre' }}
      extra={
        <Pressable onPress={() => void startRadio({ kind: 'genre', id: name, name })} accessibilityRole="button" accessibilityLabel={`Start ${name} radio`} hitSlop={10}>
          <Radio color={t.textSecondary} size={24} />
        </Pressable>
      }
    />
  );
}
