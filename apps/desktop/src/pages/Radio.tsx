import { useMemo } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Compass, Crosshair, Hand, Loader2, Power, Radio as RadioIcon, RefreshCw, Sparkles, Target } from 'lucide-react';
import type { QueueItem } from '@sonora/types';
import {
  currentItem,
  playerStore,
  radioStore,
  recentSongs,
  useCurrentItem,
  useGenres,
  useHistory,
  usePlayerShallow,
  useRadio,
  useStarred,
  type RadioVariety,
} from '@sonora/core';
import { formatDuration } from '@sonora/utils';
import { rgbToCss } from '@sonora/ui';
import { Artwork } from '../components/ui/Artwork';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/States';
import { Equalizer, PlayButton } from '../components/ui/PlayButton';
import { useDominantColor } from '../hooks/useDominantColor';
import { startRadio, useItemMenus } from '../lib/actions';

const VARIETY: { value: RadioVariety; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: 'close', label: 'Familiar', icon: <Target />, hint: 'Stays very close to the seed.' },
  { value: 'balanced', label: 'Balanced', icon: <Crosshair />, hint: 'Similar music with the occasional surprise.' },
  { value: 'explore', label: 'Adventurous', icon: <Compass />, hint: 'Wanders further through your library.' },
];

const SEED_LABEL = { song: 'Song', album: 'Album', artist: 'Artist', playlist: 'Playlist', genre: 'Genre' } as const;

function UpNextRow({ item, index }: { item: QueueItem; index: number }) {
  const { openSongMenu } = useItemMenus();
  const { song } = item;
  return (
    <li
      className="group flex items-center gap-3 rounded-md p-2 hover:bg-surface-hover"
      onContextMenu={(e) => openSongMenu(e, song, { queueUid: item.uid })}
    >
      <span className="w-6 text-right text-[13px] text-fg-3 tabular-nums">{index + 1}</span>
      <button type="button" onClick={() => playerStore.getState().playItem(item.uid)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Play ${song.title}`}>
        <Artwork coverArtId={song.coverArtId} size="thumb" kind="song" rounded="sm" className="size-11 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{song.title}</span>
          <span className="block truncate text-[13px] text-fg-2">
            {song.artist}
            {song.genre ? ` · ${song.genre}` : ''}
          </span>
        </span>
      </button>
      {item.manual ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-active px-2 py-0.5 text-[11px] font-semibold text-fg-2" title="You added this song">
          <Hand className="size-3" /> Added by you
        </span>
      ) : (
        <Sparkles className="size-3.5 shrink-0 text-accent opacity-70" aria-label="Chosen by Radio" />
      )}
      <span className="w-11 text-right text-[13px] text-fg-3 tabular-nums">{formatDuration(song.duration)}</span>
    </li>
  );
}

function StartRadio() {
  const cur = useCurrentItem();
  const history = useHistory((s) => s.entries);
  const recent = useMemo(() => recentSongs(history, 8), [history]);
  const genres = useGenres();
  const starred = useStarred();
  return (
    <div className="flex flex-col gap-8 px-4 md:px-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-accent/30 via-surface to-surface p-6 md:p-8">
        <RadioIcon className="absolute -top-6 -right-6 size-40 text-accent/10" aria-hidden />
        <h1 className="font-display text-[2.2rem] font-extrabold tracking-tight">Radio</h1>
        <p className="mt-2 max-w-xl text-[15px] text-fg-2">
          Pick a song, album, artist, playlist or genre and Sonora keeps playing similar music from your library — endlessly, without repeats. You can
          also start Radio from any ⋯ menu.
        </p>
        {cur && (
          <Button
            variant="primary"
            className="mt-5"
            icon={<RadioIcon className="size-4" />}
            onClick={() =>
              void startRadio({ kind: 'song', id: cur.song.id, name: cur.song.title, subtitle: cur.song.artist, coverArtId: cur.song.coverArtId }, cur.song)
            }
          >
            Start from “{cur.song.title}”
          </Button>
        )}
      </div>

      {recent.length > 0 && (
        <section aria-label="From recently played">
          <h2 className="mb-3 font-display text-[1.25rem] font-bold">From recently played</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {recent.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void startRadio({ kind: 'song', id: s.id, name: s.title, subtitle: s.artist, coverArtId: s.coverArtId }, s)}
                className="flex items-center gap-3 rounded-md bg-surface p-2 text-left transition-colors hover:bg-surface-hover"
              >
                <Artwork coverArtId={s.coverArtId} size="thumb" kind="song" rounded="sm" className="size-12 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{s.title}</span>
                  <span className="block truncate text-[12.5px] text-fg-2">{s.artist}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {starred.data && starred.data.artists.length > 0 && (
        <section aria-label="From favorite artists">
          <h2 className="mb-3 font-display text-[1.25rem] font-bold">From your favorite artists</h2>
          <div className="flex flex-wrap gap-2">
            {starred.data.artists.slice(0, 16).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void startRadio({ kind: 'artist', id: a.id, name: a.name, coverArtId: a.coverArtId })}
                className="flex items-center gap-2 rounded-full bg-surface-hover py-1 pr-4 pl-1 text-[14px] font-semibold hover:bg-surface-active"
              >
                <Artwork coverArtId={a.coverArtId} size="thumb" kind="artist" rounded="full" className="size-8" />
                {a.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {genres.data && genres.data.length > 0 && (
        <section aria-label="Genre radio">
          <h2 className="mb-3 font-display text-[1.25rem] font-bold">Genre radio</h2>
          <div className="flex flex-wrap gap-2">
            {genres.data.slice(0, 24).map((g) => (
              <button
                key={g.name}
                type="button"
                onClick={() => void startRadio({ kind: 'genre', id: g.name, name: g.name })}
                className="rounded-full bg-surface-hover px-4 py-2 text-[14px] font-semibold hover:bg-surface-active"
              >
                {g.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function RadioPage() {
  const session = useRadio((s) => s.session);
  const status = useRadio((s) => s.status);
  const { queue, context, playing } = usePlayerShallow((s) => ({
    queue: s.queue,
    context: s.context,
    playing: s.status === 'playing' || s.status === 'buffering' || s.status === 'loading',
  }));
  const active = Boolean(session && context?.type === 'radio' && context.id === session.id);
  const now = currentItem(queue);
  const color = useDominantColor(now?.song.coverArtId ?? session?.seed.coverArtId);
  const upNext = queue.items.slice(queue.index + 1);

  if (!session || !active) {
    return (
      <div className="pt-4 md:pt-2">
        <StartRadio />
      </div>
    );
  }

  const r = radioStore.getState();
  return (
    <div>
      <div className="relative -mt-16 px-4 pt-20 pb-6 max-md:mt-0 max-md:pt-6 md:px-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] transition-[background] duration-700"
          style={{ background: `linear-gradient(180deg, ${rgbToCss(color)} 0%, ${rgbToCss(color, 0.35)} 60%, transparent 100%)` }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end">
          <div className="relative shrink-0 self-center md:self-auto">
            <Artwork coverArtId={session.seed.coverArtId} kind={session.seed.kind === 'artist' ? 'artist' : 'album'} size="hero" rounded={session.seed.kind === 'artist' ? 'full' : 'lg'} className="size-[200px] shadow-pop" />
            <span className="absolute -right-2 -bottom-2 flex size-12 items-center justify-center rounded-full bg-accent text-on-accent shadow-pop">
              <RadioIcon className="size-6" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-fg/80">Radio · based on {SEED_LABEL[session.seed.kind].toLowerCase()}</p>
            <h1 className="font-display text-[2.4rem] leading-tight font-extrabold tracking-tight md:text-[3.4rem]">{session.seed.name}</h1>
            {session.seed.subtitle && <p className="text-[15px] text-fg/80">{session.seed.subtitle}</p>}
            <p className="mt-2 flex items-center gap-2 text-[13px] text-fg/70" aria-live="polite">
              {status === 'loading' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Finding similar music…
                </>
              ) : status === 'error' ? (
                <span className="flex items-center gap-1.5 text-warning">
                  <AlertTriangle className="size-3.5" /> Can’t reach the server — retrying. Playback continues.
                </span>
              ) : status === 'exhausted' ? (
                'Your library has no more new songs for this radio.'
              ) : (
                `${session.seen.length} songs picked so far`
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-4 pb-6 md:px-6">
        <PlayButton size="lg" playing={playing} onClick={() => playerStore.getState().togglePlay()} />
        <Button variant="secondary" icon={<Target className="size-4" />} onClick={() => r.steerFromCurrent()} title="Re-centre the radio on the song playing now">
          Steer from this song
        </Button>
        <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => r.refresh()}>
          New picks
        </Button>
        <Button variant="danger" icon={<Power className="size-4" />} onClick={() => r.stop()}>
          Stop radio
        </Button>
      </div>

      <div className="grid gap-6 px-4 md:px-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Up next on radio" className="min-w-0">
          <h2 className="mb-2 font-display text-[1.25rem] font-bold">Up next</h2>
          {now && (
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-accent-soft/60 p-3">
              <Artwork coverArtId={now.song.coverArtId} size="thumb" kind="song" rounded="sm" className="size-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider text-accent uppercase">
                  <Equalizer paused={!playing} /> Now playing
                </p>
                <p className="truncate text-[16px] font-semibold">{now.song.title}</p>
                <p className="truncate text-[13px] text-fg-2">
                  {now.song.artistId ? (
                    <Link to={`/artist/${now.song.artistId}`} className="hover:underline">
                      {now.song.artist}
                    </Link>
                  ) : (
                    now.song.artist
                  )}
                </p>
              </div>
            </div>
          )}
          {upNext.length ? (
            <ol>
              {upNext.slice(0, 50).map((item, i) => (
                <UpNextRow key={item.uid} item={item} index={i} />
              ))}
            </ol>
          ) : (
            <EmptyState title="Picking the next songs…" />
          )}
        </section>

        <aside aria-label="Radio direction" className="flex flex-col gap-3 self-start rounded-lg bg-surface p-5">
          <h2 className="font-display text-[1.1rem] font-bold">Direction</h2>
          <div role="radiogroup" aria-label="Radio variety" className="flex flex-col gap-1.5">
            {VARIETY.map((v) => {
              const on = session.variety === v.value;
              return (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => r.setVariety(v.value)}
                  className={`flex items-start gap-3 rounded-md p-3 text-left transition-colors [&>svg]:mt-0.5 [&>svg]:size-[18px] [&>svg]:shrink-0 ${
                    on ? 'bg-accent-soft text-fg ring-1 ring-accent/60' : 'text-fg-2 hover:bg-surface-hover hover:text-fg'
                  }`}
                >
                  {v.icon}
                  <span>
                    <span className="block text-[14px] font-semibold">{v.label}</span>
                    <span className="block text-[12.5px] text-fg-2">{v.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-line pt-3 text-[12.5px] leading-relaxed text-fg-3">
            Radio learns as you listen: songs you finish pull it in their direction, quick skips steer it away from that artist. Songs you add
            yourself stay where you put them.
          </div>
        </aside>
      </div>
    </div>
  );
}

