import { rgbToCss, type RGB } from '@sonora/ui';
import { createTrails, lighten, type Renderer, type VisFrame } from './types';

const LAYERS = 6;

interface Particle {
  a: number;
  r: number;
  v: number;
  size: number;
  hue: 0 | 1;
}

/** Lows at the top and bottom, highs on the sides → the ring moves all the way round. */
const bandAt = (i: number, total: number, bands: number) => {
  const half = i < total / 2 ? i : total - 1 - i; // mirror left/right
  const p = half / (total / 2 - 1); // 0 top … 1 bottom
  return Math.round((1 - Math.abs(Math.cos(Math.PI * p))) * (bands - 1));
};

const spawn = (anywhere = false): Particle => ({
  a: Math.random() * Math.PI * 2,
  r: anywhere ? 0.3 + Math.random() * 1.6 : 0.85 + Math.random() * 0.2,
  v: 0.0012 + Math.random() * 0.003,
  size: 0.6 + Math.random() * 1.8,
  hue: Math.random() < 0.5 ? 0 : 1,
});

/**
 * The neon ring: a mirrored, glowing multi-layer ring with trails, a rotating
 * two-colour gradient, dust on the strands and particles drifting outwards.
 */
export function createRingRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const conic = typeof ctx.createConicGradient === 'function';
  const trails = createTrails(canvas, ctx);
  let particles: Particle[] = [];
  let particleWidth = -1;

  const gradient = (alpha: number, c1: RGB, c2: RGB, cx: number, cy: number, rot: number): CanvasGradient | string => {
    if (!conic) return rgbToCss(c1, alpha);
    const g = ctx.createConicGradient(rot, cx, cy);
    g.addColorStop(0, rgbToCss(c1, alpha));
    g.addColorStop(0.5, rgbToCss(c2, alpha));
    g.addColorStop(1, rgbToCss(c1, alpha));
    return g;
  };

  return {
    draw(f: VisFrame) {
      const { reduced, kick, bass, t, dpr } = f;
      const smooth = f.levels;
      const bands = smooth.length;
      const count = reduced ? 0 : f.w < 700 ? 70 : 150;
      if (count !== particleWidth) {
        particles = Array.from({ length: count }, () => spawn(true));
        particleWidth = count;
      }
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.27;
      const R = base * f.pulse;
      const amp = base * (reduced ? 0.35 : 0.6);
      const [c1, c2] = f.palette;
      const rot = t * 0.35;

      // 1) Trails: previous frame, slightly enlarged and faded → strands radiate outwards.
      if (!reduced) trails.apply(0.78, 1.012 + kick * 0.01, 0.0015);
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, f.shakeX, f.shakeY);
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
      const total = bands * 2;
      for (let layer = LAYERS - 1; layer >= 0; layer--) {
        const k = layer / LAYERS;
        const pts: [number, number][] = [];
        for (let i = 0; i < total; i++) {
          const v = smooth[bandAt(i, total, bands)]! * (1 - k * 0.35);
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
            const v = smooth[bandAt(i, total, bands)]!;
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
    },
  };
}
