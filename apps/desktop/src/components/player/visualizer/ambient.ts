import type { RGB } from '@sonora/ui';
import type { Renderer, VisFrame } from './types';

const mix = (a: RGB, b: RGB): RGB => ({ r: (a.r + b.r) >> 1, g: (a.g + b.g) >> 1, b: (a.b + b.b) >> 1 });

/**
 * Slow, soft colour fields from the cover palette that breathe with the bass.
 * Drawn on a tiny canvas and scaled up, which blurs it for free.
 * `dim` < 1 makes it a calm background (used under the lyric pulse).
 */
export function createAmbientRenderer(canvas: HTMLCanvasElement, dim = 1): Renderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const low = document.createElement('canvas');
  const lctx = low.getContext('2d')!;

  return {
    draw(f: VisFrame) {
      const W = canvas.width;
      const H = canvas.height;
      const lw = Math.max(8, Math.round(W / 10));
      const lh = Math.max(8, Math.round(H / 10));
      if (low.width !== lw || low.height !== lh) {
        low.width = lw;
        low.height = lh;
      }
      const [c1, c2] = f.palette;
      const colors = [c1, c2, mix(c1, c2), c2, c1];
      const t = f.reduced ? 0 : f.t;
      lctx.globalCompositeOperation = 'source-over';
      lctx.fillStyle = '#05050a';
      lctx.fillRect(0, 0, lw, lh);
      lctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < colors.length; k++) {
        const x = (0.5 + 0.33 * Math.sin(t * 0.07 * (k + 1) + k * 1.3)) * lw;
        const y = (0.5 + 0.3 * Math.cos(t * 0.053 * (k + 2) + k * 2.1)) * lh;
        const r = (0.32 + 0.08 * Math.sin(t * 0.11 + k)) * Math.max(lw, lh) * (1 + f.bass * 0.18 + f.kick * 0.06);
        const c = colors[k]!;
        const a = (0.42 + f.bass * 0.25) * dim;
        const g = lctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${a})`);
        g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
        lctx.fillStyle = g;
        lctx.fillRect(0, 0, lw, lh);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(low, 0, 0, W, H);
    },
  };
}
