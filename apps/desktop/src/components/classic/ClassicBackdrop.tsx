import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from '@sonora/core';
import { BeatDetector } from '../../lib/visualizer-math';
import {
  loadBackdrop,
  loadPictures,
  removePicture,
  saveBackdrop,
  savePicture,
  skinNameFromFile,
  type BackdropAnimation,
  type BackdropSettings,
  type SavedPicture,
} from '../../lib/classic-skins';

const ANIMATIONS: { id: BackdropAnimation; name: string }[] = [
  { id: 'groove', name: 'Groove' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'float', name: 'Float' },
  { id: 'none', name: 'Still' },
];

/**
 * A picture behind the Winamp windows that moves with the music Winamp plays:
 * it grooves (sways and bounces on beats), pulses with a glow, or floats.
 * A shine sweeps across it on beats. Pictures are kept in IndexedDB.
 */
export function ClassicBackdrop({ getAnalyser, controls }: { getAnalyser: () => AnalyserNode | null; controls: HTMLElement | null }) {
  const [pictures, setPictures] = useState<SavedPicture[]>([]);
  const [settings, setSettings] = useState<BackdropSettings>({ pictureId: null, animation: 'groove' });
  const [url, setUrl] = useState<string | null>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLImageElement>(null);
  const shineRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const animRef = useRef(settings.animation);
  animRef.current = settings.animation;

  useEffect(() => {
    void Promise.all([loadPictures(), loadBackdrop()]).then(([pics, s]) => {
      setPictures(pics);
      setSettings(pics.some((p) => p.id === s.pictureId) ? s : { ...s, pictureId: null });
    });
  }, []);

  const picture = pictures.find((p) => p.id === settings.pictureId) ?? null;
  useEffect(() => {
    if (!picture) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(picture.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [picture]);

  const update = (next: Partial<BackdropSettings>) => {
    const s = { ...settings, ...next };
    setSettings(s);
    void saveBackdrop(s);
  };

  const add = async (files: FileList) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return toast.error('Pick an image (PNG, JPG, GIF, WebP)');
    let last: SavedPicture | null = null;
    for (const f of list) last = await savePicture(f, skinNameFromFile(f.name.replace(/\.(png|jpe?g|gif|webp)$/i, '')));
    setPictures(await loadPictures());
    if (last) update({ pictureId: last.id });
  };

  /* ---------- animation, outside React ---------- */
  useEffect(() => {
    if (!url) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const beats = new BeatDetector();
    let freq = new Uint8Array(0);
    let raf = 0;
    let last = 0;
    let t = 0;
    let phase = 0;
    let bass = 0;
    let kick = 0;
    let shine = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      t += dt;
      const analyser = getAnalyser();
      let beat = false;
      if (analyser) {
        if (freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
        const binHz = analyser.context.sampleRate / analyser.fftSize;
        const a = Math.max(1, Math.floor(30 / binHz));
        const b = Math.max(a + 1, Math.ceil(160 / binHz));
        let sum = 0;
        for (let k = a; k < b; k++) sum += freq[k] ?? 0;
        const level = sum / ((b - a) * 255);
        bass += (level - bass) * (level > bass ? 0.5 : 0.08);
        beat = beats.update(freq, a, b, t);
      } else bass *= 0.95;
      if (beat) {
        kick = 1;
        shine = 1;
      }
      kick *= Math.pow(0.88, dt * 60);
      shine = Math.max(0, shine - dt * 1.6);
      if (shine === 0 && t % 7 < dt) shine = 1; // a slow shine now and then, even in quiet parts

      const anim = reduced ? 'none' : animRef.current;
      let tf = '';
      let glow = 0.15;
      if (anim === 'groove') {
        phase += dt * (1.6 + bass * 5);
        const sway = Math.sin(phase) * (2.5 + bass * 6);
        tf = `translateY(${-(bass * 26 + kick * 22)}px) rotate(${sway}deg) scale(${1 + kick * 0.04}, ${1 - kick * 0.05 + bass * 0.02})`;
        glow = 0.15 + bass * 0.5 + kick * 0.3;
      } else if (anim === 'pulse') {
        tf = `scale(${1 + bass * 0.07 + kick * 0.07})`;
        glow = 0.2 + bass * 0.9 + kick * 0.5;
      } else if (anim === 'float') {
        tf = `translateY(${Math.sin(t * 0.9) * 14}px) rotate(${Math.sin(t * 0.55) * 2}deg)`;
        glow = 0.25 + Math.sin(t * 0.9) * 0.08;
      }
      if (figureRef.current) figureRef.current.style.transform = tf;
      if (glowRef.current) glowRef.current.style.opacity = String(Math.min(0.9, glow));
      if (shineRef.current) {
        shineRef.current.style.opacity = shine > 0 && !reduced ? '1' : '0';
        shineRef.current.style.backgroundPosition = `${(1 - shine) * 160 - 30}% 0`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [url, getAnalyser]);

  const toolbar = (
    <>
      <label className="flex items-center gap-2">
        <span className="text-white/70">Picture</span>
        <select
          aria-label="Background picture"
          value={settings.pictureId ?? ''}
          onChange={(e) => update({ pictureId: e.target.value || null })}
          className="h-8 max-w-40 rounded-md bg-white/10 px-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <option value="" className="bg-[#101828]">None</option>
          {pictures.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#101828]">
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {picture && (
        <>
          <select
            aria-label="Picture animation"
            value={settings.animation}
            onChange={(e) => update({ animation: e.target.value as BackdropAnimation })}
            className="h-8 rounded-md bg-white/10 px-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {ANIMATIONS.map((a) => (
              <option key={a.id} value={a.id} className="bg-[#101828]">
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Remove this picture"
            title="Remove this picture"
            onClick={() =>
              void (async () => {
                await removePicture(picture.id);
                setPictures(await loadPictures());
                update({ pictureId: null });
              })()
            }
            className="rounded-md p-1.5 hover:bg-white/10"
          >
            <Trash2 className="size-4" />
          </button>
        </>
      )}
      <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">
        <ImagePlus className="size-4" /> Picture…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Background picture file"
        onChange={(e) => {
          if (e.target.files) void add(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );

  return (
    <>
      {controls && createPortal(toolbar, controls)}
      {url && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" data-testid="classic-backdrop" aria-hidden>
          <div ref={figureRef} className="absolute right-[3%] bottom-0 h-[88%] origin-bottom will-change-transform">
            <img ref={glowRef} src={url} alt="" className="absolute inset-0 h-full w-auto scale-105 opacity-20 blur-2xl brightness-150 saturate-150" />
            <img src={url} alt="" className="relative h-full w-auto drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]" />
            <div
              ref={shineRef}
              className="absolute inset-0 opacity-0"
              style={{
                background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.75) 50%, transparent 60%) 0 0 / 250% 100% no-repeat',
                mixBlendMode: 'overlay',
                WebkitMaskImage: `url(${url})`,
                maskImage: `url(${url})`,
                WebkitMaskSize: '100% 100%',
                maskSize: '100% 100%',
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
