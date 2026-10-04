import { useEffect, useRef, useState } from 'react';
import { AudioLines } from 'lucide-react';
import type { Song } from '@sonora/types';
import { getAudioEngine, usePlayer } from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';
import { artworkUrl } from '../../lib/artwork';
import { bandLevels, bassLevel, logBands, neonColor, smoothInto } from '../../lib/visualizer-math';
import { useDominantColor } from '../../hooks/useDominantColor';
import type { HtmlAudioEngine } from '../../platform/audio-engine';

const BANDS = 72; // per half circle; mirrored → 144 points
const LAYERS = 6;

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

/**
 * Circular spectrum visualizer in the style of electronic-music channels:
 * a mirrored, glowing multi-layer ring around the artwork, pulsing with the bass,
 * over a blurred copy of the cover. Colours follow the artwork.
 */
export function Visualizer({ song }: { song: Song }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const backdrop = useDominantColor(song.coverArtId);
  const neon = neonColor(backdrop);
  const neonRef = useRef<RGB>(neon);
  neonRef.current = neon;
  const playing = usePlayer((s) => s.status === 'playing');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let bands: [number, number][] = [];
    let freq = new Uint8Array(0);
    const levels = new Float32Array(BANDS);
    const smooth = new Float32Array(BANDS);
    let bass = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      t += 1 / 60;
      const analyser = getAnalyser();
      setUnavailable((u) => (u === !analyser ? u : !analyser));
      if (analyser) {
        if (freq.length !== analyser.frequencyBinCount) {
          freq = new Uint8Array(analyser.frequencyBinCount);
          bands = logBands(analyser.fftSize, analyser.context.sampleRate, BANDS);
        }
        analyser.getByteFrequencyData(freq);
        bandLevels(freq, bands, levels);
        const b = bassLevel(freq, analyser.fftSize, analyser.context.sampleRate);
        bass += (b - bass) * (b > bass ? 0.5 : 0.08);
      } else {
        levels.fill(0);
        bass *= 0.9;
      }
      smoothInto(smooth, levels);

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.27;
      const pulse = reduced ? 1 : 1 + bass * 0.09;
      const R = base * pulse;
      const amp = base * (reduced ? 0.35 : 0.6);
      const c = neonRef.current;
      const dpr = w / Math.max(1, canvas.clientWidth);

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';

      const total = BANDS * 2;
      for (let layer = LAYERS - 1; layer >= 0; layer--) {
        const k = layer / LAYERS;
        const pts: [number, number][] = [];
        for (let i = 0; i < total; i++) {
          const v = smooth[bandAt(i, total)]! * (1 - k * 0.35);
          // Each layer wobbles slightly differently → the "stacked strands" look.
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
          for (const [width, alpha] of [[18, 0.07], [10, 0.12], [5, 0.3]] as const) {
            ctx.strokeStyle = rgbToCss(c, alpha);
            ctx.lineWidth = width * dpr;
            ctx.stroke();
          }
          ctx.strokeStyle = rgbToCss({ r: Math.min(255, c.r + 70), g: Math.min(255, c.g + 70), b: Math.min(255, c.b + 70) }, 0.95);
          ctx.lineWidth = 2.4 * dpr;
        } else {
          ctx.strokeStyle = rgbToCss(c, 0.5 - k * 0.35);
          ctx.lineWidth = 1.1 * dpr;
        }
        ctx.stroke();

        // Particle dust between the base circle and the outer layer.
        if (layer === 0) {
          ctx.fillStyle = rgbToCss(c, 0.6);
          for (let i = 0; i < total; i++) {
            const v = smooth[bandAt(i, total)]!;
            if (v < 0.08) continue;
            const a = (i / total) * Math.PI * 2 - Math.PI / 2;
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

      // Cover and glow follow the ring without React re-renders.
      const coverSize = (base * 2 * 0.92) / dpr;
      if (coverRef.current) {
        coverRef.current.style.width = `${coverSize}px`;
        coverRef.current.style.height = `${coverSize}px`;
        coverRef.current.style.transform = `translate(-50%, -50%) scale(${pulse})`;
      }
      if (glowRef.current) glowRef.current.style.opacity = String(0.25 + bass * 0.75);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const art = artworkUrl(song.coverArtId, 'full');
  return (
    <div className="relative size-full min-h-[320px] overflow-hidden rounded-xl bg-black" data-testid="visualizer">
      {/* Blurred cover backdrop + bass-driven glow */}
      {art && <img src={art} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-55 blur-2xl" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70" aria-hidden />
      <div
        ref={glowRef}
        aria-hidden
        className="absolute inset-0 transition-opacity duration-75"
        style={{ background: `radial-gradient(circle at 50% 50%, ${rgbToCss(neon, 0.35)} 0%, transparent 55%)` }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      <div ref={coverRef} className="absolute top-1/2 left-1/2 overflow-hidden rounded-full shadow-[0_0_40px_rgba(0,0,0,0.6)]" aria-hidden>
        {art ? <img src={art} alt="" className="size-full object-cover" draggable={false} /> : <div className="size-full bg-surface-active" />}
      </div>
      <div className="absolute bottom-5 left-6 max-w-[70%] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
        <p className="truncate font-display text-[1.5rem] leading-tight font-extrabold text-white">{song.title}</p>
        <p className="truncate text-[14px] font-semibold tracking-wide text-white/75 uppercase">{song.artist}</p>
      </div>
      {unavailable && (
        <p className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[12.5px] text-white/80">
          <AudioLines className="size-4" /> Visualizer needs cross-origin audio from your server
        </p>
      )}
      {!playing && !unavailable && <span className="sr-only">Visualizer paused</span>}
    </div>
  );
}
