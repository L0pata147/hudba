import { sampleLevel } from '@sonora/core';
import type { Renderer, VisFrame } from './types';

/**
 * The cover itself as the visualizer: it breathes with the bass, ripples like
 * liquid (drawn in thin horizontal strips with a wave offset) and briefly
 * breaks into big pixels on every beat.
 */
export function createLiquidRenderer(canvas: HTMLCanvasElement, getUrl: () => string | undefined): Renderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const pixels = document.createElement('canvas');
  const pctx = pixels.getContext('2d')!;
  let url: string | undefined;
  let img: HTMLImageElement | null = null;
  let ready = false;

  return {
    draw(f: VisFrame) {
      const next = getUrl();
      if (next !== url) {
        url = next;
        ready = false;
        img = null;
        if (next) {
          // CORS keeps the canvas readable; servers without it still work, the canvas is just tainted.
          const load = (cors: boolean) => {
            const el = new Image();
            if (cors) el.crossOrigin = 'anonymous';
            el.decoding = 'async';
            el.onload = () => {
              if (url === next) {
                img = el;
                ready = true;
              }
            };
            if (cors) el.onerror = () => url === next && load(false);
            el.src = next;
          };
          load(true);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!ready || !img) return;

      const W = canvas.width;
      const H = canvas.height;
      const motion = f.reduced ? 0.2 : 1;
      const S = Math.min(W, H) * 0.62 * (f.reduced ? 1 : 1 + f.bass * 0.05 + f.kick * 0.06);
      const x0 = (W - S) / 2 + f.shakeX;
      const y0 = (H - S) / 2 + f.shakeY;
      const amp = S * 0.02 * (0.3 + f.bass * 1.6) * motion;
      const high = sampleLevel(f.levels, 0.75);
      const pad = amp * 1.3 + S * 0.01;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x0, y0, S, S, S * 0.04);
      ctx.clip();
      const rows = 90;
      // SVG covers without an intrinsic size report 0×0.
      const sw = img.naturalWidth || 300;
      const sh = (img.naturalHeight || 300) / rows;
      const dh = S / rows;
      for (let r = 0; r < rows; r++) {
        const yn = r / rows;
        const dx = (Math.sin(yn * 6 + f.t * 2.2) * amp + Math.sin(yn * 17 - f.t * 3.1) * S * 0.006 * high * (1 + f.kick)) * motion;
        ctx.drawImage(img, 0, r * sh, sw, sh + 0.5, x0 - pad + dx, y0 + r * dh, S + pad * 2, dh + 1);
      }
      // Beat: the cover snaps into big pixels for a moment.
      if (f.kick > 0.15 && !f.reduced) {
        const n = Math.max(6, Math.round(48 - f.kick * 38));
        if (pixels.width !== n) {
          pixels.width = n;
          pixels.height = n;
        }
        pctx.drawImage(img, 0, 0, n, n);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = Math.min(1, f.kick * 1.1);
        ctx.drawImage(pixels, x0, y0, S, S);
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
  };
}
