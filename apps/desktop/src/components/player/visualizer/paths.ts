import {
  BG_COLOR,
  PATH_SCENES,
  SCENE_COLORS,
  initPathScene,
  sceneColor,
  sceneGradients,
  stepPathScene,
  type PathSceneId,
  type SceneColor,
  type SceneOutput,
  type SceneSlot,
} from '@sonora/core';
import { rgbToCss, type RGB } from '@sonora/ui';
import { createTrails, type Renderer, type VisFrame } from './types';

type Paints = Record<string, string | CanvasGradient>;

function makePaints(c: CanvasRenderingContext2D, id: PathSceneId, w: number, h: number, c1: RGB, c2: RGB): Paints {
  const paints: Paints = {};
  for (const name of SCENE_COLORS) paints[name] = rgbToCss(sceneColor(name, c1, c2));
  const css = (col: SceneColor, a: number) => rgbToCss(sceneColor(col, c1, c2), a);
  for (const [name, g] of Object.entries(sceneGradients(id, w, h, 1))) {
    const grad = g.kind === 'linear' ? c.createLinearGradient(g.x1, g.y1, g.x2, g.y2) : c.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, Math.max(1, g.r));
    for (const [offset, col, a] of g.stops) grad.addColorStop(offset, css(col, a));
    paints[name] = grad;
  }
  return paints;
}

function drawSlots(c: CanvasRenderingContext2D, slots: SceneSlot[], out: SceneOutput, paints: Paints, kick: number, cache: (Path2D | undefined)[]) {
  c.lineJoin = 'round';
  c.lineCap = 'round';
  for (const slot of slots) {
    const d = out.paths[slot.path];
    if (!d) continue;
    const p = cache[slot.path] ?? (cache[slot.path] = new Path2D(d));
    const alpha = Math.min(1, slot.alpha * (out.alphas[slot.path] ?? 1) * (1 + kick * (slot.boost ?? 0)));
    if (alpha <= 0.004) continue;
    c.globalCompositeOperation = slot.add ? 'lighter' : 'source-over';
    const paint = paints[slot.paint] ?? '#fff';
    if (slot.mode === 'fill') {
      c.globalAlpha = alpha;
      c.fillStyle = paint;
      c.fill(p);
      continue;
    }
    if (slot.mode === 'both') {
      c.globalAlpha = Math.min(1, alpha * 0.94);
      c.fillStyle = slot.fill ? (paints[slot.fill] ?? BG_COLOR) : BG_COLOR;
      c.fill(p);
    }
    c.globalAlpha = alpha;
    c.strokeStyle = paint;
    c.lineWidth = slot.width ?? 1;
    c.stroke(p);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/**
 * Draws one of the shared path scenes (bars, mirror, scope, terrain, tunnel,
 * galaxy) with Path2D. Moving parts go into an offscreen layer that keeps
 * motion trails; static "back" parts are drawn under it every frame; a
 * quarter-resolution blurred copy is added on top as bloom.
 */
export function createPathRenderer(canvas: HTMLCanvasElement, id: PathSceneId): Renderer | null {
  const ctx = canvas.getContext('2d');
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d');
  const glow = document.createElement('canvas');
  const gctx = glow.getContext('2d');
  if (!ctx || !lctx || !gctx) return null;
  const info = PATH_SCENES[id];
  const slots = info.slots(1);
  const back = slots.filter((s) => s.back);
  const front = slots.filter((s) => !s.back);
  const state = initPathScene(id, 1);
  const trails = info.trails ? createTrails(layer, lctx) : null;
  const canFilter = 'filter' in gctx;
  let paints: { main: Paints; layer: Paints } | null = null;
  let paintKey = '';
  // Adaptive quality: weak GPUs (or none) drop the bloom pass instead of the frame rate.
  let frameTime = 1 / 60;
  let bloomOn = true;

  return {
    draw(f: VisFrame) {
      frameTime += (f.dt - frameTime) * 0.03;
      if (bloomOn && frameTime > 1 / 38) bloomOn = false;
      else if (!bloomOn && frameTime < 1 / 56) bloomOn = true;
      canvas.dataset.bloom = bloomOn ? '1' : '0';
      const W = canvas.width;
      const H = canvas.height;
      if (layer.width !== W || layer.height !== H) {
        layer.width = W;
        layer.height = H;
      }
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
      const [c1, c2] = f.palette;
      const key = `${f.w}x${f.h}|${c1.r},${c1.g},${c1.b}|${c2.r},${c2.g},${c2.b}`;
      if (!paints || key !== paintKey) {
        paints = { main: makePaints(ctx, id, f.w, f.h, c1, c2), layer: makePaints(lctx, id, f.w, f.h, c1, c2) };
        paintKey = key;
      }
      const cache: (Path2D | undefined)[] = [];

      // 1) moving parts, on top of what is left of the previous frames
      if (trails && !f.reduced) trails.apply(info.trails, info.trailZoom + f.kick * 0.01);
      else {
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, W, H);
      }
      lctx.setTransform(f.dpr, 0, 0, f.dpr, f.shakeX, f.shakeY);
      drawSlots(lctx, front, out, paints.layer, f.kick, cache);

      // 2) static background + the moving layer
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      if (back.length) {
        ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
        drawSlots(ctx, back, out, paints.main, f.kick, cache);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.drawImage(layer, 0, 0);

      // 3) bloom: a small blurred copy added back makes everything bright glow
      if (info.bloom > 0 && bloomOn) {
        const gw = Math.max(1, Math.round(W / 4));
        const gh = Math.max(1, Math.round(H / 4));
        if (glow.width !== gw || glow.height !== gh) {
          glow.width = gw;
          glow.height = gh;
        }
        gctx.clearRect(0, 0, gw, gh);
        if (canFilter) gctx.filter = `blur(${Math.max(2, gw / 90).toFixed(1)}px)`;
        gctx.drawImage(canvas, 0, 0, gw, gh);
        if (canFilter) gctx.filter = 'none';
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, info.bloom * (0.85 + f.kick * 0.5));
        ctx.drawImage(glow, 0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    },
  };
}
