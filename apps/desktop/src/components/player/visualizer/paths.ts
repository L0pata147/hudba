import { BG_COLOR, PATH_SCENES, initPathScene, stepPathScene, type PathSceneId, type ScenePaint } from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';
import { createTrails, lighten, type Renderer, type VisFrame } from './types';

type Paints = Record<ScenePaint, string | CanvasGradient>;

/** Draws one of the shared path scenes (bars, mirror, scope, terrain, tunnel, galaxy) with Path2D. */
export function createPathRenderer(canvas: HTMLCanvasElement, id: PathSceneId): Renderer | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const info = PATH_SCENES[id];
  const slots = info.slots(1);
  const state = initPathScene(id, 1);
  const trails = info.trails ? createTrails(canvas, ctx) : null;
  let paints: Paints | null = null;
  let paintKey = '';

  const makePaints = (w: number, h: number, c1: RGB, c2: RGB): Paints => {
    const lin = (x0: number, y0: number, x1: number, y1: number, a: RGB, b: RGB) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgbToCss(a));
      g.addColorStop(1, rgbToCss(b));
      return g;
    };
    return {
      c1: rgbToCss(c1),
      c2: rgbToCss(c2),
      white: '#fff',
      gradV: lin(0, h, 0, 0, c1, c2),
      gradH: lin(0, 0, w, 0, c1, c2),
      gradD: lin(0, 0, w, h, c1, c2),
      core: lin(0, 0, w, h, lighten(c1), lighten(c2)),
    };
  };

  return {
    draw(f: VisFrame) {
      const out = stepPathScene(id, state, {
        t: f.t,
        dt: f.dt,
        w: f.w,
        h: f.h,
        levels: f.levels,
        bass: f.bass,
        kick: f.kick,
        wave: f.wave,
        reduced: f.reduced,
        quality: 1,
      });
      if (trails && !f.reduced) trails.apply(info.trails, info.trailZoom + f.kick * 0.01);
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      const [c1, c2] = f.palette;
      const key = `${f.w}x${f.h}|${c1.r},${c1.g},${c1.b}|${c2.r},${c2.g},${c2.b}`;
      if (!paints || key !== paintKey) {
        paints = makePaints(f.w, f.h, c1, c2);
        paintKey = key;
      }
      ctx.setTransform(f.dpr, 0, 0, f.dpr, f.shakeX, f.shakeY);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const cache: (Path2D | null | undefined)[] = [];
      for (const slot of slots) {
        const d = out.paths[slot.path];
        if (!d) continue;
        const p = cache[slot.path] ?? (cache[slot.path] = new Path2D(d));
        const alpha = Math.min(1, slot.alpha * (out.alphas[slot.path] ?? 1) * (1 + f.kick * (slot.boost ?? 0)));
        if (alpha <= 0.004) continue;
        ctx.globalCompositeOperation = slot.add ? 'lighter' : 'source-over';
        if (slot.mode === 'fill') {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = paints[slot.paint];
          ctx.fill(p);
          continue;
        }
        if (slot.mode === 'both') {
          ctx.globalAlpha = Math.min(1, alpha * 0.94);
          ctx.fillStyle = BG_COLOR;
          ctx.fill(p);
        }
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = paints[slot.paint];
        ctx.lineWidth = slot.width ?? 1;
        ctx.stroke(p);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
