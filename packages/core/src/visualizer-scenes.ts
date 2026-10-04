/**
 * Visualizer scenes shared by the desktop and mobile apps.
 *
 * Each scene turns the analysed audio into SVG path strings plus a static list
 * of "slots" saying how to paint them (solid colours or gradients defined in
 * pixels for the current size). Desktop draws the strings with Path2D on a
 * canvas (with trails and bloom), mobile feeds them to react-native-svg from a
 * Reanimated frame callback — so every function that runs per frame is a
 * worklet (the directive is a no-op string elsewhere) and only uses plain
 * arrays/objects.
 */

/** Colours a scene can use; resolved from the cover palette by each platform. */
export type SceneColor = 'c1' | 'c2' | 'mix' | 'white' | 'black' | 'dark' | 'c1light' | 'c2light';
export type GradientStop = [offset: number, color: SceneColor, alpha: number];
/** Gradients in absolute pixels for the current canvas size. */
export type SceneGradient =
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: GradientStop[] };

/** Built-in paints; scenes can add their own gradients by name. */
export type ScenePaint = SceneColor | 'gradV' | 'gradH' | 'gradD' | 'core' | (string & {});

/** How to paint one path. Several slots may paint the same path (glow under a core line). */
export interface SceneSlot {
  path: number;
  /** `both` = fill (default: the dark background, occludes what's behind), then stroke. */
  mode: 'stroke' | 'fill' | 'both';
  paint: ScenePaint;
  /** fill paint for `both` */
  fill?: ScenePaint;
  /** stroke width in CSS px / dp */
  width?: number;
  alpha: number;
  /** extra alpha on a beat: alpha × (1 + kick × boost) */
  boost?: number;
  /** additive blending (desktop only; plain alpha on mobile) */
  add?: boolean;
  /** static background layer: drawn under the motion trails on desktop */
  back?: boolean;
}

export interface SceneInput {
  t: number;
  dt: number;
  w: number;
  h: number;
  /** smoothed band levels 0…1, low → high frequencies */
  levels: ArrayLike<number>;
  bass: number;
  /** 1 on a beat, decays to 0 */
  kick: number;
  /** time-domain samples −1…1 */
  wave: ArrayLike<number>;
  reduced: boolean;
  /** 1 = desktop (more detail), 0 = mobile */
  quality: 0 | 1;
}

export interface SceneOutput {
  paths: string[];
  /** per-path alpha multiplier */
  alphas: number[];
}

export type PathSceneId = 'bars' | 'mirror' | 'scope' | 'terrain' | 'tunnel' | 'galaxy';

export interface PathSceneInfo {
  slots(quality: 0 | 1): SceneSlot[];
  /** the scene's own gradients for a canvas of w × h */
  gradients?(w: number, h: number, quality: 0 | 1): Record<string, SceneGradient>;
  /** desktop motion trails: how much of the previous frame stays (0 = none) and its zoom */
  trails: number;
  trailZoom: number;
  /** desktop bloom strength (soft glow around everything bright) */
  bloom: number;
}

export const BG_COLOR = '#07070c';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Palette colour for a scene colour name. */
export function sceneColor(c: SceneColor, c1: Rgb, c2: Rgb): Rgb {
  const light = (x: Rgb): Rgb => ({ r: Math.min(255, x.r + 80), g: Math.min(255, x.g + 80), b: Math.min(255, x.b + 80) });
  switch (c) {
    case 'c1':
      return c1;
    case 'c2':
      return c2;
    case 'mix':
      return { r: (c1.r + c2.r) >> 1, g: (c1.g + c2.g) >> 1, b: (c1.b + c2.b) >> 1 };
    case 'white':
      return { r: 255, g: 255, b: 255 };
    case 'black':
      return { r: 7, g: 7, b: 12 };
    case 'dark':
      return { r: Math.round((c1.r + c2.r) * 0.07) + 6, g: Math.round((c1.g + c2.g) * 0.07) + 5, b: Math.round((c1.b + c2.b) * 0.07) + 10 };
    case 'c1light':
      return light(c1);
    default:
      return light(c2);
  }
}

export const SCENE_COLORS: SceneColor[] = ['c1', 'c2', 'mix', 'white', 'black', 'dark', 'c1light', 'c2light'];

/** All gradients a scene can paint with: the built-in ones plus the scene's own. */
export function sceneGradients(id: PathSceneId, w: number, h: number, quality: 0 | 1): Record<string, SceneGradient> {
  return {
    gradV: { kind: 'linear', x1: 0, y1: h, x2: 0, y2: 0, stops: [[0, 'c1', 1], [1, 'c2', 1]] },
    gradH: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: 0, stops: [[0, 'c1', 1], [1, 'c2', 1]] },
    gradD: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: h, stops: [[0, 'c1', 1], [1, 'c2', 1]] },
    core: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: h, stops: [[0, 'c1light', 1], [1, 'c2light', 1]] },
    ...(PATH_SCENES[id].gradients?.(w, h, quality) ?? {}),
  };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Level at x ∈ [0,1] (0 = lowest band), linearly interpolated. */
export function sampleLevel(levels: ArrayLike<number>, x: number): number {
  'worklet';
  const n = levels.length;
  if (!n) return 0;
  const p = Math.max(0, Math.min(1, x)) * (n - 1);
  const i = Math.floor(p);
  const a = levels[i] ?? 0;
  const b = levels[Math.min(n - 1, i + 1)] ?? 0;
  return a + (b - a) * (p - i);
}

function r1(x: number): number {
  'worklet';
  return Math.round(x * 10) / 10;
}

function rect(x: number, y: number, w: number, h: number): string {
  'worklet';
  return `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`;
}

/** Bar with a rounded end: grows up (dir −1) or down (dir 1) from `base`. */
function capsule(x: number, base: number, bw: number, hgt: number, dir: number): string {
  'worklet';
  const r = bw / 2;
  if (hgt <= r + 0.5) return dir < 0 ? rect(x, base - hgt, bw, hgt) : rect(x, base, bw, hgt);
  if (dir < 0) return `M${r1(x)} ${r1(base)}V${r1(base - hgt + r)}A${r1(r)} ${r1(r)} 0 0 1 ${r1(x + bw)} ${r1(base - hgt + r)}V${r1(base)}Z`;
  return `M${r1(x)} ${r1(base)}V${r1(base + hgt - r)}A${r1(r)} ${r1(r)} 0 0 0 ${r1(x + bw)} ${r1(base + hgt - r)}V${r1(base)}Z`;
}

/** Smooth open curve through the points (quadratic curves through midpoints). */
function smoothOpen(xs: number[], ys: number[]): string {
  'worklet';
  const n = xs.length;
  if (n < 2) return '';
  let d = `M${r1(xs[0]!)} ${r1(ys[0]!)}`;
  for (let i = 1; i < n - 1; i++) d += `Q${r1(xs[i]!)} ${r1(ys[i]!)} ${r1((xs[i]! + xs[i + 1]!) / 2)} ${r1((ys[i]! + ys[i + 1]!) / 2)}`;
  return `${d}L${r1(xs[n - 1]!)} ${r1(ys[n - 1]!)}`;
}

interface Seeded {
  seed: number;
}

function rnd(s: Seeded): number {
  'worklet';
  s.seed = (s.seed * 1664525 + 1013904223) % 4294967296;
  return s.seed / 4294967296;
}

function zeros(n: number): number[] {
  'worklet';
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(0);
  return a;
}

/** True on the frame a beat starts (kick jumps to 1 and then decays). */
function beatStarted(s: { prevKick: number }, kick: number): boolean {
  'worklet';
  const started = kick > 0.9 && s.prevKick < kick - 0.05;
  s.prevKick = kick;
  return started;
}

/** A drifting mote/spark. */
export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

/* ------------------------------------------------------------------ */
/* 1) Spectrum bars: glowing capsules, falling caps, sparks            */
/* ------------------------------------------------------------------ */

export interface BarsState extends Seeded {
  n: number;
  peak: number[];
  vel: number[];
  prev: number[];
  sparks: Mote[];
  prevKick: number;
}

export function initBars(quality: 0 | 1, seed = 41): BarsState {
  'worklet';
  const n = quality ? 72 : 36;
  return { seed, n, peak: zeros(n), vel: zeros(n), prev: zeros(n), sparks: [], prevKick: 0 };
}

function barsLayout(w: number, h: number, n: number) {
  'worklet';
  const m = w * 0.05;
  const bw = (w - 2 * m) / (n * 1.3 - 0.3);
  return { m, bw, gap: bw * 0.3, base: h * 0.68, maxH: h * 0.52 };
}

export function stepBars(s: BarsState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, dt } = i;
  const { m, bw, gap, base, maxH } = barsLayout(w, h, s.n);
  const gravity = h * 1.9;
  const beat = beatStarted(s, i.kick);
  const maxSparks = i.quality ? 140 : 40;
  let bars = '';
  let caps = '';
  let refl = '';
  for (let k = 0; k < s.n; k++) {
    const v = Math.min(1, sampleLevel(i.levels, k / (s.n - 1)) * (1 + i.kick * 0.15));
    const hgt = Math.max(3, v * maxH);
    if (hgt >= s.peak[k]!) {
      s.peak[k] = hgt;
      s.vel[k] = 0;
    } else {
      s.vel[k] = s.vel[k]! + gravity * dt;
      s.peak[k] = Math.max(hgt, s.peak[k]! - s.vel[k]! * dt);
    }
    const x = m + k * (bw + gap);
    bars += capsule(x, base, bw, hgt, -1);
    refl += capsule(x, base + 4, bw, hgt * 0.4, 1);
    caps += rect(x, base - s.peak[k]! - 7, bw, 3);
    const jump = v - s.prev[k]!;
    s.prev[k] = v;
    if (!i.reduced && s.sparks.length < maxSparks && (jump > 0.09 || (beat && v > 0.5 && rnd(s) < 0.5))) {
      const life = 0.5 + rnd(s) * 0.7;
      s.sparks.push({
        x: x + bw / 2,
        y: base - hgt,
        vx: (rnd(s) - 0.5) * bw * 8,
        vy: -(0.25 + rnd(s) * 0.55) * h * (0.6 + v),
        life,
        max: life,
        size: (i.quality ? 2 : 2.6) + rnd(s) * 1.6,
      });
    }
  }
  let sparks = '';
  const alive: Mote[] = [];
  for (const p of s.sparks) {
    p.vy += gravity * 0.45 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0 || p.y > base) continue;
    alive.push(p);
    const sz = p.size * (0.4 + 0.6 * (p.life / p.max));
    sparks += rect(p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  s.sparks = alive;
  const floor = `M${r1(m)} ${r1(base + 1.5)}H${r1(w - m)}`;
  return { paths: [bars, caps, refl, sparks, floor], alphas: [1, 1, 1, 1, 1] };
}

/* ------------------------------------------------------------------ */
/* 2) Mirror horizon: bars beside the cover, glowing outline, motes     */
/* ------------------------------------------------------------------ */

export interface MirrorState extends Seeded {
  n: number;
  motes: Mote[];
  prevKick: number;
  trickle: number;
}

export function initMirror(quality: 0 | 1, seed = 53): MirrorState {
  'worklet';
  return { seed, n: quality ? 44 : 18, motes: [], prevKick: 0, trickle: 0 };
}

export function stepMirror(s: MirrorState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, dt } = i;
  const cx = w / 2;
  const cy = h / 2;
  const cover = Math.min(w, h) * 0.3;
  const m = w * 0.035;
  const inner = cover / 2 + 16;
  const span = w / 2 - m - inner;
  const bw = span / (s.n * 1.4 - 0.4);
  const gap = bw * 0.4;
  const maxH = h * 0.34;
  let up = '';
  let down = '';
  const lx: number[] = [];
  const ly: number[] = [];
  const rx: number[] = [];
  const ry: number[] = [];
  for (let k = 0; k < s.n; k++) {
    const v = sampleLevel(i.levels, (k / Math.max(1, s.n - 1)) * 0.95);
    const hgt = Math.max(3, v * maxH * (1 + i.kick * 0.12));
    const off = inner + k * (bw + gap);
    const xl = cx - off - bw;
    const xr = cx + off;
    up += capsule(xl, cy - 3, bw, hgt, -1) + capsule(xr, cy - 3, bw, hgt, -1);
    down += capsule(xl, cy + 3, bw, hgt * 0.55, 1) + capsule(xr, cy + 3, bw, hgt * 0.55, 1);
    lx.push(xl + bw / 2);
    ly.push(cy - 9 - hgt);
    rx.push(xr + bw / 2);
    ry.push(cy - 9 - hgt);
  }
  const outline = smoothOpen(lx, ly) + smoothOpen(rx, ry);
  // Motes rise from the horizon: a few all the time, a burst on every beat.
  const maxMotes = i.quality ? 120 : 40;
  let spawn = 0;
  if (!i.reduced) {
    s.trickle += dt * (i.quality ? 8 : 4) * (0.4 + i.bass);
    spawn = Math.floor(s.trickle);
    s.trickle -= spawn;
    if (beatStarted(s, i.kick)) spawn += i.quality ? 18 : 7;
  }
  for (let k = 0; k < spawn && s.motes.length < maxMotes; k++) {
    const side = rnd(s) < 0.5 ? -1 : 1;
    const life = 1.4 + rnd(s) * 1.8;
    s.motes.push({
      x: cx + side * (inner + rnd(s) * span),
      y: cy - 2,
      vx: (rnd(s) - 0.5) * 12,
      vy: -(0.04 + rnd(s) * 0.1) * h,
      life,
      max: life,
      size: (i.quality ? 1.6 : 2.2) + rnd(s) * 1.8,
    });
  }
  let motes = '';
  const alive: Mote[] = [];
  for (const p of s.motes) {
    p.x += p.vx * dt;
    p.y += p.vy * dt * (1 + i.bass);
    p.life -= dt;
    if (p.life <= 0) continue;
    alive.push(p);
    const sz = p.size * Math.min(1, p.life / p.max + 0.2);
    motes += rect(p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  s.motes = alive;
  const line = `M${r1(m)} ${r1(cy)}H${r1(cx - cover / 2 - 8)}M${r1(cx + cover / 2 + 8)} ${r1(cy)}H${r1(w - m)}`;
  return { paths: [up, down, line, outline, motes], alphas: [1, 1, 1, 1, 1] };
}

/* ------------------------------------------------------------------ */
/* 3) Oscilloscope: phosphor beam with colour fringe                   */
/* ------------------------------------------------------------------ */

export interface ScopeState {
  hist: string[];
  frame: number;
  peak: number;
  grid: string;
  axes: string;
  screen: string;
  gw: number;
  gh: number;
}

export function initScope(): ScopeState {
  'worklet';
  return { hist: [], frame: 0, peak: 0.1, grid: '', axes: '', screen: '', gw: 0, gh: 0 };
}

export function stepScope(s: ScopeState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, wave } = i;
  if (s.gw !== w || s.gh !== h) {
    let g = '';
    for (let k = 1; k < 10; k++) if (k !== 5) g += `M${r1((w * k) / 10)} 0V${r1(h)}`;
    for (let k = 1; k < 8; k++) if (k !== 4) g += `M0 ${r1((h * k) / 8)}H${r1(w)}`;
    let ticks = '';
    for (let k = 1; k < 50; k++) ticks += `M${r1((w * k) / 50)} ${r1(h / 2 - 3)}v6`;
    for (let k = 1; k < 40; k++) ticks += `M${r1(w / 2 - 3)} ${r1((h * k) / 40)}h6`;
    s.grid = g;
    s.axes = `M${r1(w / 2)} 0V${r1(h)}M0 ${r1(h / 2)}H${r1(w)}${ticks}`;
    s.screen = rect(0, 0, w, h);
    s.gw = w;
    s.gh = h;
  }
  const n = wave.length;
  const m = w * 0.04;
  const cy = h / 2;
  let d = `M${r1(m)} ${r1(cy)}H${r1(w - m)}`;
  let fringe = d;
  if (n >= 16) {
    // Trigger on a rising zero crossing so the trace stands still like on a real scope.
    let start = 0;
    for (let k = 1; k < n * 0.25; k++) {
      if ((wave[k - 1] ?? 0) < 0 && (wave[k] ?? 0) >= 0) {
        start = k;
        break;
      }
    }
    const count = Math.floor(n * 0.7);
    let mx = 0;
    for (let k = 0; k < count; k++) mx = Math.max(mx, Math.abs(wave[start + k] ?? 0));
    // Automatic gain: quiet passages still fill the screen, loud ones don't clip.
    s.peak = Math.max(mx, s.peak * Math.exp(-i.dt / 1.5));
    const amp = ((h * 0.3 * 0.85) / Math.max(0.08, s.peak)) * (1 + i.kick * 0.25);
    const shift = 2.5 + i.kick * 4 + i.bass * 2;
    d = '';
    fringe = '';
    for (let k = 0; k < count; k++) {
      const x = m + (k / (count - 1)) * (w - 2 * m);
      const y = cy - (wave[start + k] ?? 0) * amp;
      d += `${k ? 'L' : 'M'}${r1(x)} ${r1(y)}`;
      fringe += `${k ? 'L' : 'M'}${r1(x + shift)} ${r1(y - shift * 0.6)}`;
    }
  }
  s.frame++;
  if (s.frame % (i.quality ? 3 : 2) === 0) {
    s.hist.unshift(d);
    if (s.hist.length > 3) s.hist.pop();
  }
  return {
    paths: [s.grid, s.hist[0] ?? '', s.hist[1] ?? '', s.hist[2] ?? '', d, fringe, s.axes, s.screen],
    alphas: [1, 1, 1, 1, 1, 1, 1, 1],
  };
}

/* ------------------------------------------------------------------ */
/* 4) Pulsar terrain under a synthwave sun                             */
/* ------------------------------------------------------------------ */

export interface TerrainState extends Seeded {
  rows: number[][];
  live: number[];
  acc: number;
  R: number;
  P: number;
  starsA: string;
  starsB: string;
  sw: number;
  sh: number;
}

export function initTerrain(quality: 0 | 1, seed = 67): TerrainState {
  'worklet';
  const P = quality ? 120 : 56;
  return { seed, rows: [], live: zeros(P), acc: 0, R: quality ? 40 : 22, P, starsA: '', starsB: '', sw: 0, sh: 0 };
}

function terrainLayout(w: number, h: number) {
  'worklet';
  const horizon = h * 0.44;
  const sunR = Math.min(w, h) * 0.2;
  return { horizon, front: h * 1.04, sunR, sunY: horizon - sunR * 0.3 };
}

function terrainRow(vals: number[], p: number, s: TerrainState, w: number, h: number): string {
  'worklet';
  const { horizon, front } = terrainLayout(w, h);
  const k = 18 / s.R;
  const yAt = (q: number) => horizon + (front - horizon) / (1 + Math.max(0, q) * k);
  const z = 1 + p * k;
  const yb = yAt(p);
  const amp = (h * 0.34) / z;
  const wd = (w * 1.15) / z;
  const x0 = (w - wd) / 2;
  const xs: number[] = [-10];
  const ys: number[] = [yb];
  for (let j = 0; j < s.P; j++) {
    xs.push(x0 + (j / (s.P - 1)) * wd);
    ys.push(yb - (vals[j] ?? 0) * amp);
  }
  xs.push(w + 10);
  ys.push(yb);
  // Close below the next row's baseline so the fill hides the rows behind (painter's order).
  const yc = p < 1 ? h + 10 : yAt(p - 1) + 2;
  return `${smoothOpen(xs, ys)}L${r1(w + 10)} ${r1(yc)}L-10 ${r1(yc)}Z`;
}

/** The sun: a disc cut by horizontal gaps that widen towards the horizon. */
function sunPath(cx: number, cy: number, R: number, horizon: number): string {
  'worklet';
  // Gaps only in the visible lower half, getting wider towards the horizon.
  const top = cy - R;
  const start = top + (horizon - top) * 0.42;
  const step = (horizon - start) / 6;
  const cuts: [number, number][] = [];
  for (let g = 0; g < 6; g++) {
    const y = start + g * step;
    cuts.push([y, y + step * (0.15 + g * 0.11)]);
  }
  let d = '';
  let y0 = cy - R;
  const half = (y: number) => Math.sqrt(Math.max(0, R * R - (y - cy) * (y - cy)));
  const segment = (a: number, b: number) => {
    if (b - a < 0.5) return;
    let left = '';
    let right = '';
    for (let k = 0; k <= 4; k++) {
      const y = a + ((b - a) * k) / 4;
      const hw = half(y);
      left += `${k ? 'L' : 'M'}${r1(cx - hw)} ${r1(y)}`;
      right = `L${r1(cx + hw)} ${r1(y)}` + right;
    }
    d += `${left}${right}Z`;
  };
  for (const [a, b] of cuts) {
    if (a >= horizon) break;
    segment(y0, Math.min(a, horizon));
    y0 = b;
  }
  if (y0 < horizon) segment(y0, Math.min(cy + R, horizon));
  return d;
}

export function stepTerrain(s: TerrainState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, t } = i;
  const { horizon, sunR, sunY } = terrainLayout(w, h);
  if (s.sw !== w || s.sh !== h) {
    let a = '';
    let b = '';
    const count = i.quality ? 170 : 70;
    for (let k = 0; k < count; k++) {
      const x = rnd(s) * w;
      const y = Math.pow(rnd(s), 1.4) * horizon * 0.95;
      const size = 0.6 + rnd(s) * (i.quality ? 1.4 : 1.8);
      if (k % 2) a += rect(x, y, size, size);
      else b += rect(x, y, size, size);
    }
    s.starsA = a;
    s.starsB = b;
    s.sw = w;
    s.sh = h;
  }
  for (let j = 0; j < s.P; j++) {
    const x = j / (s.P - 1);
    const win = Math.exp(-(((x - 0.5) / 0.26) ** 2));
    const band = sampleLevel(i.levels, Math.abs(x - 0.5) * 2 * 0.9);
    const noise = 0.5 + 0.5 * Math.sin(j * 1.9 + t * 1.3) * Math.sin(j * 0.7 - t * 0.9);
    const ridge = 0.5 + 0.5 * Math.sin(j * 0.45 + 1.7) * Math.cos(j * 0.23 - 0.4);
    s.live[j] = win * (0.04 + 0.08 * noise + band * 0.95 * (1 + i.kick * 0.25)) + (1 - win) * ridge * (0.05 + i.bass * 0.06);
  }
  const rate = (i.quality ? 12 : 9) * (i.reduced ? 0.5 : 1);
  s.acc += i.dt * rate;
  while (s.acc >= 1) {
    s.acc -= 1;
    s.rows.unshift(s.live.slice());
    if (s.rows.length > s.R) s.rows.pop();
  }
  const pulse = i.reduced ? 1 : 1 + i.bass * 0.04 + i.kick * 0.04;
  const twinkle = i.reduced ? 0 : 1;
  const paths: string[] = [
    rect(0, 0, w, h),
    sunPath(w / 2, sunY, sunR * pulse, horizon),
    s.starsA,
    s.starsB,
    `M0 ${r1(horizon)}H${r1(w)}`,
  ];
  const alphas: number[] = [1, 1, 0.55 + 0.35 * Math.sin(t * 1.3) * twinkle, 0.55 + 0.35 * Math.cos(t * 1.7) * twinkle, 1];
  // History rows from the back (oldest) to the front, then the live row.
  for (let k = 0; k < s.R; k++) {
    const idx = s.R - 1 - k;
    const row = s.rows[idx];
    if (!row) {
      paths.push('');
      alphas.push(0);
      continue;
    }
    const p = idx + s.acc;
    paths.push(terrainRow(row, p, s, w, h));
    alphas.push(Math.max(0, Math.min(1, s.R - p)) * (0.3 + 0.7 * (1 - p / s.R)));
  }
  paths.push(terrainRow(s.live, 0, s, w, h));
  alphas.push(1);
  return { paths, alphas };
}

/** Index of the first terrain row path (after sky, sun, stars and horizon). */
export const TERRAIN_ROWS_AT = 5;

/* ------------------------------------------------------------------ */
/* 5) Warp tunnel: twisting wireframe tube, star streaks, shockwaves   */
/* ------------------------------------------------------------------ */

export interface TunnelState extends Seeded {
  z: number[];
  sa: number[];
  sz: number[];
  shocks: number[];
  prevKick: number;
  M: number;
}

export function initTunnel(quality: 0 | 1, seed = 17): TunnelState {
  'worklet';
  const s: TunnelState = { seed, z: [], sa: [], sz: [], shocks: [], prevKick: 0, M: quality ? 54 : 36 };
  const n = quality ? 22 : 14;
  for (let k = 0; k < n; k++) s.z.push((k + 1) / n);
  const stars = quality ? 160 : 50;
  for (let k = 0; k < stars; k++) {
    s.sa.push(rnd(s) * Math.PI * 2);
    s.sz.push(0.05 + rnd(s) * 0.95);
  }
  return s;
}

function hexAt(local: number): number {
  'worklet';
  const sector = Math.PI / 3;
  let l = local % sector;
  if (l < 0) l += sector;
  return Math.cos(Math.PI / 6) / Math.cos(l - Math.PI / 6);
}

export function stepTunnel(s: TunnelState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, t, dt } = i;
  const cx = w / 2;
  const cy = h / 2;
  const R0 = Math.min(w, h) * 0.06;
  const diag = Math.hypot(cx, cy) * 1.15;
  const speed = (0.22 + i.bass * 0.9 + i.kick * 1.8) * (i.reduced ? 0.4 : 1);
  // The whole tube twists: deeper rings are turned further.
  const twist = (z: number) => t * 0.22 + z * 1.7;
  for (let k = 0; k < s.z.length; k++) {
    let z = s.z[k]! - speed * dt * 0.5;
    if (z < 0.07) z += 0.93;
    s.z[k] = z;
  }
  const order = s.z
    .map((z, k) => [z, k] as [number, number])
    .sort((a, b) => b[0] - a[0])
    .map((e) => e[1]);
  const groups = ['', '', ''];
  const corners: string[] = ['', '', '', '', '', ''];
  const started: boolean[] = [false, false, false, false, false, false];
  for (const k of order) {
    const z = s.z[k]!;
    const base = R0 / z;
    if (base * 0.85 > diag) continue;
    const near = 1 - z;
    const turn = twist(z);
    let d = '';
    for (let j = 0; j <= s.M; j++) {
      const u = (j % s.M) / s.M;
      const th = u * Math.PI * 2 - Math.PI / 2;
      const v = sampleLevel(i.levels, 1 - Math.abs(Math.cos(Math.PI * u)));
      // Far rings show the spectrum most; near (huge) ones only breathe, so the view stays clean.
      const r = base * hexAt(th - turn) * (1 + 0.3 * v * (0.25 + 0.75 * Math.min(1, z * 1.6)) * Math.min(1, near * 3));
      d += `${j ? 'L' : 'M'}${r1(cx + Math.cos(th) * r)} ${r1(cy + Math.sin(th) * r)}`;
    }
    groups[z > 0.66 ? 0 : z > 0.33 ? 1 : 2] += d;
    // Wireframe: the hexagon corners joined along the tube.
    for (let c = 0; c < 6; c++) {
      const th = turn + (c * Math.PI) / 3;
      const r = base * (1 + 0.2 * near * sampleLevel(i.levels, c / 6));
      corners[c] += `${started[c] ? 'L' : 'M'}${r1(cx + Math.cos(th) * r)} ${r1(cy + Math.sin(th) * r)}`;
      started[c] = true;
    }
  }
  let stars = '';
  for (let k = 0; k < s.sa.length; k++) {
    let z = s.sz[k]! - speed * dt * 0.8;
    if (z < 0.05) {
      z += 0.95;
      s.sa[k] = rnd(s) * Math.PI * 2;
    }
    s.sz[k] = z;
    const r2 = (R0 * 1.4) / z;
    if (r2 > diag) continue;
    const r1v = (R0 * 1.4) / (z + 0.04 + speed * 0.06);
    const a = s.sa[k]!;
    stars += `M${r1(cx + Math.cos(a) * r1v)} ${r1(cy + Math.sin(a) * r1v)}L${r1(cx + Math.cos(a) * r2)} ${r1(cy + Math.sin(a) * r2)}`;
  }
  // Shockwave hexagons racing outwards on every beat.
  if (!i.reduced && beatStarted(s, i.kick)) s.shocks.push(0);
  let shock = '';
  let youngest = 1;
  const alive: number[] = [];
  for (const age0 of s.shocks) {
    const age = age0 + dt;
    if (age > 0.7) continue;
    alive.push(age);
    youngest = Math.min(youngest, age / 0.7);
    const r = R0 * 1.6 + (age / 0.7) ** 0.8 * diag;
    const turn = t * 0.22;
    for (let j = 0; j <= 36; j++) {
      const th = ((j % 36) / 36) * Math.PI * 2;
      const rr = r * hexAt(th - turn);
      shock += `${j ? 'L' : 'M'}${r1(cx + Math.cos(th) * rr)} ${r1(cy + Math.sin(th) * rr)}`;
    }
  }
  s.shocks = alive;
  return {
    paths: [rect(0, 0, w, h), stars, groups[0]!, groups[1]!, groups[2]!, corners.join(''), shock],
    alphas: [1, 1, 1, 1, 1, 1, alive.length ? 1 - youngest : 0],
  };
}

/* ------------------------------------------------------------------ */
/* 6) Galaxy: tilted spiral, glowing core, nebula dust, shockwaves      */
/* ------------------------------------------------------------------ */

export interface GalaxyState extends Seeded {
  r: number[];
  a: number[];
  size: number[];
  dust: number[];
  bgA: string;
  bgB: string;
  bw: number;
  bh: number;
  shocks: number[];
  prevKick: number;
}

export function initGalaxy(quality: 0 | 1, seed = 29): GalaxyState {
  'worklet';
  const s: GalaxyState = { seed, r: [], a: [], size: [], dust: [], bgA: '', bgB: '', bw: 0, bh: 0, shocks: [], prevKick: 0 };
  const n = quality ? 5200 : 520;
  for (let k = 0; k < n; k++) {
    const r = Math.pow(rnd(s), 0.75);
    const spread = (rnd(s) - 0.5) * (0.9 - r * 0.5);
    const isDust = rnd(s) < 0.06 ? 1 : 0;
    s.r.push(r);
    s.a.push(((k % 3) * Math.PI * 2) / 3 + spread);
    s.dust.push(isDust);
    s.size.push(isDust ? (quality ? 6 : 8) + rnd(s) * 10 : quality ? 0.8 + rnd(s) * 1.7 : 1.3 + rnd(s) * 2);
  }
  return s;
}

function galaxyRadius(w: number, h: number) {
  'worklet';
  // Portrait screens let the arms reach a little past the edges.
  return Math.min(w < h ? w * 0.62 : w * 0.47, (h * 0.47) / 0.5);
}

export function stepGalaxy(s: GalaxyState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, t, dt } = i;
  const cx = w / 2;
  const cy = h / 2;
  if (s.bw !== w || s.bh !== h) {
    let a = '';
    let b = '';
    const count = i.quality ? 260 : 90;
    for (let k = 0; k < count; k++) {
      const size = 0.6 + rnd(s) * (i.quality ? 1.3 : 1.7);
      const sq = rect(rnd(s) * w, rnd(s) * h, size, size);
      if (k % 2) a += sq;
      else b += sq;
    }
    s.bgA = a;
    s.bgB = b;
    s.bw = w;
    s.bh = h;
  }
  const still = i.reduced ? 0 : 1;
  const tilt = 0.5 + 0.1 * Math.sin(t * 0.07) * still;
  const phi = t * 0.03 * still;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const rMax = galaxyRadius(w, h);
  const spin = (0.05 + i.bass * 0.22 + i.kick * 0.3) * (i.reduced ? 0.3 : 1);
  const high = sampleLevel(i.levels, 0.8);
  const mid = sampleLevel(i.levels, 0.45);
  const expand = 1 + i.bass * 0.1 + i.kick * 0.08;
  let outer = '';
  let middle = '';
  let core = '';
  let dust = '';
  for (let k = 0; k < s.r.length; k++) {
    const r = s.r[k]!;
    const a = s.a[k]! + (spin * dt) / (0.25 + r);
    s.a[k] = a;
    const th = a + r * 3.4;
    const R = r * rMax * expand;
    const x0 = Math.cos(th) * R;
    const y0 = Math.sin(th) * R * tilt;
    const x = cx + x0 * cp - y0 * sp;
    const y = cy + x0 * sp + y0 * cp;
    if (s.dust[k]) {
      const size = s.size[k]! * (1 + i.bass * 0.3);
      dust += rect(x - size / 2, y - size / 2, size, size);
      continue;
    }
    const tw = 0.5 + 0.5 * Math.sin(t * 5 + k * 1.7);
    const size = s.size[k]! * (1 + high * 1.6 * tw + (r < 0.3 ? mid * 0.6 : 0));
    const sq = rect(x - size / 2, y - size / 2, size, size);
    if (r < 0.2) core += sq;
    else if (r < 0.5) middle += sq;
    else outer += sq;
  }
  // A ring of light running through the disc on every beat.
  if (!i.reduced && beatStarted(s, i.kick)) s.shocks.push(0);
  let shock = '';
  let youngest = 1;
  const alive: number[] = [];
  for (const age0 of s.shocks) {
    const age = age0 + dt;
    if (age > 0.9) continue;
    alive.push(age);
    youngest = Math.min(youngest, age / 0.9);
    const rr = (0.08 + (age / 0.9) * 1.2) * rMax;
    for (let j = 0; j <= 48; j++) {
      const th = ((j % 48) / 48) * Math.PI * 2;
      const x0 = Math.cos(th) * rr;
      const y0 = Math.sin(th) * rr * tilt;
      shock += `${j ? 'L' : 'M'}${r1(cx + x0 * cp - y0 * sp)} ${r1(cy + x0 * sp + y0 * cp)}`;
    }
  }
  s.shocks = alive;
  const tw = i.reduced ? 0 : 1;
  return {
    paths: [rect(0, 0, w, h), s.bgA, s.bgB, dust, outer, middle, core, shock],
    alphas: [1, 0.5 + 0.35 * Math.sin(t * 1.1) * tw, 0.5 + 0.35 * Math.cos(t * 1.5) * tw, 1, 1, 1, 1, alive.length ? 1 - youngest : 0],
  };
}

/* ------------------------------------------------------------------ */
/* registry                                                            */
/* ------------------------------------------------------------------ */

export type PathSceneState = BarsState | MirrorState | ScopeState | TerrainState | TunnelState | GalaxyState;

export const PATH_SCENES: Record<PathSceneId, PathSceneInfo> = {
  bars: {
    trails: 0,
    trailZoom: 1,
    bloom: 0.55,
    gradients: (w, h, q) => {
      const { m, base, maxH } = barsLayout(w, h, q ? 72 : 36);
      return {
        barGrad: { kind: 'linear', x1: 0, y1: base, x2: 0, y2: base - maxH, stops: [[0, 'c1', 1], [0.65, 'c2', 1], [1, 'c2light', 1]] },
        reflGrad: { kind: 'linear', x1: 0, y1: base, x2: 0, y2: base + h * 0.22, stops: [[0, 'mix', 0.42], [1, 'mix', 0]] },
        floorGrad: { kind: 'linear', x1: m, y1: 0, x2: w - m, y2: 0, stops: [[0, 'c2', 0], [0.5, 'c1light', 1], [1, 'c2', 0]] },
      };
    },
    slots: (q) => [
      { path: 2, mode: 'fill', paint: 'reflGrad', alpha: 1 },
      { path: 0, mode: 'stroke', paint: 'barGrad', width: q ? 10 : 8, alpha: 0.1, boost: 1.4, add: true },
      { path: 0, mode: 'fill', paint: 'barGrad', alpha: 1 },
      { path: 4, mode: 'stroke', paint: 'floorGrad', width: 8, alpha: 0.25, boost: 1, add: true },
      { path: 4, mode: 'stroke', paint: 'floorGrad', width: 1.5, alpha: 1 },
      { path: 1, mode: 'stroke', paint: 'c2light', width: 6, alpha: 0.18, boost: 1, add: true },
      { path: 1, mode: 'fill', paint: 'white', alpha: 0.95 },
      { path: 3, mode: 'fill', paint: 'c2light', alpha: 0.95, add: true },
    ],
  },
  mirror: {
    trails: 0,
    trailZoom: 1,
    bloom: 0.5,
    gradients: (w, h) => {
      const cy = h / 2;
      const maxH = h * 0.34;
      return {
        mUp: { kind: 'linear', x1: 0, y1: cy, x2: 0, y2: cy - maxH, stops: [[0, 'c1', 1], [1, 'c2', 1]] },
        mDown: { kind: 'linear', x1: 0, y1: cy, x2: 0, y2: cy + maxH * 0.6, stops: [[0, 'mix', 0.45], [1, 'mix', 0]] },
        horizon: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: 0, stops: [[0, 'c2', 0], [0.25, 'c1light', 1], [0.75, 'c1light', 1], [1, 'c2', 0]] },
      };
    },
    slots: () => [
      { path: 1, mode: 'fill', paint: 'mDown', alpha: 1 },
      { path: 0, mode: 'stroke', paint: 'mUp', width: 8, alpha: 0.1, boost: 1.4, add: true },
      { path: 0, mode: 'fill', paint: 'mUp', alpha: 1 },
      { path: 3, mode: 'stroke', paint: 'white', width: 6, alpha: 0.1, boost: 1, add: true },
      { path: 3, mode: 'stroke', paint: 'c2light', width: 1.4, alpha: 0.8 },
      { path: 2, mode: 'stroke', paint: 'horizon', width: 8, alpha: 0.3, boost: 1, add: true },
      { path: 2, mode: 'stroke', paint: 'horizon', width: 1.5, alpha: 1 },
      { path: 4, mode: 'fill', paint: 'c2light', alpha: 0.9, add: true },
    ],
  },
  scope: {
    trails: 0.8,
    trailZoom: 1,
    bloom: 0.6,
    gradients: (w, h) => ({
      beam: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: 0, stops: [[0, 'c2', 1], [0.5, 'c1', 1], [1, 'c2', 1]] },
      beamCore: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: 0, stops: [[0, 'c2light', 1], [0.5, 'c1light', 1], [1, 'c2light', 1]] },
      screen: { kind: 'radial', cx: w / 2, cy: h / 2, r: Math.max(w, h) * 0.7, stops: [[0, 'mix', 0.2], [1, 'mix', 0]] },
    }),
    slots: (q) => [
      { path: 7, mode: 'fill', paint: 'screen', alpha: 1, back: true },
      { path: 0, mode: 'stroke', paint: 'white', width: 1, alpha: 0.06, back: true },
      { path: 6, mode: 'stroke', paint: 'white', width: 1, alpha: 0.14, back: true },
      // Mobile has no feedback trails: older traces stand in for the phosphor afterglow.
      ...(q
        ? []
        : ([
            { path: 3, mode: 'stroke', paint: 'beam', width: 1.5, alpha: 0.1 },
            { path: 2, mode: 'stroke', paint: 'beam', width: 1.5, alpha: 0.18 },
            { path: 1, mode: 'stroke', paint: 'beam', width: 1.5, alpha: 0.28 },
          ] satisfies SceneSlot[])),
      { path: 5, mode: 'stroke', paint: 'c2', width: 2, alpha: 0.4, boost: 0.5, add: true },
      { path: 4, mode: 'stroke', paint: 'beam', width: 14, alpha: 0.08, boost: 1, add: true },
      { path: 4, mode: 'stroke', paint: 'beam', width: 5, alpha: 0.3, boost: 0.6, add: true },
      { path: 4, mode: 'stroke', paint: 'beamCore', width: 2, alpha: 1 },
    ],
  },
  terrain: {
    trails: 0,
    trailZoom: 1,
    bloom: 0.55,
    gradients: (w, h) => {
      const { horizon, sunR, sunY } = terrainLayout(w, h);
      return {
        sky: { kind: 'radial', cx: w / 2, cy: sunY, r: Math.max(w, h) * 0.65, stops: [[0, 'c1', 0.5], [0.35, 'c2', 0.22], [1, 'dark', 1]] },
        sun: { kind: 'linear', x1: 0, y1: sunY - sunR, x2: 0, y2: horizon, stops: [[0, 'c2light', 1], [0.55, 'c2', 1], [1, 'c1', 1]] },
        horizonLine: { kind: 'linear', x1: 0, y1: 0, x2: w, y2: 0, stops: [[0, 'c2', 0], [0.5, 'c1light', 1], [1, 'c2', 0]] },
        rowStroke: { kind: 'linear', x1: 0, y1: horizon, x2: 0, y2: h, stops: [[0, 'c2', 1], [1, 'c1light', 1]] },
        rowFill: { kind: 'linear', x1: 0, y1: horizon, x2: 0, y2: h, stops: [[0, 'dark', 1], [1, 'black', 1]] },
      };
    },
    slots: (q) => {
      const R = q ? 40 : 22;
      const out: SceneSlot[] = [
        { path: 0, mode: 'fill', paint: 'sky', alpha: 1, back: true },
        { path: 2, mode: 'fill', paint: 'white', alpha: 1, back: true },
        { path: 3, mode: 'fill', paint: 'white', alpha: 1, back: true },
        { path: 1, mode: 'stroke', paint: 'sun', width: 14, alpha: 0.14, boost: 0.8, back: true },
        { path: 1, mode: 'fill', paint: 'sun', alpha: 1, boost: 0.2, back: true },
        { path: 4, mode: 'stroke', paint: 'horizonLine', width: 10, alpha: 0.3, boost: 1, back: true },
        { path: 4, mode: 'stroke', paint: 'horizonLine', width: 2, alpha: 1, back: true },
      ];
      for (let k = 0; k < R; k++) out.push({ path: TERRAIN_ROWS_AT + k, mode: 'both', paint: 'rowStroke', fill: 'rowFill', width: q ? 1.4 : 1.3, alpha: 1 });
      out.push({ path: TERRAIN_ROWS_AT + R, mode: 'both', paint: 'rowStroke', fill: 'rowFill', width: 2.2, alpha: 1, boost: 0.3 });
      out.push({ path: TERRAIN_ROWS_AT + R, mode: 'stroke', paint: 'rowStroke', width: 9, alpha: 0.15, boost: 1, add: true });
      return out;
    },
  },
  tunnel: {
    trails: 0.55,
    trailZoom: 1.03,
    bloom: 0.6,
    gradients: (w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      return {
        depth: { kind: 'radial', cx, cy, r: Math.hypot(cx, cy), stops: [[0, 'c2light', 1], [0.2, 'c2', 1], [0.65, 'c1', 1], [1, 'c1light', 1]] },
        coreGlow: { kind: 'radial', cx, cy, r: Math.min(w, h) * 0.35, stops: [[0, 'white', 0.5], [0.3, 'c2', 0.35], [1, 'c2', 0]] },
      };
    },
    slots: () => [
      { path: 0, mode: 'fill', paint: 'coreGlow', alpha: 1, boost: 0.6, back: true },
      { path: 1, mode: 'stroke', paint: 'depth', width: 1.2, alpha: 0.6, add: true },
      { path: 5, mode: 'stroke', paint: 'depth', width: 1, alpha: 0.35 },
      { path: 2, mode: 'stroke', paint: 'depth', width: 1.2, alpha: 0.3 },
      { path: 3, mode: 'stroke', paint: 'depth', width: 1.8, alpha: 0.6 },
      { path: 4, mode: 'stroke', paint: 'depth', width: 10, alpha: 0.1, boost: 1.2, add: true },
      { path: 4, mode: 'stroke', paint: 'depth', width: 2.6, alpha: 0.95 },
      { path: 6, mode: 'stroke', paint: 'white', width: 8, alpha: 0.2, add: true },
      { path: 6, mode: 'stroke', paint: 'white', width: 2, alpha: 0.9 },
    ],
  },
  galaxy: {
    trails: 0.6,
    trailZoom: 1,
    bloom: 0.7,
    gradients: (w, h) => ({
      galCore: {
        kind: 'radial',
        cx: w / 2,
        cy: h / 2,
        r: galaxyRadius(w, h) * 0.55,
        stops: [[0, 'white', 0.55], [0.12, 'c2light', 0.45], [0.45, 'c2', 0.15], [1, 'c1', 0]],
      },
    }),
    slots: () => [
      { path: 0, mode: 'fill', paint: 'galCore', alpha: 1, boost: 0.5, back: true },
      { path: 1, mode: 'fill', paint: 'white', alpha: 1, back: true },
      { path: 2, mode: 'fill', paint: 'white', alpha: 1, back: true },
      { path: 3, mode: 'fill', paint: 'mix', alpha: 0.07, add: true },
      { path: 4, mode: 'fill', paint: 'c1', alpha: 0.85, boost: 0.3, add: true },
      { path: 5, mode: 'fill', paint: 'c2', alpha: 0.9, boost: 0.3, add: true },
      { path: 6, mode: 'fill', paint: 'c2light', alpha: 0.95, add: true },
      { path: 7, mode: 'stroke', paint: 'c2light', width: 6, alpha: 0.15, add: true },
      { path: 7, mode: 'stroke', paint: 'white', width: 1.5, alpha: 0.8 },
    ],
  },
};

export function isPathScene(id: string): id is PathSceneId {
  return id in PATH_SCENES;
}

export function initPathScene(id: PathSceneId, quality: 0 | 1): PathSceneState {
  'worklet';
  switch (id) {
    case 'bars':
      return initBars(quality);
    case 'mirror':
      return initMirror(quality);
    case 'scope':
      return initScope();
    case 'terrain':
      return initTerrain(quality);
    case 'tunnel':
      return initTunnel(quality);
    default:
      return initGalaxy(quality);
  }
}

export function stepPathScene(id: PathSceneId, state: PathSceneState, input: SceneInput): SceneOutput {
  'worklet';
  switch (id) {
    case 'bars':
      return stepBars(state as BarsState, input);
    case 'mirror':
      return stepMirror(state as MirrorState, input);
    case 'scope':
      return stepScope(state as ScopeState, input);
    case 'terrain':
      return stepTerrain(state as TerrainState, input);
    case 'tunnel':
      return stepTunnel(state as TunnelState, input);
    default:
      return stepGalaxy(state as GalaxyState, input);
  }
}
