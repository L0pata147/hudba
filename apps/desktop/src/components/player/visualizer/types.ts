import type { RGB } from '@sonora/ui';

/** Everything a renderer needs for one frame (analysis is done once by the host). */
export interface VisFrame {
  t: number;
  dt: number;
  /** canvas size in CSS px and the device-pixel ratio actually used */
  w: number;
  h: number;
  dpr: number;
  /** smoothed band levels 0…1, low → high */
  levels: Float32Array;
  bass: number;
  /** 1 on a beat, decays */
  kick: number;
  /** raw byte spectrum of the analyser */
  freq: Uint8Array;
  /** time-domain samples −1…1 (downsampled) */
  wave: Float32Array;
  palette: [RGB, RGB];
  reduced: boolean;
  /** beat shake in device px */
  shakeX: number;
  shakeY: number;
  pulse: number;
}

export interface Renderer {
  draw(f: VisFrame): void;
  dispose?(): void;
}

export const lighten = (c: RGB, d = 70): RGB => ({ r: Math.min(255, c.r + d), g: Math.min(255, c.g + d), b: Math.min(255, c.b + d) });

/** Half-resolution copy of the last frame for motion trails. */
export function createTrails(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d')!;
  return {
    /** Clears the canvas and redraws the previous frame faded/zoomed. */
    apply(alpha: number, zoom: number, rotate = 0) {
      const w = canvas.width;
      const h = canvas.height;
      const bw = Math.max(1, Math.round(w / 2));
      const bh = Math.max(1, Math.round(h / 2));
      if (buffer.width !== bw || buffer.height !== bh) {
        buffer.width = bw;
        buffer.height = bh;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      bctx.clearRect(0, 0, bw, bh);
      bctx.drawImage(canvas, 0, 0, bw, bh);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(w / 2, h / 2);
      ctx.scale(zoom, zoom);
      if (rotate) ctx.rotate(rotate);
      ctx.drawImage(buffer, -w / 2, -h / 2, w, h);
      ctx.restore();
    },
  };
}
