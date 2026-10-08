import { describe, expect, it } from 'vitest';
import {
  PATH_SCENES,
  TERRAIN_ROWS_AT,
  sceneGradients,
  cycleVisualizerStyle,
  initPathScene,
  normalizeVisualizerStyle,
  sampleLevel,
  stepPathScene,
  visualizerStyles,
  type PathSceneId,
  type SceneInput,
} from '../src';

const W = 400;
const H = 300;
const ids = Object.keys(PATH_SCENES) as PathSceneId[];
const input = (over: Partial<SceneInput> = {}): SceneInput => ({
  t: 1,
  dt: 1 / 60,
  w: W,
  h: H,
  levels: new Array(48).fill(0),
  bass: 0,
  kick: 0,
  wave: new Array(256).fill(0),
  reduced: false,
  quality: 1,
  ...over,
});
const loud = (t = 1) =>
  input({
    t,
    levels: Array.from({ length: 48 }, (_, k) => 0.5 + 0.4 * Math.sin(k * 0.4 + t)),
    bass: 0.8,
    wave: Array.from({ length: 256 }, (_, k) => 0.6 * Math.sin(k * 0.3 + t * 7)),
  });
/** Every number in a path string, as [x, y] pairs where they come in pairs. */
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
/** Sum of all vertical extents — a rough "how much is going on" measure. */
const busy = (paths: string[]) => paths.reduce((s, d) => s + d.length, 0);

describe('visualizer styles', () => {
  it('lists, normalises and cycles styles per platform', () => {
    expect(visualizerStyles('desktop').map((s) => s.id)).toContain('milkdrop');
    expect(visualizerStyles('mobile').map((s) => s.id)).not.toContain('milkdrop');
    expect(normalizeVisualizerStyle('milkdrop', 'mobile')).toBe('ring');
    expect(normalizeVisualizerStyle('bogus')).toBe('ring');
    expect(normalizeVisualizerStyle('galaxy', 'mobile')).toBe('galaxy');
    expect(cycleVisualizerStyle('ring', -1, 'desktop')).toBe('dancer');
    expect(cycleVisualizerStyle('ring', -1, 'mobile')).toBe('ambient');
    expect(normalizeVisualizerStyle('dancer', 'mobile')).toBe('ring');
    expect(cycleVisualizerStyle('galaxy', 1, 'desktop')).toBe('milkdrop');
    expect(cycleVisualizerStyle('galaxy', 1, 'mobile')).toBe('liquid');
  });

  it('samples levels with interpolation', () => {
    expect(sampleLevel([0, 1], 0.5)).toBeCloseTo(0.5);
    expect(sampleLevel([0.2, 0.4, 0.6], 1)).toBeCloseTo(0.6);
    expect(sampleLevel([], 0.3)).toBe(0);
  });
});

describe.each(ids)('scene %s', (id) => {
  it.each([0, 1] as const)('quality %i: valid paths for every slot, finite and inside sane bounds', (q) => {
    const s = initPathScene(id, q);
    let out = stepPathScene(id, s, { ...loud(), quality: q });
    for (let f = 0; f < 90; f++) out = stepPathScene(id, s, { ...loud(1 + f / 60), quality: q });
    const slots = PATH_SCENES[id].slots(q);
    for (const slot of slots) expect(slot.path).toBeLessThan(out.paths.length);
    expect(out.alphas).toHaveLength(out.paths.length);
    for (const d of out.paths) {
      if (!d) continue;
      expect(d).toMatch(/^M/);
      expect(d).not.toMatch(/NaN|Infinity/);
      for (const n of numbers(d)) expect(Math.abs(n)).toBeLessThan(W * 3);
    }
    for (const a of out.alphas) expect(a).toBeGreaterThanOrEqual(0);
  });

  it('music moves it more than silence', () => {
    // Same bass/kick (so motion speed is equal), only the spectrum differs.
    const quiet = initPathScene(id, 1);
    const music = initPathScene(id, 1);
    let qa = stepPathScene(id, quiet, input());
    let ma = stepPathScene(id, music, { ...loud(), bass: 0 });
    for (let f = 0; f < 60; f++) {
      qa = stepPathScene(id, quiet, input({ t: 1 + f / 60 }));
      ma = stepPathScene(id, music, { ...loud(1 + f / 60), bass: 0 });
    }
    expect(activity(id, ma.paths)).toBeGreaterThan(activity(id, qa.paths) * 1.1);
  });
});

/** How much a scene's drawing reacts: bar heights, vertical spread of lines, ring deformation, star size. */
function activity(id: PathSceneId, paths: string[]): number {
  const all = paths.join('');
  if (id === 'bars' || id === 'mirror') {
    // Bars are capsules (M x base V top … ) or, when short, rects (… v height …).
    return paths[0]!
      .split('M')
      .filter(Boolean)
      .reduce((sum, sub) => {
        const cap = /^(-?[\d.]+) (-?[\d.]+)V(-?[\d.]+)/.exec(sub);
        const box = /v(-?[\d.]+)/.exec(sub);
        return sum + (cap ? Math.abs(Number(cap[2]) - Number(cap[3])) : box ? Math.abs(Number(box[1])) : 0);
      }, 0);
  }
  if (id === 'galaxy') return [...paths.slice(4, 7).join('').matchAll(/h(-?\d+(\.\d+)?)/g)].reduce((s, m) => s + Math.abs(Number(m[1])), 0);
  const pairs = (d: string) => {
    const n = numbers(d);
    const out: [number, number][] = [];
    for (let k = 0; k + 1 < n.length; k += 2) out.push([n[k]!, n[k + 1]!]);
    return out;
  };
  if (id === 'tunnel') {
    // Spread of the radius within each ring (a plain hexagon varies little).
    let total = 0;
    for (const ring of paths.slice(2, 5).join('').split('M').filter(Boolean)) {
      const r = pairs('M' + ring).map(([x, y]) => Math.hypot(x - W / 2, y - H / 2));
      total += Math.max(...r) / Math.max(1, Math.min(...r));
    }
    return total;
  }
  const relevant = id === 'terrain' ? paths.slice(TERRAIN_ROWS_AT) : id === 'scope' ? [paths[4]!] : paths;
  const ys = relevant.flatMap((d) => pairs(d).map(([, y]) => y));
  const lines = relevant.map((d) => {
    const y = pairs(d).map(([, v]) => v);
    return y.length ? Math.max(...y) - Math.min(...y) : 0;
  });
  return lines.reduce((s, v) => s + v, 0) + (ys.length ? 0 : 0);
}

describe('scene details', () => {
  it('bars: peak caps fall slower than the bars', () => {
    const s = initPathScene('bars', 0) as { peak: number[] };
    stepPathScene('bars', s as never, input({ levels: new Array(48).fill(1), quality: 0 }));
    const top = s.peak[5]!;
    stepPathScene('bars', s as never, input({ levels: new Array(48).fill(0), quality: 0 }));
    expect(s.peak[5]!).toBeGreaterThan(top * 0.95);
    for (let f = 0; f < 120; f++) stepPathScene('bars', s as never, input({ levels: new Array(48).fill(0), quality: 0 }));
    expect(s.peak[5]!).toBeLessThan(top * 0.1);
  });

  it('scope: triggers on a rising zero crossing so a steady tone stands still', () => {
    const s = initPathScene('scope', 1);
    const tone = (phase: number) => Array.from({ length: 512 }, (_, k) => 0.5 * Math.sin(k * 0.2 + phase));
    const a = stepPathScene('scope', s, input({ wave: tone(0.3) })).paths[4]!;
    const b = stepPathScene('scope', s, input({ wave: tone(2.1) })).paths[4]!;
    const ya = numbers(a).filter((_, k) => k % 2 === 1).slice(0, 40);
    const yb = numbers(b).filter((_, k) => k % 2 === 1).slice(0, 40);
    const diff = ya.reduce((m, y, k) => Math.max(m, Math.abs(y - yb[k]!)), 0);
    expect(diff).toBeLessThan(H * 0.05);
  });

  it('terrain: rows scroll back over time and fill up to the history size', () => {
    const s = initPathScene('terrain', 0) as { rows: number[][]; R: number };
    for (let f = 0; f < 60 * 4; f++) stepPathScene('terrain', s as never, { ...loud(f / 60), quality: 0 });
    expect(s.rows).toHaveLength(s.R);
    const out = stepPathScene('terrain', s as never, { ...loud(5), quality: 0 });
    expect(out.paths).toHaveLength(TERRAIN_ROWS_AT + s.R + 1);
    // Far rows are fainter than near ones.
    expect(out.alphas[TERRAIN_ROWS_AT + 1]!).toBeLessThan(out.alphas[TERRAIN_ROWS_AT + s.R - 1]!);
    // The sun is cut by gaps: several closed pieces.
    expect(out.paths[1]!.split('Z').length).toBeGreaterThan(4);
  });

  it('tunnel and galaxy move faster with bass', () => {
    const tunnelStep = (bass: number) => {
      const st = initPathScene('tunnel', 0) as { z: number[] };
      const z0 = st.z[3]!;
      stepPathScene('tunnel', st as never, input({ quality: 0, dt: 0.05, bass, kick: bass }));
      return z0 - st.z[3]!;
    };
    expect(tunnelStep(1)).toBeGreaterThan(tunnelStep(0) * 3);
    const galaxyStep = (bass: number) => {
      const st = initPathScene('galaxy', 0) as { phi: number };
      const a0 = st.phi;
      stepPathScene('galaxy', st as never, input({ quality: 0, dt: 0.05, bass, kick: bass }));
      return st.phi - a0;
    };
    expect(galaxyStep(1)).toBeGreaterThan(galaxyStep(0) * 3);
  });
});

describe('scene paints', () => {
  it.each(ids)('%s: every slot paints with a known colour or gradient', (id) => {
    for (const q of [0, 1] as const) {
      const grads = sceneGradients(id, W, H, q);
      for (const slot of PATH_SCENES[id].slots(q)) {
        for (const paint of [slot.paint, slot.fill].filter(Boolean) as string[]) {
          expect(['c1', 'c2', 'mix', 'white', 'black', 'dark', 'c1light', 'c2light'].includes(paint) || paint in grads, `${id}: ${paint}`).toBe(true);
        }
      }
      for (const g of Object.values(grads)) for (const [o] of g.stops) expect(o).toBeGreaterThanOrEqual(0);
    }
  });

  it('beats fire sparks, motes and shockwaves', () => {
    const run = (id: PathSceneId) => {
      const s = initPathScene(id, 1);
      let out = stepPathScene(id, s, loud());
      for (let f = 0; f < 30; f++) out = stepPathScene(id, s, { ...loud(1 + f / 60), kick: f === 10 ? 1 : f > 10 ? 0.88 ** (f - 10) : 0 });
      return out;
    };
    expect(run('bars').paths[3]!.length).toBeGreaterThan(0);
    expect(run('mirror').paths[4]!.length).toBeGreaterThan(0);
    const tunnel = (() => {
      const s = initPathScene('tunnel', 1);
      stepPathScene('tunnel', s, loud());
      return stepPathScene('tunnel', s, { ...loud(), kick: 1 });
    })();
    expect(tunnel.paths[6]!.length).toBeGreaterThan(0);
    expect(tunnel.alphas[6]!).toBeGreaterThan(0.9);
  });
});
