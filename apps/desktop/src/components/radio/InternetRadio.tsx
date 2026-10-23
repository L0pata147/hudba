import { Download, ExternalLink, MoreHorizontal, Pencil, Plus, RadioTower, Trash2 } from 'lucide-react';
import type { InternetRadioStation } from '@sonora/types';
import { CZECH_STATIONS, playerStore, playStation, toast, usePlayer, useRadioStationMutations, useRadioStations, useSession } from '@sonora/core';
import { Button, IconButton } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { Equalizer } from '../ui/PlayButton';
import { openMenuFrom, useUi } from '../../lib/ui-store';
import { openExternal } from '../../lib/open-external';

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** A stable colour per station, from its name. */
const hue = (name: string) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export function StationTile({ name, className = '' }: { name: string; className?: string }) {
  const h = hue(name);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md text-white ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${h} 80% 62%), hsl(${(h + 50) % 360} 75% 45%))` }}
      aria-hidden
    >
      <RadioTower className="size-1/2" strokeWidth={1.8} />
    </span>
  );
}

function StationCard({ station, admin }: { station: InternetRadioStation; admin: boolean }) {
  const context = usePlayer((s) => s.context);
  const status = usePlayer((s) => s.status);
  const openDialog = useUi((s) => s.openDialog);
  const { remove } = useRadioStationMutations();
  const current = context?.type === 'internet-radio' && context.id === station.id;
  const playing = current && (status === 'playing' || status === 'buffering' || status === 'loading');
  const more = (e: React.MouseEvent) =>
    openMenuFrom(e, [
      ...(station.homePageUrl ? [{ id: 'web', label: 'Open website', icon: <ExternalLink />, onSelect: () => void openExternal(station.homePageUrl!) }] : []),
      ...(admin
        ? [
            { id: 'edit', label: 'Edit station', icon: <Pencil />, onSelect: () => openDialog({ type: 'radio-station', station }) },
            {
              id: 'delete',
              label: 'Delete station',
              icon: <Trash2 />,
              danger: true,
              onSelect: () =>
                openDialog({
                  type: 'confirm',
                  title: 'Delete station?',
                  message: `“${station.name}” will be removed from your server.`,
                  confirmLabel: 'Delete',
                  danger: true,
                  onConfirm: () => remove.mutate(station.id),
                }),
            },
          ]
        : []),
    ]);
  return (
    <div className={`group relative flex items-center gap-3 rounded-md p-2 transition-colors ${current ? 'bg-accent-soft' : 'bg-surface hover:bg-surface-hover'}`}>
      <button
        type="button"
        onClick={() => (current ? playerStore.getState().togglePlay() : playStation(station))}
        aria-label={playing ? `Pause ${station.name}` : `Play ${station.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <StationTile name={station.name} className="size-12" />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-2 text-[14px] font-semibold ${current ? 'text-accent' : ''}`}>
            {current && <Equalizer paused={!playing} />}
            <span className="truncate">{station.name}</span>
          </span>
          <span className="block truncate text-[12.5px] text-fg-2">{host(station.homePageUrl || station.streamUrl)}</span>
        </span>
      </button>
      {(admin || station.homePageUrl) && (
        <IconButton label={`More options for ${station.name}`} size="sm" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={more}>
          <MoreHorizontal className="size-4" />
        </IconButton>
      )}
    </div>
  );
}

/** Internet radio stations saved on the Navidrome server. */
export function InternetRadioSection() {
  const stations = useRadioStations();
  const admin = useSession((s) => s.session?.user.isAdmin ?? false);
  const openDialog = useUi((s) => s.openDialog);
  const { addMany } = useRadioStationMutations();
  const have = new Set((stations.data ?? []).map((s) => s.streamUrl));
  const missingCzech = CZECH_STATIONS.filter((s) => !have.has(s.streamUrl)).length;
  const addCzech = () =>
    addMany.mutate(
      { existing: stations.data ?? [], wanted: CZECH_STATIONS },
      { onSuccess: (n) => toast.success(`Added ${n} Czech station${n === 1 ? '' : 's'}`) },
    );
  return (
    <section aria-label="Internet radio">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[1.25rem] font-bold">Internet radio</h2>
          <p className="text-[13px] text-fg-2">Live stations saved on your server.</p>
        </div>
        {admin && (
          <div className="flex flex-wrap justify-end gap-2">
            {stations.isSuccess && missingCzech > 0 && (
              <Button size="sm" variant="ghost" icon={<Download className="size-4" />} disabled={addMany.isPending} onClick={addCzech}>
                {addMany.isPending ? 'Adding…' : `Add Czech radios (${missingCzech})`}
              </Button>
            )}
            <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => openDialog({ type: 'radio-station' })}>
              Add station
            </Button>
          </div>
        )}
      </div>
      {stations.isPending ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : stations.isError ? (
        <p className="text-[14px] text-fg-2">Couldn’t load the stations from your server.</p>
      ) : stations.data?.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {stations.data.map((s) => (
            <StationCard key={s.id} station={s} admin={admin} />
          ))}
        </div>
      ) : (
        <p className="rounded-md bg-surface p-4 text-[14px] text-fg-2">
          {admin
            ? 'No stations yet. Add one with its stream address (it usually ends in .mp3, .aac or /stream).'
            : 'Your server has no radio stations yet. An admin can add them here or in Navidrome.'}
        </p>
      )}
    </section>
  );
}
