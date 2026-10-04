/**
 * Visualizer scenes shared by the desktop and mobile apps.
 *
 * Each scene turns the analysed audio into SVG path strings plus a static list
 * of "slots" saying how to paint them. Desktop draws the strings with Path2D
 * on a canvas, mobile feeds them to react-native-svg from a Reanimated frame
 * callback — so every function here is a worklet (the directive is a no-op
 * string elsewhere) and only uses plain arrays/objects.
 */

export type ScenePaint = 'c1' | 'c2' | 'gradV' | 'gradH' | 'gradD' | 'core' | 'white';

/** How to paint one path. Several slots may paint the same path (glow under a core line). */
export interface SceneSlot {
  path: number;
  /** `both` = fill with the dark background (occludes what's behind), then stroke. */
  mode: 'stroke' | 'fill' | 'both';
  paint: ScenePaint;
  /** stroke width in CSS px / dp */
  width?: number;
  alpha: number;
  /** extra alpha on a beat: alpha × (1 + kick × boost) */
  boost?: number;
  /** additive blending (desktop only; plain alpha on mobile) */
  add?: boolean;
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
  /** desktop motion trails: how much of the previous frame stays (0 = none) and its zoom */
  trails: number;
  trailZoom: number;
}

export const BG_COLOR = '#07070c';

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

/* ------------------------------------------------------------------ */
/* 1) Spectrum bars with falling peak caps (Winamp)                    */
/* ------------------------------------------------------------------ */

export interface BarsState {
  n: number;
  peak: number[];
  vel: number[];
}

export function initBars(quality: 0 | 1): BarsState {
  'worklet';
  const n = quality ? 64 : 32;
  return { n, peak: zeros(n), vel: zeros(n) };
}

export function stepBars(s: BarsState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, dt } = i;
  const m = w * 0.06;
  const bw = (w - 2 * m) / (s.n * 1.25 - 0.25);
  const gap = bw * 0.25;
  const base = h * 0.72;
  const maxH = h * 0.55;
  const gravity = h * 1.8;
  let bars = '';
  let caps = '';
  let refl = '';
  for (let k = 0; k < s.n; k++) {
    const v = Math.min(1, sampleLevel(i.levels, k / (s.n - 1)) * (1 + i.kick * 0.15));
    const hgt = Math.max(2, v * maxH);
    if (hgt >= s.peak[k]!) {
      s.peak[k] = hgt;
      s.vel[k] = 0;
    } else {
      s.vel[k] = s.vel[k]! + gravity * dt;
      s.peak[k] = Math.max(hgt, s.peak[k]! - s.vel[k]! * dt);
    }
    const x = m + k * (bw + gap);
    bars += rect(x, base - hgt, bw, hgt);
    refl += rect(x, base + 3, bw, hgt * 0.35);
    caps += rect(x, base - s.peak[k]! - 6, bw, 3);
  }
  return { paths: [bars, caps, refl], alphas: [1, 1, 1] };
}

/* ------------------------------------------------------------------ */
/* 2) Mirror horizon: bars left/right of the cover, mirrored below      */
/* ------------------------------------------------------------------ */

export interface MirrorState {
  n: number;
}

export function initMirror(quality: 0 | 1): MirrorState {
  'worklet';
  return { n: quality ? 40 : 16 };
}

export function stepMirror(s: MirrorState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h } = i;
  const cx = w / 2;
  const cy = h / 2;
  const cover = Math.min(w, h) * 0.3;
  const m = w * 0.04;
  const inner = cover / 2 + 14;
  const span = w / 2 - m - inner;
  const bw = span / (s.n * 1.35 - 0.35);
  const gap = bw * 0.35;
  let up = '';
  let down = '';
  for (let k = 0; k < s.n; k++) {
    const v = sampleLevel(i.levels, (k / Math.max(1, s.n - 1)) * 0.92);
    const hgt = Math.max(2, v * h * 0.34 * (1 + i.kick * 0.12));
    const off = inner + k * (bw + gap);
    for (let side = 0; side < 2; side++) {
      const x = side ? cx + off : cx - off - bw;
      up += rect(x, cy - 3 - hgt, bw, hgt);
      down += rect(x, cy + 3, bw, hgt * 0.55);
    }
  }
  const line = `M${r1(m)} ${r1(cy)}H${r1(cx - cover / 2 - 6)}M${r1(cx + cover / 2 + 6)} ${r1(cy)}H${r1(w - m)}`;
  return { paths: [up, down, line], alphas: [1, 1, 1] };
}

/* ------------------------------------------------------------------ */
/* 3) Oscilloscope with phosphor afterglow                             */
/* ------------------------------------------------------------------ */

export interface ScopeState {
  hist: string[];
  frame: number;
  peak: number;
  grid: string;
  gw: number;
  gh: number;
}

export function initScope(): ScopeState {
  'worklet';
  return { hist: [], frame: 0, peak: 0.1, grid: '', gw: 0, gh: 0 };
}

export function stepScope(s: ScopeState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, wave } = i;
  if (s.gw !== w || s.gh !== h) {
    let g = '';
    for (let k = 1; k < 10; k++) g += `M${r1((w * k) / 10)} 0V${r1(h)}`;
    for (let k = 1; k < 8; k++) g += `M0 ${r1((h * k) / 8)}H${r1(w)}`;
    s.grid = g;
    s.gw = w;
    s.gh = h;
  }
  const n = wave.length;
  const m = w * 0.04;
  const cy = h / 2;
  let d = `M${r1(m)} ${r1(cy)}H${r1(w - m)}`;
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
    const amp = ((h * 0.32 * 0.85) / Math.max(0.08, s.peak)) * (1 + i.kick * 0.25);
    d = '';
    for (let k = 0; k < count; k++) {
      const x = m + (k / (count - 1)) * (w - 2 * m);
      const y = cy - (wave[start + k] ?? 0) * amp;
      d += `${k ? 'L' : 'M'}${r1(x)} ${r1(y)}`;
    }
  }
  s.frame++;
  if (s.frame % (i.quality ? 3 : 2) === 0) {
    s.hist.unshift(d);
    if (s.hist.length > 3) s.hist.pop();
  }
  return { paths: [s.grid, s.hist[0] ?? '', s.hist[1] ?? '', s.hist[2] ?? '', d], alphas: [1, 1, 1, 1, 1] };
}

/* ------------------------------------------------------------------ */
/* 4) Pulsar terrain (Joy Division): scrolling spectrum history        */
/* ------------------------------------------------------------------ */

export interface TerrainState {
  rows: number[][];
  live: number[];
  acc: number;
  R: number;
  P: number;
}

export function initTerrain(quality: 0 | 1): TerrainState {
  'worklet';
  const P = quality ? 96 : 48;
  return { rows: [], live: zeros(P), acc: 0, R: quality ? 34 : 18, P };
}

function terrainRow(vals: number[], p: number, s: TerrainState, w: number, h: number): string {
  'worklet';
  const horizon = h * 0.12;
  const front = h * 0.84;
  const k = 3 / s.R;
  const yAt = (q: number) => horizon + (front - horizon) / (1 + Math.max(0, q) * k);
  const z = 1 + p * k;
  const yb = yAt(p);
  const amp = (h * 0.3) / z;
  const wd = (w * 0.9) / z;
  const x0 = (w - wd) / 2;
  let d = `M-10 ${r1(yb)}L${r1(x0)} ${r1(yb)}`;
  for (let j = 0; j < s.P; j++) d += `L${r1(x0 + (j / (s.P - 1)) * wd)} ${r1(yb - (vals[j] ?? 0) * amp)}`;
  // Close below the next row's baseline so the fill hides the rows behind (painter's order).
  const yc = p < 1 ? h + 10 : yAt(p - 1) + 2;
  return `${d}L${r1(w + 10)} ${r1(yb)}L${r1(w + 10)} ${r1(yc)}L-10 ${r1(yc)}Z`;
}

export function stepTerrain(s: TerrainState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, t } = i;
  for (let j = 0; j < s.P; j++) {
    const x = j / (s.P - 1);
    const win = Math.exp(-(((x - 0.5) / 0.2) ** 2));
    const band = sampleLevel(i.levels, Math.abs(x - 0.5) * 2 * 0.9);
    const noise = 0.5 + 0.5 * Math.sin(j * 1.9 + t * 1.3) * Math.sin(j * 0.7 - t * 0.9);
    s.live[j] = win * (0.05 + 0.1 * noise + band * 0.9 * (1 + i.kick * 0.2));
  }
  const rate = (i.quality ? 12 : 9) * (i.reduced ? 0.5 : 1);
  s.acc += i.dt * rate;
  while (s.acc >= 1) {
    s.acc -= 1;
    s.rows.unshift(s.live.slice());
    if (s.rows.length > s.R) s.rows.pop();
  }
  const paths: string[] = [];
  const alphas: number[] = [];
  // Slots 0…R−1: history from the back (oldest) to the front; slot R: the live row.
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
    alphas.push(Math.max(0, Math.min(1, (s.R - p) / 1.5)) * (0.3 + 0.7 * (1 - p / s.R)));
  }
  paths.push(terrainRow(s.live, 0, s, w, h));
  alphas.push(1);
  return { paths, alphas };
}

/* ------------------------------------------------------------------ */
/* 5) Warp tunnel: hexagons flying at the viewer + star streaks         */
/* ------------------------------------------------------------------ */

export interface TunnelState extends Seeded {
  z: number[];
  rot: number[];
  sa: number[];
  sz: number[];
  M: number;
}

export function initTunnel(quality: 0 | 1, seed = 17): TunnelState {
  'worklet';
  const s: TunnelState = { seed, z: [], rot: [], sa: [], sz: [], M: quality ? 72 : 40 };
  const n = quality ? 24 : 14;
  for (let k = 0; k < n; k++) {
    s.z.push((k + 1) / n);
    s.rot.push(rnd(s) * Math.PI);
  }
  const stars = quality ? 110 : 40;
  for (let k = 0; k < stars; k++) {
    s.sa.push(rnd(s) * Math.PI * 2);
    s.sz.push(0.05 + rnd(s) * 0.95);
  }
  return s;
}

export function stepTunnel(s: TunnelState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, t, dt } = i;
  const cx = w / 2;
  const cy = h / 2;
  const R0 = Math.min(w, h) * 0.06;
  const diag = Math.hypot(cx, cy) * 1.15;
  const speed = (0.22 + i.bass * 0.9 + i.kick * 1.8) * (i.reduced ? 0.4 : 1);
  const groups = ['', '', '', '', '', ''];
  const sector = Math.PI / 3;
  for (let k = 0; k < s.z.length; k++) {
    let z = s.z[k]! - speed * dt * 0.5;
    if (z < 0.07) {
      z += 0.93;
      s.rot[k] = rnd(s) * Math.PI;
    }
    s.z[k] = z;
    const base = R0 / z;
    if (base * 0.85 > diag) continue;
    const near = 1 - z;
    const turn = s.rot[k]! + t * 0.15 * (k % 2 ? 1 : -1);
    let d = '';
    for (let j = 0; j <= s.M; j++) {
      const u = (j % s.M) / s.M;
      const th = u * Math.PI * 2 - Math.PI / 2;
      let local = (th - turn) % sector;
      if (local < 0) local += sector;
      const hex = Math.cos(Math.PI / 6) / Math.cos(local - Math.PI / 6);
      const v = sampleLevel(i.levels, 1 - Math.abs(Math.cos(Math.PI * u)));
      const r = base * hex * (1 + 0.35 * near * v);
      d += `${j ? 'L' : 'M'}${r1(cx + Math.cos(th) * r)} ${r1(cy + Math.sin(th) * r)}`;
    }
    const bucket = z > 0.6 ? 0 : z > 0.3 ? 2 : 4;
    groups[bucket + (k % 2)] += d;
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
    const r1v = (R0 * 1.4) / (z + 0.04 + speed * 0.05);
    const a = s.sa[k]!;
    stars += `M${r1(cx + Math.cos(a) * r1v)} ${r1(cy + Math.sin(a) * r1v)}L${r1(cx + Math.cos(a) * r2)} ${r1(cy + Math.sin(a) * r2)}`;
  }
  return { paths: [stars, ...groups], alphas: [1, 1, 1, 1, 1, 1, 1] };
}

/* ------------------------------------------------------------------ */
/* 6) Galaxy: a tilted spiral of stars that spins with the bass         */
/* ------------------------------------------------------------------ */

export interface GalaxyState extends Seeded {
  r: number[];
  a: number[];
  size: number[];
}

export function initGalaxy(quality: 0 | 1, seed = 29): GalaxyState {
  'worklet';
  const s: GalaxyState = { seed, r: [], a: [], size: [] };
  const n = quality ? 3800 : 420;
  for (let k = 0; k < n; k++) {
    const r = Math.pow(rnd(s), 0.75);
    const spread = (rnd(s) - 0.5) * (0.9 - r * 0.5);
    s.r.push(r);
    s.a.push(((k % 3) * Math.PI * 2) / 3 + spread);
    s.size.push(quality ? 0.8 + rnd(s) * 1.7 : 1.3 + rnd(s) * 2);
  }
  return s;
}

export function stepGalaxy(s: GalaxyState, i: SceneInput): SceneOutput {
  'worklet';
  const { w, h, t, dt } = i;
  const cx = w / 2;
  const cy = h / 2;
  const tilt = 0.55;
  const rMax = Math.min(w * 0.47, (h * 0.47) / tilt);
  const spin = (0.05 + i.bass * 0.22 + i.kick * 0.3) * (i.reduced ? 0.3 : 1);
  const high = sampleLevel(i.levels, 0.8);
  const mid = sampleLevel(i.levels, 0.45);
  const expand = 1 + i.bass * 0.1 + i.kick * 0.08;
  let outer = '';
  let middle = '';
  let core = '';
  for (let k = 0; k < s.r.length; k++) {
    const r = s.r[k]!;
    const a = s.a[k]! + (spin * dt) / (0.25 + r);
    s.a[k] = a;
    const th = a + r * 3.4;
    const R = r * rMax * expand;
    const tw = 0.5 + 0.5 * Math.sin(t * 5 + k * 1.7);
    const size = s.size[k]! * (1 + high * 1.6 * tw + (r < 0.3 ? mid * 0.6 : 0));
    const sq = rect(cx + Math.cos(th) * R - size / 2, cy + Math.sin(th) * R * tilt - size / 2, size, size);
    if (r < 0.22) core += sq;
    else if (r < 0.55) middle += sq;
    else outer += sq;
  }
  return { paths: [outer, middle, core], alphas: [1, 1, 1] };
}

/* ------------------------------------------------------------------ */
/* registry                                                            */
/* ------------------------------------------------------------------ */

export type PathSceneState = BarsState | MirrorState | ScopeState | TerrainState | TunnelState | GalaxyState;

export const PATH_SCENES: Record<PathSceneId, PathSceneInfo> = {
  bars: {
    trails: 0,
    trailZoom: 1,
    slots: () => [
      { path: 2, mode: 'fill', paint: 'gradV', alpha: 0.16 },
      { path: 0, mode: 'stroke', paint: 'gradV', width: 6, alpha: 0.1, boost: 1.5, add: true },
      { path: 0, mode: 'fill', paint: 'gradV', alpha: 0.95 },
      { path: 1, mode: 'fill', paint: 'white', alpha: 0.9 },
    ],
  },
  mirror: {
    trails: 0,
    trailZoom: 1,
    slots: () => [
      { path: 1, mode: 'fill', paint: 'gradV', alpha: 0.28 },
      { path: 0, mode: 'stroke', paint: 'gradV', width: 5, alpha: 0.1, boost: 1.5, add: true },
      { path: 0, mode: 'fill', paint: 'gradV', alpha: 0.95 },
      { path: 2, mode: 'stroke', paint: 'white', width: 1, alpha: 0.35 },
    ],
  },
  scope: {
    trails: 0,
    trailZoom: 1,
    slots: () => [
      { path: 0, mode: 'stroke', paint: 'white', width: 1, alpha: 0.07 },
      { path: 3, mode: 'stroke', paint: 'c1', width: 1.5, alpha: 0.1 },
      { path: 2, mode: 'stroke', paint: 'c1', width: 1.5, alpha: 0.18 },
      { path: 1, mode: 'stroke', paint: 'c1', width: 1.5, alpha: 0.28 },
      { path: 4, mode: 'stroke', paint: 'c1', width: 10, alpha: 0.1, boost: 1, add: true },
      { path: 4, mode: 'stroke', paint: 'c1', width: 4, alpha: 0.28, boost: 0.6, add: true },
      { path: 4, mode: 'stroke', paint: 'core', width: 1.8, alpha: 1 },
    ],
  },
  terrain: {
    trails: 0,
    trailZoom: 1,
    slots: (q) => {
      const R = q ? 34 : 18;
      const out: SceneSlot[] = [];
      for (let k = 0; k < R; k++) out.push({ path: k, mode: 'both', paint: 'gradH', width: q ? 1.3 : 1.2, alpha: 1 });
      out.push({ path: R, mode: 'both', paint: 'gradH', width: 2, alpha: 1, boost: 0.3 });
      return out;
    },
  },
  tunnel: {
    trails: 0.5,
    trailZoom: 1.025,
    slots: () => [
      { path: 0, mode: 'stroke', paint: 'white', width: 1, alpha: 0.45 },
      { path: 1, mode: 'stroke', paint: 'c1', width: 1.2, alpha: 0.28 },
      { path: 2, mode: 'stroke', paint: 'c2', width: 1.2, alpha: 0.28 },
      { path: 3, mode: 'stroke', paint: 'c1', width: 1.6, alpha: 0.6 },
      { path: 4, mode: 'stroke', paint: 'c2', width: 1.6, alpha: 0.6 },
      { path: 5, mode: 'stroke', paint: 'c1', width: 9, alpha: 0.1, boost: 1.2, add: true },
      { path: 6, mode: 'stroke', paint: 'c2', width: 9, alpha: 0.1, boost: 1.2, add: true },
      { path: 5, mode: 'stroke', paint: 'c1', width: 2.4, alpha: 0.95 },
      { path: 6, mode: 'stroke', paint: 'c2', width: 2.4, alpha: 0.95 },
    ],
  },
  galaxy: {
    trails: 0.55,
    trailZoom: 1,
    slots: () => [
      { path: 0, mode: 'fill', paint: 'c1', alpha: 0.8, boost: 0.3, add: true },
      { path: 1, mode: 'fill', paint: 'c2', alpha: 0.85, boost: 0.3, add: true },
      { path: 2, mode: 'fill', paint: 'white', alpha: 0.85, boost: 0.2, add: true },
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
