import { useLocalSearchParams } from 'expo-router';
import { CloudUpload, ListEnd, ListStart, RefreshCw } from 'lucide-react-native';
import { toast, useDailyMixes, usePlaylistMutations } from '@sonora/core';
import { formatLongDuration, pluralize } from '@sonora/utils';
import { SongListScreen } from '../../src/components/SongListScreen';
import { MixArt } from '../../src/components/Tiles';
import { queueSongs } from '../../src/actions';
import { useSheet } from '../../src/sheet-store';
import { useTheme } from '../../src/theme';

/** One of today's daily mixes. */
export default function MixScreen() {
  const t = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { mixes, loading, error, remake } = useDailyMixes();
  const index = mixes.findIndex((m) => m.id === id);
  const mix = mixes[index];
  const { create } = usePlaylistMutations();
  const open = useSheet((s) => s.open);
  const ic = t.textSecondary;
  const day = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' });
  return (
    <SongListScreen
      title={mix?.name ?? 'Daily mix'}
      subtitle={mix?.description}
      meta={mix ? `${pluralize(mix.songs.length, 'song')} · ${formatLongDuration(mix.songs.reduce((n, s) => n + s.duration, 0))} · a new mix tomorrow` : undefined}
      art={mix ? <MixArt name={mix.name} coverArtIds={mix.coverArtIds} index={index} size={230} /> : undefined}
      songs={mix?.songs ?? []}
      context={{ type: 'mix', id, name: mix?.name ?? 'Daily mix' }}
      loading={loading}
      error={error ?? undefined}
      empty={{ title: 'This mix isn’t in today’s mixes', message: 'Daily mixes change every day.' }}
      onMore={
        mix
          ? () =>
              open({
                title: mix.name,
                subtitle: mix.description,
                actions: [
                  { label: 'Play next', icon: <ListStart color={ic} size={22} />, onPress: () => queueSongs(mix.songs, 'next') },
                  { label: 'Add to queue', icon: <ListEnd color={ic} size={22} />, onPress: () => queueSongs(mix.songs, 'end') },
                  {
                    label: 'Save to server as a playlist',
                    icon: <CloudUpload color={ic} size={22} />,
                    // the mix changes tomorrow; a playlist keeps today's songs
                    onPress: () => create.mutate({ name: `${mix.name} ${day}`, songs: mix.songs }, { onSuccess: (p) => toast.success(`Saved “${p.name}”`) }),
                  },
                  { label: 'Make new mixes for today', icon: <RefreshCw color={ic} size={22} />, onPress: () => void remake().catch(() => toast.error('Couldn’t read your library. Try again.')) },
                ],
              })
          : undefined
      }
    />
  );
}
