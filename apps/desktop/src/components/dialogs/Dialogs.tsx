import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, ListMusic, Plus, Search } from 'lucide-react';
import type { Playlist, Song } from '@sonora/types';
import { usePlaylistMutations, usePlaylists, useSession } from '@sonora/core';
import { normalizeForSearch } from '@sonora/api';
import { pluralize } from '@sonora/utils';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { Artwork } from '../ui/Artwork';
import { Skeleton } from '../ui/Skeleton';
import { useUi } from '../../lib/ui-store';
import { EqualizerDialog } from '../player/Equalizer';

function AddToPlaylistDialog({ songs, onClose }: { songs: Song[]; onClose: () => void }) {
  const playlists = usePlaylists();
  const { addSongs } = usePlaylistMutations();
  const openDialog = useUi((s) => s.openDialog);
  const username = useSession((s) => s.session?.credentials.username);
  const [filter, setFilter] = useState('');
  const own = useMemo(
    () => (playlists.data ?? []).filter((p) => !p.owner || p.owner === username).filter((p) => normalizeForSearch(p.name).includes(normalizeForSearch(filter))),
    [playlists.data, username, filter],
  );
  const add = (p: Playlist) => {
    addSongs.mutate({ id: p.id, name: p.name, songs });
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Add to playlist" description={songs.length === 1 ? songs[0]?.title : pluralize(songs.length, 'song')}>
      <TextField size="md" icon={<Search />} placeholder="Find a playlist" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a playlist" data-autofocus />
      <div className="-mx-2 mt-3 max-h-[45vh] overflow-y-auto">
        <button
          type="button"
          onClick={() => openDialog({ type: 'create-playlist', songs })}
          className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-surface-hover"
        >
          <span className="flex size-11 items-center justify-center rounded-sm bg-surface-active">
            <Plus className="size-5" />
          </span>
          <span className="font-semibold">New playlist</span>
        </button>
        {playlists.isPending
          ? Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="size-11 rounded-sm" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))
          : own.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-surface-hover">
                <Artwork coverArtId={p.coverArtId} size="thumb" kind="playlist" rounded="sm" className="size-11 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-[13px] text-fg-2">{pluralize(p.songCount, 'song')}</span>
                </span>
              </button>
            ))}
        {!playlists.isPending && !own.length && filter && <p className="p-3 text-sm text-fg-2">No playlists match “{filter}”.</p>}
      </div>
    </Dialog>
  );
}

function PlaylistFormDialog({ playlist, songs, onClose }: { playlist?: Playlist; songs?: Song[]; onClose: () => void }) {
  const { create, rename } = usePlaylistMutations();
  const navigate = useNavigate();
  const [name, setName] = useState(playlist?.name ?? '');
  const [comment, setComment] = useState(playlist?.comment ?? '');
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || rename.isPending;
  useEffect(() => setError(null), [name]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your playlist a name.');
      return;
    }
    if (playlist) {
      rename.mutate({ id: playlist.id, name: trimmed, comment: comment.trim() }, { onSuccess: onClose });
    } else {
      create.mutate(
        { name: trimmed, songs },
        {
          onSuccess: (p) => {
            onClose();
            if (!songs?.length) navigate(`/playlist/${p.id}`);
          },
        },
      );
    }
  };

  return (
    <Dialog open onClose={onClose} title={playlist ? 'Edit details' : 'Create playlist'} description={songs?.length ? `With ${pluralize(songs.length, 'song')}` : undefined}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Name" icon={<ListMusic />} value={name} onChange={(e) => setName(e.target.value)} placeholder="My playlist" maxLength={120} error={error} data-autofocus />
        {playlist && <TextField label="Description" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add an optional description" maxLength={300} />}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending} icon={<Check className="size-4" />}>
            {playlist ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function Dialogs() {
  const dialog = useUi((s) => s.dialog);
  const close = useUi((s) => s.closeDialog);
  if (!dialog) return null;
  switch (dialog.type) {
    case 'add-to-playlist':
      return <AddToPlaylistDialog songs={dialog.songs} onClose={close} />;
    case 'create-playlist':
      return <PlaylistFormDialog songs={dialog.songs} onClose={close} />;
    case 'edit-playlist':
      return <PlaylistFormDialog playlist={dialog.playlist} onClose={close} />;
    case 'equalizer':
      return <EqualizerDialog onClose={close} />;
    case 'confirm':
      return (
        <Dialog
          open
          onClose={close}
          title={dialog.title}
          footer={
            <>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                variant={dialog.danger ? 'danger' : 'primary'}
                data-autofocus
                onClick={() => {
                  close();
                  dialog.onConfirm();
                }}
              >
                {dialog.confirmLabel}
              </Button>
            </>
          }
        >
          <p className="text-[15px] text-fg-2">{dialog.message}</p>
        </Dialog>
      );
    default:
      return null;
  }
}
