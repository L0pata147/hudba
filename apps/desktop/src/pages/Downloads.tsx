import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, DownloadCloud, Loader2, Trash2 } from 'lucide-react';
import { downloadsStore, platform, playerStore, useDownloads } from '@sonora/core';
import { formatBytes, pluralize } from '@sonora/utils';
import { TrackList } from '../components/media/TrackList';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/States';
import { estimateStorage } from '../platform/offline';
import { useUi } from '../lib/ui-store';

export function DownloadsPage() {
  const records = useDownloads((s) => s.records);
  const openDialog = useUi((s) => s.openDialog);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const list = useMemo(() => Object.values(records).sort((a, b) => (b.downloadedAt ?? '').localeCompare(a.downloadedAt ?? '')), [records]);
  const done = list.filter((r) => r.status === 'done');
  const active = list.filter((r) => r.status === 'queued' || r.status === 'downloading');
  const failed = list.filter((r) => r.status === 'error');
  const bytes = done.reduce((t, r) => t + (r.bytes ?? 0), 0);

  useEffect(() => {
    void estimateStorage().then(setStorage);
  }, [done.length]);

  if (!platform().offline) {
    return <EmptyState icon={<DownloadCloud />} title="Downloads are not available" message="This browser does not support offline storage." />;
  }

  return (
    <div className="pt-2">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-4 pb-6 md:px-6 md:pt-2">
        <div>
          <h1 className="font-display text-[1.9rem] font-extrabold tracking-tight">Downloads</h1>
          <p className="mt-1 text-[14px] text-fg-2">
            {pluralize(done.length, 'song')} available offline · {formatBytes(bytes)}
            {storage && storage.quota > 0 && <> · {formatBytes(storage.quota - storage.usage)} free</>}
          </p>
        </div>
        {list.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="size-4" />}
            onClick={() =>
              openDialog({
                type: 'confirm',
                title: 'Remove all downloads?',
                message: 'Downloaded songs will need to be streamed again.',
                confirmLabel: 'Remove all',
                danger: true,
                onConfirm: () => void downloadsStore.getState().clearAll(),
              })
            }
          >
            Remove all
          </Button>
        )}
      </div>

      {active.length > 0 && (
        <div className="mx-4 mb-6 rounded-lg bg-surface p-4 md:mx-6" aria-live="polite">
          <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
            <Loader2 className="size-4 animate-spin text-accent" /> Downloading {pluralize(active.length, 'song')}
          </p>
          <ul className="flex flex-col gap-2">
            {active.slice(0, 5).map((r) => (
              <li key={r.songId} className="flex items-center gap-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{r.song.title}</span>
                <span className="h-1 w-32 overflow-hidden rounded-full bg-fg/15">
                  <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(r.progress * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {failed.length > 0 && (
        <div className="mx-4 mb-6 flex items-center gap-3 rounded-lg bg-danger/10 p-4 text-[14px] text-danger md:mx-6" role="alert">
          <AlertCircle className="size-5 shrink-0" />
          <span className="flex-1">{pluralize(failed.length, 'download')} failed.</span>
          <Button size="sm" variant="ghost" onClick={() => downloadsStore.getState().download(failed.map((f) => f.song))}>
            Retry
          </Button>
        </div>
      )}

      {done.length ? (
        <TrackList
          songs={done.map((r) => r.song)}
          context={{ type: 'songs', name: 'Downloads' }}
          onPlay={(i) => playerStore.getState().playSongs(done.map((r) => r.song), i, { context: { type: 'songs', name: 'Downloads' } })}
          label="Downloaded songs"
        />
      ) : (
        active.length === 0 && (
          <EmptyState
            icon={<DownloadCloud />}
            title="No downloads yet"
            message="Download albums, playlists or songs from their ⋯ menu to listen without a connection."
          />
        )
      )}
    </div>
  );
}
