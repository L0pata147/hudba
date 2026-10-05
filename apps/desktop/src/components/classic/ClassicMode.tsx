import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, FolderOpen, Trash2, X } from 'lucide-react';
import type Webamp from 'webamp';
import { getNavidrome, playerStore, preferencesStore, toast } from '@sonora/core';
import { artworkUrl } from '../../lib/artwork';
import {
  currentSkinId,
  loadSavedSkins,
  removeSkin,
  saveSkin,
  setCurrentSkinId,
  skinNameFromFile,
  useClassicMode,
  type SavedSkin,
} from '../../lib/classic-skins';
import { openExternal } from '../../lib/open-external';

const MUSEUM = 'https://skins.webamp.org/';

/** Continue in Sonora at the track and time classic mode stopped at. */
function handBack(uid: string, otherTrack: boolean, time: number, playing: boolean) {
  const player = playerStore.getState();
  if (!otherTrack && !playing) {
    // Same track, paused: just move the position.
    if (time > 1) player.seek(time);
    return;
  }
  player.playItem(uid);
  // Seek once the track has actually started (a seek during loading would be lost).
  const unsub = playerStore.subscribe((s) => {
    if (s.status !== 'playing') return;
    unsub();
    clearTimeout(timer);
    if (time > 1) s.seek(time);
    if (!playing) s.pause();
  });
  const timer = setTimeout(unsub, 8000);
}

/** Webamp's redux state, as far as we read it to hand playback back to Sonora. */
interface WebampState {
  playlist: { currentTrack: number | null; trackOrder: number[] };
  media: { timeElapsed: number };
}

/**
 * Classic mode: the queue plays in a faithful Winamp 2.x (Webamp) with its
 * main window, equalizer and playlist, and real .wsz skins. Opening it hands
 * the current queue, track and position over from Sonora; closing hands them
 * back. Loaded skins are kept in IndexedDB.
 */
export default function ClassicMode() {
  const setOpen = useClassicMode((s) => s.setOpen);
  const hostRef = useRef<HTMLDivElement>(null);
  const webampRef = useRef<Webamp | null>(null);
  const urls = useRef<string[]>([]);
  const [skins, setSkins] = useState<SavedSkin[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const blobUrl = (b: Blob) => {
    const u = URL.createObjectURL(b);
    urls.current.push(u);
    return u;
  };

  /** Hand playback back to Sonora and leave. */
  const exit = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    let disposed = false;
    let webamp: Webamp | null = null;
    const st = playerStore.getState();
    const items = st.queue.items;
    const startIndex = Math.max(0, st.queue.index);
    const startAt = st.position;
    const wasPlaying = st.status === 'playing' || st.status === 'buffering' || st.status === 'loading';
    playerStore.getState().pause();

    void (async () => {
      const [{ default: WebampCtor }, saved, savedId] = await Promise.all([import('webamp'), loadSavedSkins(), currentSkinId()]);
      if (disposed || !hostRef.current) return;
      setSkins(saved);
      setCurrent(savedId);
      const quality = preferencesStore.getState().streamQuality;
      const chosen = saved.find((s) => s.id === savedId);
      webamp = new WebampCtor({
        initialTracks: items.map(({ song }) => ({
          url: getNavidrome().media.streamUrl(song.id, { quality }),
          duration: song.duration,
          metaData: { artist: song.artist, title: song.title, album: song.album, albumArtUrl: artworkUrl(song.coverArtId, 'card') },
        })),
        initialSkin: chosen ? { url: blobUrl(chosen.blob) } : undefined,
        availableSkins: saved.map((s) => ({ url: blobUrl(s.blob), name: s.name })),
        enableHotkeys: true,
        // Big screens: start in double size, with the playlist widened to match and placed beside it.
        enableDoubleSizeMode: true,
        windowLayout: {
          main: { position: { top: 0, left: 0 } },
          equalizer: { position: { top: 232, left: 0 } },
          playlist: { position: { top: 0, left: 550 }, size: { extraHeight: 12, extraWidth: 4 } },
        },
        zIndex: 120,
      });
      webampRef.current = webamp;
      webamp.onClose(exit);
      await webamp.renderWhenReady(hostRef.current);
      if (disposed || !items.length) return;
      webamp.setCurrentTrack(startIndex);
      if (startAt > 1 || wasPlaying) {
        // Start the track, jump to where Sonora was, then pause again if Sonora was paused.
        webamp.play();
        const until = Date.now() + 8000;
        while (!disposed && webamp.getMediaStatus() !== 'PLAYING' && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
        if (disposed) return;
        if (startAt > 1) webamp.seekToTime(startAt);
        if (!wasPlaying) webamp.pause();
      }
    })().catch((e: unknown) => {
      toast.error(`Classic mode failed to start: ${e instanceof Error ? e.message : String(e)}`);
      exit();
    });

    return () => {
      disposed = true;
      const w = webampRef.current;
      webampRef.current = null;
      if (w) {
        // Hand the track and position back to Sonora.
        const state = (w as unknown as { store: { getState(): WebampState } }).store.getState();
        const order = state.playlist.trackOrder;
        const index = state.playlist.currentTrack == null ? -1 : order.indexOf(state.playlist.currentTrack);
        const playing = w.getMediaStatus() === 'PLAYING';
        const time = state.media.timeElapsed ?? 0;
        w.dispose();
        const queue = playerStore.getState().queue;
        const item = index >= 0 ? queue.items[index] : undefined;
        if (item) handBack(item.uid, index !== queue.index, time, playing);
      }
      for (const u of urls.current) URL.revokeObjectURL(u);
      urls.current = [];
    };
  }, [exit]);

  // Esc leaves classic mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && exit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit]);

  const applySkin = async (skin: SavedSkin | null) => {
    const w = webampRef.current;
    setCurrent(skin?.id ?? null);
    await setCurrentSkinId(skin?.id ?? null);
    // Webamp has no "default skin" URL, so going back to it needs a restart of the view.
    if (!skin) toast.info('The default skin comes back the next time classic mode opens.');
    else w?.setSkinFromUrl(blobUrl(skin.blob));
  };

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => /\.(wsz|zip)$/i.test(f.name));
    if (!list.length) {
      toast.error('Drop a Winamp skin (.wsz)');
      return;
    }
    let last: SavedSkin | null = null;
    for (const f of list) last = await saveSkin(f, skinNameFromFile(f.name));
    setSkins(await loadSavedSkins());
    if (last) await applySkin(last);
    toast.success(list.length > 1 ? `${list.length} skins added` : `Skin “${last?.name}” added`);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-[radial-gradient(ellipse_at_center,#2a3a6a_0%,#101828_70%)]"
      data-testid="classic-mode"
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void addFiles(e.dataTransfer.files);
      }}
    >
      <div className="relative z-[130] flex flex-wrap items-center gap-2 bg-black/40 px-4 py-2 text-[13px] text-white backdrop-blur-md">
        <span className="font-display font-bold tracking-wide">Classic mode</span>
        <span className="text-white/50">Winamp 2.x · drag windows by their title bars · Ctrl+D double size</span>
        <div className="flex-1" />
        <label className="flex items-center gap-2">
          <span className="text-white/70">Skin</span>
          <select
            aria-label="Classic skin"
            value={current ?? ''}
            onChange={(e) => void applySkin(skins.find((s) => s.id === e.target.value) ?? null)}
            className="h-8 rounded-md bg-white/10 px-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <option value="" className="bg-[#101828]">Base skin</option>
            {skins.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#101828]">
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {current && (
          <button
            type="button"
            aria-label="Remove this skin"
            title="Remove this skin"
            onClick={() =>
              void (async () => {
                await removeSkin(current);
                setSkins(await loadSavedSkins());
                await applySkin(null);
              })()
            }
            className="rounded-md p-1.5 hover:bg-white/10"
          >
            <Trash2 className="size-4" />
          </button>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">
          <FolderOpen className="size-4" /> Load .wsz…
        </button>
        <button type="button" onClick={() => void openExternal(MUSEUM)} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold hover:bg-white/10">
          Get skins <ExternalLink className="size-3.5" />
        </button>
        <button type="button" onClick={exit} className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 font-semibold text-black hover:bg-white/85">
          <X className="size-4" /> Back to Sonora
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".wsz,.zip"
          multiple
          hidden
          aria-label="Winamp skin file"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <div ref={hostRef} className="relative flex-1" />
      {dragging && (
        <div className="pointer-events-none absolute inset-4 z-[140] flex items-center justify-center rounded-2xl border-4 border-dashed border-white/60 bg-black/40 text-xl font-bold text-white">
          Drop a .wsz skin to add it
        </div>
      )}
    </div>
  );
}
