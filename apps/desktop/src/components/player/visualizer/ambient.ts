import type { RGB } from '@sonora/ui';
import type { Renderer, VisFrame } from './types';

const mix = (a: RGB, b: RGB): RGB => ({ r: (a.r + b.r) >> 1, g: (a.g + b.g) >> 1, b: (a.b + b.b) >> 1 });

/** Loads an image, with CORS when the server allows it (keeps the canvas readable). */
function imageLoader(onReady: (img: HTMLImageElement) => void) {
  let url: string | undefined;
  return (next: string | undefined) => {
    if (next === url) return;
    url = next;
    if (!next) return;
    const load = (cors: boolean) => {
      const el = new Image();
      if (cors) el.crossOrigin = 'anonymous';
      el.decoding = 'async';
      el.onload = () => url === next && onReady(el);
      if (cors) el.onerror = () => url === next && load(false);
      el.src = next;
    };
    load(true);
  };
}

/**
 * Flowing cover background (like Apple Music's): the cover drawn four times,
 * huge, slowly turning and drifting in different directions, blurred and
 * saturated on a tiny canvas and scaled up. It breathes with the bass.
 * Before the cover has loaded, soft colour fields from the palette stand in.
 * `dim` < 1 makes it a calmer background (used under the lyric pulse).
 */
export function createAmbientRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined, dim = 1): Renderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const low = document.createElement('canvas');
  const lctx = low.getContext('2d')!;
  const soft = document.createElement('canvas');
  const sctx = soft.getContext('2d')!;
  const canFilter = 'filter' in sctx;
  let img: HTMLImageElement | null = null;
  const load = imageLoader((el) => (img = el));

  return {
    draw(f: VisFrame) {
      load(getUrl());
      const W = canvas.width;
      const H = canvas.height;
      const lw = Math.max(16, Math.round(W / 8));
      const lh = Math.max(16, Math.round(H / 8));
      if (low.width !== lw || low.height !== lh) {
        low.width = lw;
        low.height = lh;
        soft.width = lw;
        soft.height = lh;
      }
      const [c1, c2] = f.palette;
      const t = f.reduced ? 0 : f.t;
      const breath = 1 + f.bass * 0.08 + f.kick * 0.03;
      lctx.globalCompositeOperation = 'source-over';
      lctx.globalAlpha = 1;
      lctx.fillStyle = '#08080c';
      lctx.fillRect(0, 0, lw, lh);
      const size = Math.max(lw, lh);
      if (img) {
        for (let k = 0; k < 4; k++) {
          const dir = k % 2 ? 1 : -1;
          const x = (0.5 + 0.28 * Math.sin(t * 0.045 * (k + 1) + k * 2.1)) * lw;
          const y = (0.5 + 0.25 * Math.cos(t * 0.037 * (k + 2) + k * 1.3)) * lh;
          const s = size * (1.25 + k * 0.3) * breath;
          lctx.save();
          lctx.globalAlpha = k === 0 ? 1 : 0.62;
          lctx.translate(x, y);
          lctx.rotate(t * (0.05 + k * 0.025) * dir + k * 1.7);
          lctx.drawImage(img, -s / 2, -s / 2, s, s);
          lctx.restore();
        }
      } else {
        lctx.globalCompositeOperation = 'lighter';
        const colors = [c1, c2, mix(c1, c2), c2, c1];
        for (let k = 0; k < colors.length; k++) {
          const x = (0.5 + 0.33 * Math.sin(t * 0.07 * (k + 1) + k * 1.3)) * lw;
          const y = (0.5 + 0.3 * Math.cos(t * 0.053 * (k + 2) + k * 2.1)) * lh;
          const r = (0.32 + 0.08 * Math.sin(t * 0.11 + k)) * size * breath;
          const c = colors[k]!;
          const g = lctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${0.42 + f.bass * 0.25})`);
          g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
          lctx.fillStyle = g;
          lctx.fillRect(0, 0, lw, lh);
        }
      }
      sctx.clearRect(0, 0, lw, lh);
      if (canFilter) sctx.filter = 'blur(3px) saturate(1.7)';
      sctx.drawImage(low, 0, 0);
      if (canFilter) sctx.filter = 'none';

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 0.9 * dim;
      ctx.drawImage(soft, 0, 0, W, H);
      // Bass makes the colours glow a little brighter.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.5, (f.bass * 0.22 + f.kick * 0.08) * dim);
      ctx.drawImage(soft, 0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      // Gentle vignette so text and controls stay readable.
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, `rgba(0,0,0,${0.55 + (1 - dim) * 0.3})`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    },
  };
}
