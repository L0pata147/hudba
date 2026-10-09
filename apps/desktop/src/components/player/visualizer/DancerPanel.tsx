import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ImagePlus, Trash2 } from 'lucide-react';
import { preferencesStore, toast, usePreferences } from '@sonora/core';
import { DANCES, SCENES, useCharacters, type DancerScene, type DanceStyle } from '../../../lib/characters';

const selectCls = 'h-8 max-w-40 rounded-md bg-white/10 px-2 text-[13px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60';

/**
 * Controls of the Dancer style: the character library (add / pick / remove),
 * the dance and the intensity. Pictures can also be dropped on the visualizer.
 */
export function DancerPanel({ hidden }: { hidden: boolean }) {
  const { loaded, list, currentId, dance, scene, load, add, remove, select, setDance, setScene } = useCharacters();
  const intensity = usePreferences((s) => s.visualizerIntensity);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const addFiles = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      const n = await add(files);
      if (!n) toast.error('Pick a picture (PNG, JPG or WebP)');
      else toast.success(n > 1 ? `${n} characters added` : 'Character added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const picker = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      multiple
      hidden
      aria-label="Character picture"
      onChange={(e) => {
        if (e.target.files?.length) void addFiles(e.target.files);
        e.target.value = '';
      }}
    />
  );

  return (
    <>
      {/* Drop zone over the whole visualizer */}
      <div
        className="absolute inset-0"
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
      />
      {dragging && (
        <div className="pointer-events-none absolute inset-6 flex items-center justify-center rounded-2xl border-4 border-dashed border-white/60 bg-black/40 text-lg font-bold text-white">
          Drop a picture to add a dancer
        </div>
      )}

      {loaded && !list.length && (
        <div onDoubleClick={(e) => e.stopPropagation()} className="absolute top-1/2 left-1/2 flex w-80 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-2xl bg-black/55 p-6 text-center text-white backdrop-blur-md">
          <p className="font-display text-lg font-bold">Add a character</p>
          <p className="text-[13px] text-white/70">It dances to the beat of the music. A PNG with a transparent background works best; a plain-coloured background is removed automatically.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-black hover:bg-white/85 disabled:opacity-60"
          >
            <ImagePlus className="size-4" /> {busy ? 'Preparing…' : 'Choose a picture'}
          </button>
          {picker}
        </div>
      )}

      {list.length > 0 && (
        <div
          data-testid="dancer-panel"
          onDoubleClick={(e) => e.stopPropagation()}
          className={clsx(
            'absolute right-3 bottom-3 flex flex-wrap items-center justify-end gap-2 rounded-xl bg-black/50 p-2 text-white backdrop-blur-md transition-opacity duration-300',
            hidden && 'pointer-events-none opacity-0',
          )}
        >
          <select aria-label="Character" value={currentId ?? ''} onChange={(e) => void select(e.target.value || null)} className={selectCls}>
            {list.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#101018]">
                {c.name}
              </option>
            ))}
          </select>
          <select aria-label="Scene" value={scene} onChange={(e) => void setScene(e.target.value as DancerScene)} className={selectCls}>
            {SCENES.map((x) => (
              <option key={x.id} value={x.id} className="bg-[#101018]">
                {x.name}
              </option>
            ))}
          </select>
          <select aria-label="Dance" value={dance} onChange={(e) => void setDance(e.target.value as DanceStyle)} className={selectCls}>
            {DANCES.map((d) => (
              <option key={d.id} value={d.id} className="bg-[#101018]">
                {d.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-white/70">
            Intensity
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(intensity * 100)}
              aria-label="Visualizer intensity"
              onChange={(e) => preferencesStore.getState().set('visualizerIntensity', Number(e.target.value) / 100)}
              className="w-24 accent-white"
            />
          </label>
          <button type="button" aria-label="Add character" title="Add character" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-md p-1.5 hover:bg-white/10">
            <ImagePlus className="size-4" />
          </button>
          {currentId && (
            <button type="button" aria-label="Remove character" title="Remove character" onClick={() => void remove(currentId)} className="rounded-md p-1.5 hover:bg-white/10">
              <Trash2 className="size-4" />
            </button>
          )}
          {picker}
        </div>
      )}
    </>
  );
}
