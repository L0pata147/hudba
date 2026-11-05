import { useMemo } from 'react';
import { History as HistoryIcon, Trash2 } from 'lucide-react-native';
import { historyStore, recentSongs, useHistory } from '@sonora/core';
import { pluralize } from '@sonora/utils';
import { SongListScreen } from '../src/components/SongListScreen';
import { IconArt } from '../src/components/Tiles';
import { useSheet } from '../src/sheet-store';
import { useTheme } from '../src/theme';

/** Songs played on this phone, most recent first. */
export default function HistoryScreen() {
  const t = useTheme();
  const entries = useHistory((s) => s.entries);
  const songs = useMemo(() => recentSongs(entries, 300), [entries]);
  const open = useSheet((s) => s.open);
  return (
    <SongListScreen
      title="History"
      subtitle="Played on this phone"
      meta={pluralize(songs.length, 'song')}
      art={<IconArt name="History" color="#5C9BFF" Icon={HistoryIcon} size={230} />}
      songs={songs}
      context={{ type: 'songs', id: 'history', name: 'History' }}
      empty={{ title: 'Nothing played yet', message: 'Songs you play show up here.' }}
      onMore={
        songs.length
          ? () => open({ title: 'History', actions: [{ label: 'Clear history', danger: true, icon: <Trash2 color={t.danger} size={22} />, onPress: () => historyStore.getState().clear() }] })
          : undefined
      }
    />
  );
}
