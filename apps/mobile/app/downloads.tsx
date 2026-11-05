import { useMemo } from 'react';
import { DownloadCloud, Trash2 } from 'lucide-react-native';
import { downloadsStore, useDownloads } from '@sonora/core';
import { formatBytes, pluralize } from '@sonora/utils';
import { SongListScreen } from '../src/components/SongListScreen';
import { IconArt } from '../src/components/Tiles';
import { useSheet } from '../src/sheet-store';
import { useTheme } from '../src/theme';

/** Songs downloaded to this phone: they play without a connection. */
export default function DownloadsScreen() {
  const t = useTheme();
  const records = useDownloads((s) => s.records);
  const done = useMemo(
    () => Object.values(records).filter((r) => r.status === 'done').sort((a, b) => (b.downloadedAt ?? '').localeCompare(a.downloadedAt ?? '')),
    [records],
  );
  const pending = Object.values(records).filter((r) => r.status === 'queued' || r.status === 'downloading').length;
  const bytes = done.reduce((n, r) => n + (r.bytes ?? 0), 0);
  const open = useSheet((s) => s.open);
  return (
    <SongListScreen
      title="Downloaded"
      subtitle="Plays without a connection"
      meta={[pluralize(done.length, 'song'), bytes ? formatBytes(bytes) : '', pending ? `${pending} downloading` : ''].filter(Boolean).join(' · ')}
      art={<IconArt name="Downloaded" color="#27856A" Icon={DownloadCloud} size={230} />}
      songs={done.map((r) => r.song)}
      context={{ type: 'songs', id: 'downloads', name: 'Downloaded' }}
      empty={{ title: 'No downloads yet', message: 'Download a song, album or playlist from its ⋮ menu.' }}
      onMore={
        done.length
          ? () =>
              open({
                title: 'Downloaded',
                actions: [{ label: 'Remove all downloads', danger: true, icon: <Trash2 color={t.danger} size={22} />, onPress: () => done.forEach((r) => void downloadsStore.getState().remove(r.songId)) }],
              })
          : undefined
      }
    />
  );
}
