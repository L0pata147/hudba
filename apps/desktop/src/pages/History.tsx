import { History as HistoryIcon, Trash2 } from 'lucide-react';
import { historyStore, playerStore, useHistory } from '@sonora/core';
import { formatRelativeTime } from '@sonora/utils';
import { TrackList } from '../components/media/TrackList';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/States';
import { useUi } from '../lib/ui-store';

export function HistoryPage() {
  const entries = useHistory((s) => s.entries);
  const openDialog = useUi((s) => s.openDialog);
  const songs = entries.map((e) => e.song);
  return (
    <div className="pt-2">
      <div className="flex items-end justify-between gap-4 px-4 pt-4 pb-6 md:px-6 md:pt-2">
        <div>
          <h1 className="font-display text-[1.9rem] font-extrabold tracking-tight">Listening history</h1>
          <p className="mt-1 text-[14px] text-fg-2">Tracks played on this device. Navidrome keeps album-level history in “Recently played”.</p>
        </div>
        {entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="size-4" />}
            onClick={() =>
              openDialog({
                type: 'confirm',
                title: 'Clear history?',
                message: 'This removes the listening history stored on this device. Play counts on your server are not affected.',
                confirmLabel: 'Clear',
                danger: true,
                onConfirm: () => historyStore.getState().clear(),
              })
            }
          >
            Clear
          </Button>
        )}
      </div>
      {entries.length ? (
        <TrackList
          songs={songs}
          context={{ type: 'songs', name: 'History' }}
          dateColumn={{ label: 'Played', value: (_s, i) => formatRelativeTime(entries[i]?.playedAt) }}
          onPlay={(i) => playerStore.getState().playSongs(songs, i, { context: { type: 'songs', name: 'History' } })}
          label="Listening history"
        />
      ) : (
        <EmptyState icon={<HistoryIcon />} title="Nothing here yet" message="Songs you play will show up here." />
      )}
    </div>
  );
}
