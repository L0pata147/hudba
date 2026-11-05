import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CloudUpload, Dices, RefreshCw, Sparkles, Trash2 } from 'lucide-react-native';
import { describeSmartRules, evaluateSmartPlaylist, smartPlaylistsStore, toast, useLibrarySongs, usePlaylistMutations, useSmartPlaylists } from '@sonora/core';
import { formatLongDuration, pluralize } from '@sonora/utils';
import { SongListScreen } from '../../src/components/SongListScreen';
import { IconArt } from '../../src/components/Tiles';
import { useSheet } from '../../src/sheet-store';
import { useTheme } from '../../src/theme';

/** A seeded random so a "random" smart playlist keeps its order until you pick again. */
function seededRandom(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A smart playlist saved on this phone: its rules pick songs from the whole library. */
export default function SmartScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const smart = useSmartPlaylists((s) => s.playlists.find((p) => p.id === id));
  const library = useLibrarySongs();
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const songs = useMemo(() => (smart && library.data ? evaluateSmartPlaylist(library.data, smart.rules, Date.now(), seededRandom(seed)) : []), [smart, library.data, seed]);
  const { create } = usePlaylistMutations();
  const open = useSheet((s) => s.open);
  const ic = t.textSecondary;
  return (
    <SongListScreen
      title={smart?.name ?? 'Smart playlist'}
      subtitle={smart ? describeSmartRules(smart.rules) : undefined}
      meta={`${pluralize(songs.length, 'song')} · ${formatLongDuration(songs.reduce((n, s) => n + s.duration, 0))} · updates by itself`}
      art={<IconArt name={smart?.name} color="#8B6BFF" Icon={Sparkles} size={230} />}
      songs={songs}
      context={{ type: 'smart', id, name: smart?.name ?? 'Smart playlist' }}
      loading={library.isPending}
      error={library.isError ? library.error : undefined}
      onRetry={() => void library.refetch()}
      empty={{ title: smart ? 'No songs match these rules' : 'This smart playlist no longer exists' }}
      onMore={
        smart
          ? () =>
              open({
                title: smart.name,
                actions: [
                  ...(smart.rules.sort === 'random' ? [{ label: 'Pick again', icon: <Dices color={ic} size={22} />, onPress: () => setSeed((s) => s + 1) }] : []),
                  { label: 'Re-read the library', icon: <RefreshCw color={ic} size={22} />, onPress: () => void library.refetch() },
                  {
                    label: 'Save to server as a playlist',
                    icon: <CloudUpload color={ic} size={22} />,
                    onPress: () => create.mutate({ name: smart.name, songs }, { onSuccess: (p) => toast.success(`Saved “${p.name}”`) }),
                  },
                  {
                    label: 'Delete smart playlist',
                    danger: true,
                    icon: <Trash2 color={t.danger} size={22} />,
                    onPress: () => {
                      smartPlaylistsStore.getState().remove(smart.id);
                      router.back();
                    },
                  },
                ],
              })
          : undefined
      }
    />
  );
}
