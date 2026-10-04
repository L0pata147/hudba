import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AudioLines, Maximize, Minimize, SkipBack, SkipForward } from 'lucide-react';
import type { Song } from '@sonora/types';
import { getAudioEngine, playerStore, usePlayer } from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';
import { artworkUrl } from '../../lib/artwork';
import { BeatDetector, bandLevels, bassLevel, logBands, smoothInto } from '../../lib/visualizer-math';
import { usePalette } from '../../hooks/usePalette';
import { isTauri } from '../../platform';
import type { HtmlAudioEngine } from '../../platform/audio-engine';
import { PauseGlyph, PlayGlyph } from '../ui/PlayButton';

const BANDS = 72; // per half circle; mirrored → 144 points
const LAYERS = 6;
const HIDE_CONTROLS_MS = 2500;

/** Lows at the top and bottom, highs on the sides → the ring moves all the way round. */
const bandAt = (i: number, total: number) => {
  const half = i < total / 2 ? i : total - 1 - i; // mirror left/right
  const p = half / (total / 2 - 1); // 0 top … 1 bottom
  return Math.round((1 - Math.abs(Math.cos(Math.PI * p))) * (BANDS - 1));
};

function getAnalyser(): AnalyserNode | null {
  const engine = getAudioEngine() as HtmlAudioEngine | null;
  return engine?.getVisualizerAnalyser?.() ?? null;
}

interface Particle {
  a: number;
  r: number;
  v: number;
  size: number;
  hue: 0 | 1;
}

const lighten = (c: RGB, d = 70): RGB => ({ r: Math.min(255, c.r + d), g: Math.min(255, c.g + d), b: Math.min(255, c.b + d) });

async function setNativeFullscreen(on: boolean, el: HTMLElement | null) {
  try {
    if (isTauri) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(on);
    } else if (on) {
      await el?.requestFullscreen?.();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // Fullscreen refused (e.g. no user gesture): the in-app immersive view still works.
  }
}

/**
 * Circular spectrum visualizer in the style of electronic-music channels:
 * a mirrored, glowing multi-layer ring with trails around the cover, beat
 * zoom/shake/flash, drifting particles and a slowly moving artwork backdrop.
 */
export function Visualizer({ song }: { song: Song }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const palette = usePalette(song.coverArtId);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const [unavailable, setUnavailable] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toggleImmersive = useCallback((on?: boolean) => {
    setImmersive((cur) => {
      const next = on ?? !cur;
      void setNativeFullscreen(next, rootRef.current);
      return next;
    });
  }, []);

  /* ---------- immersive mode: keys, native fullscreen sync, auto-hiding controls ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleImmersive();
      } else if (e.key === 'Escape' && immersive) {
        // Leave fullscreen first instead of closing the whole player.
        e.stopImmediatePropagation();
        toggleImmersive(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [immersive, toggleImmersive]);

  useEffect(() => {
    if (isTauri) return;
    const onChange = () => !document.fullscreenElement && setImmersive(false);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Leaving the player while immersive must also leave native fullscreen.
  useEffect(() => () => void setNativeFullscreen(false, null), []);

  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), HIDE_CONTROLS_MS);
  }, []);
  useEffect(() => {
    if (immersive) poke();
    else {
      clearTimeout(hideTimer.current);
      setControls(true);
    }
    return () => clearTimeout(hideTimer.current);
  }, [immersive, poke]);

  /* ---------- render loop ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const buffer = document.createElement('canvas');
    const bctx = buffer.getContext('2d');
    if (!bctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const conic = typeof ctx.createConicGradient === 'function';
    let raf = 0;
    let bands: [number, number][] = [];
    let freq = new Uint8Array(0);
    let lowBins: [number, number] = [1, 8];
    const levels = new Float32Array(BANDS);
    const smooth = new Float32Array(BANDS);
    const beats = new BeatDetector();
    let bass = 0;
    let kick = 0;
    let t = 0;
    let particles: Particle[] = [];

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      // Cap the canvas at ~2.3 MP so fullscreen on big/HiDPI screens stays smooth.
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2_300_000 / Math.max(1, width * height)));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      // Trails are kept at half resolution: 4× cheaper and naturally soft.
      buffer.width = Math.max(1, Math.round(canvas.width / 2));
      buffer.height = Math.max(1, Math.round(canvas.height / 2));
      const count = reduced ? 0 : width < 700 ? 70 : 150;
      particles = Array.from({ length: count }, () => spawn(true));
    };
    const spawn = (anywhere = false): Particle => ({
      a: Math.random() * Math.PI * 2,
      r: anywhere ? 0.3 + Math.random() * 1.6 : 0.85 + Math.random() * 0.2,
      v: 0.0012 + Math.random() * 0.003,
      size: 0.6 + Math.random() * 1.8,
      hue: Math.random() < 0.5 ? 0 : 1,
    });
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const gradient = (alpha: number, c1: RGB, c2: RGB, cx: number, cy: number, rot: number): CanvasGradient | string => {
      if (!conic) return rgbToCss(c1, alpha);
      const g = ctx.createConicGradient(rot, cx, cy);
      g.addColorStop(0, rgbToCss(c1, alpha));
      g.addColorStop(0.5, rgbToCss(c2, alpha));
      g.addColorStop(1, rgbToCss(c1, alpha));
      return g;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      t += 1 / 60;
      const analyser = getAnalyser();
      setUnavailable((u) => (u === !analyser ? u : !analyser));
      let beat = false;
      if (analyser) {
        if (freq.length !== analyser.frequencyBinCount) {
          freq = new Uint8Array(analyser.frequencyBinCount);
          bands = logBands(analyser.fftSize, analyser.context.sampleRate, BANDS);
          const binHz = analyser.context.sampleRate / analyser.fftSize;
          lowBins = [Math.max(1, Math.floor(30 / binHz)), Math.ceil(180 / binHz)];
        }
        analyser.getByteFrequencyData(freq);
        bandLevels(freq, bands, levels);
        const b = bassLevel(freq, analyser.fftSize, analyser.context.sampleRate);
        bass += (b - bass) * (b > bass ? 0.5 : 0.08);
        beat = beats.update(freq, lowBins[0], lowBins[1], t);
      } else {
        levels.fill(0);
        bass *= 0.9;
      }
      smoothInto(smooth, levels);
      if (beat && !reduced) kick = 1;
      kick *= 0.88;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const dpr = w / Math.max(1, canvas.clientWidth);
      const base = Math.min(w, h) * 0.27;
      const pulse = reduced ? 1 : 1 + bass * 0.06 + kick * 0.07;
      const R = base * pulse;
      const amp = base * (reduced ? 0.35 : 0.6);
      const [c1, c2] = paletteRef.current;
      const rot = t * 0.35;
      const shakeX = reduced ? 0 : (Math.random() - 0.5) * kick * 10 * dpr;
      const shakeY = reduced ? 0 : (Math.random() - 0.5) * kick * 10 * dpr;

      // 1) Trails: previous frame, slightly enlarged and faded → strands radiate outwards.
      if (!reduced) {
        bctx.clearRect(0, 0, buffer.width, buffer.height);
        bctx.drawImage(canvas, 0, 0, buffer.width, buffer.height);
      }
      ctx.clearRect(0, 0, w, h);
      if (!reduced) {
        const z = 1.012 + kick * 0.01;
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.translate(cx, cy);
        ctx.scale(z, z);
        ctx.rotate(0.0015);
        ctx.drawImage(buffer, -cx, -cy, w, h);
        ctx.restore();
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);
      ctx.globalCompositeOperation = 'lighter';

      // 2) Particles drifting out from the ring; bass and beats push them faster.
      const maxR = Math.hypot(cx, cy) / base;
      const speed = 1 + bass * 3 + kick * 6;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        p.r += p.v * speed;
        if (p.r > maxR) particles[i] = spawn();
        const pr = p.r * base;
        const x = cx + Math.cos(p.a) * pr;
        const y = cy + Math.sin(p.a) * pr;
        const fade = Math.min(1, (p.r - 0.8) * 2) * (1 - p.r / maxR);
        if (fade <= 0) continue;
        ctx.fillStyle = rgbToCss(p.hue ? c2 : c1, 0.65 * fade);
        const s = p.size * dpr * (1 + kick * 0.6);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }

      // 3) The ring: several wobbling strands with a rotating two-colour gradient.
      const total = BANDS * 2;
      for (let layer = LAYERS - 1; layer >= 0; layer--) {
        const k = layer / LAYERS;
        const pts: [number, number][] = [];
        for (let i = 0; i < total; i++) {
          const v = smooth[bandAt(i, total)]! * (1 - k * 0.35);
          const wobble = Math.sin(i * 0.35 + t * (1.2 + layer * 0.7) + layer) * base * 0.012 * (layer + 1);
          const r = R + v * amp + wobble + layer * 1.6 * dpr;
          const a = (i / total) * Math.PI * 2 - Math.PI / 2;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        ctx.beginPath();
        const mid = (p: [number, number], q: [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
        const start = mid(pts[total - 1]!, pts[0]!);
        ctx.moveTo(start[0], start[1]);
        for (let i = 0; i < total; i++) {
          const p = pts[i]!;
          const m = mid(p, pts[(i + 1) % total]!);
          ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
        }
        ctx.closePath();
        if (layer === 0) {
          // Neon glow: wide faint strokes under a bright core (cheaper than shadowBlur).
          const boost = 1 + kick * 0.8;
          for (const [width, alpha] of [[20, 0.06], [11, 0.11], [5, 0.28]] as const) {
            ctx.strokeStyle = gradient(Math.min(1, alpha * boost), c1, c2, cx, cy, rot);
            ctx.lineWidth = width * dpr;
            ctx.stroke();
          }
          ctx.strokeStyle = gradient(0.95, lighten(c1), lighten(c2), cx, cy, rot);
          ctx.lineWidth = 2.4 * dpr;
        } else {
          ctx.strokeStyle = gradient(0.5 - k * 0.35, c1, c2, cx, cy, rot + layer * 0.4);
          ctx.lineWidth = 1.1 * dpr;
        }
        ctx.stroke();

        if (layer === 0) {
          // Dust on the strands.
          for (let i = 0; i < total; i++) {
            const v = smooth[bandAt(i, total)]!;
            if (v < 0.08) continue;
            const a = (i / total) * Math.PI * 2 - Math.PI / 2;
            ctx.fillStyle = rgbToCss(i % 2 ? c2 : c1, 0.6);
            const dots = 1 + Math.round(v * 3);
            for (let d = 0; d < dots; d++) {
              const rr = R + v * amp * (0.25 + 0.75 * ((d + 1) / (dots + 1))) + Math.sin(t * 3 + i + d) * 2 * dpr;
              const s = (1.2 + v) * dpr;
              ctx.fillRect(cx + Math.cos(a) * rr - s / 2, cy + Math.sin(a) * rr - s / 2, s, s);
            }
          }
        }
      }
      ctx.restore();

      // 4) Cover, glow and beat flash follow without React re-renders.
      const coverSize = (base * 2 * 0.92) / dpr;
      if (coverRef.current) {
        coverRef.current.style.width = `${coverSize}px`;
        coverRef.current.style.height = `${coverSize}px`;
        coverRef.current.style.transform = `translate(calc(-50% + ${shakeX / dpr}px), calc(-50% + ${shakeY / dpr}px)) scale(${pulse})`;
      }
      if (glowRef.current) glowRef.current.style.opacity = String(0.25 + bass * 0.6 + kick * 0.4);
      if (flashRef.current) {
        // Only composite the flash layer while it is visible.
        flashRef.current.style.opacity = String(kick * 0.16);
        flashRef.current.style.visibility = kick > 0.02 ? 'visible' : 'hidden';
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const art = artworkUrl(song.coverArtId, 'full');
  const [c1, c2] = palette;
  return (
    <div
      ref={rootRef}
      data-testid="visualizer"
      data-immersive={immersive || undefined}
      onPointerMove={immersive ? poke : undefined}
      onDoubleClick={() => toggleImmersive()}
      className={clsx(
        'relative overflow-hidden bg-black select-none',
        immersive ? 'fixed inset-0 z-[95]' : 'size-full min-h-[320px] rounded-xl',
        immersive && !controls && 'cursor-none',
      )}
    >
      {/* Backdrop: slow Ken Burns drift over the blurred cover, vignette and grain */}
      {/* Small image + one-off blur; only `transform` animates, which the compositor handles cheaply. */}
      {art && (
        <div className="animate-kenburns absolute inset-0 will-change-transform" aria-hidden>
          <img src={artworkUrl(song.coverArtId, 'thumb') ?? art} alt="" className="size-full object-cover opacity-55 blur-2xl" />
        </div>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.75)_100%)]" aria-hidden />
      <div className="film-grain absolute inset-0 opacity-[0.045]" aria-hidden />
      <div
        ref={glowRef}
        aria-hidden
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 50%, ${rgbToCss(c1, 0.32)} 0%, ${rgbToCss(c2, 0.12)} 35%, transparent 60%)` }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      <div ref={coverRef} className="absolute top-1/2 left-1/2 overflow-hidden rounded-full shadow-[0_0_40px_rgba(0,0,0,0.6)]" aria-hidden>
        {art ? <img src={art} alt="" className="size-full object-cover" draggable={false} /> : <div className="size-full bg-surface-active" />}
      </div>
      <div ref={flashRef} className="pointer-events-none invisible absolute inset-0 bg-white opacity-0" aria-hidden />

      <div className={clsx('absolute bottom-5 left-6 max-w-[70%] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] transition-opacity duration-500', immersive && 'bottom-10 left-10')}>
        <p className={clsx('truncate font-display leading-tight font-extrabold text-white', immersive ? 'text-[2.4rem]' : 'text-[1.5rem]')}>{song.title}</p>
        <p className={clsx('truncate font-semibold tracking-wide text-white/75 uppercase', immersive ? 'text-[18px]' : 'text-[14px]')}>{song.artist}</p>
      </div>

      {/* Controls: always visible in the player, auto-hiding in fullscreen */}
      <div className={clsx('absolute top-3 right-3 flex gap-2 transition-opacity duration-300', immersive && !controls && 'pointer-events-none opacity-0')}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleImmersive();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={immersive ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          title={immersive ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/70"
        >
          {immersive ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
        </button>
      </div>
      {immersive && (
        <div
          onDoubleClick={(e) => e.stopPropagation()}
          className={clsx(
            'absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full bg-black/45 px-5 py-2.5 text-white backdrop-blur-md transition-opacity duration-300',
            !controls && 'pointer-events-none opacity-0',
          )}
        >
          <button type="button" aria-label="Previous" onClick={() => playerStore.getState().previous()} className="rounded-full p-2 hover:bg-white/10">
            <SkipBack className="size-5" fill="currentColor" />
          </button>
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => playerStore.getState().togglePlay()}
            className="flex size-12 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
          >
            {playing ? <PauseGlyph className="size-6" /> : <PlayGlyph className="size-6 translate-x-px" />}
          </button>
          <button type="button" aria-label="Next" onClick={() => playerStore.getState().next()} className="rounded-full p-2 hover:bg-white/10">
            <SkipForward className="size-5" fill="currentColor" />
          </button>
        </div>
      )}
      {unavailable && (
        <p className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[12.5px] text-white/80">
          <AudioLines className="size-4" /> Visualizer needs cross-origin audio from your server
        </p>
      )}
    </div>
  );
}
