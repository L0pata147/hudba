/**
 * Geometry for the mobile visualizer. Everything here runs as Reanimated
 * worklets on the UI thread (and in plain JS for tests/previews).
 */

export const BANDS = 48; // per half circle; mirrored → 96 points
export const LAYERS = 4;
export const ECHOES = 3;
export const PARTICLES = 44;
/** Frames between the ring snapshots used for the afterimage echoes. */
export const ECHO_STEP = 4;

export interface Particle {
  a: number;
  r: number;
  v: number;
  size: number;
}

export interface RingState {
  t: number;
  levels: number[];
  bass: number;
  kick: number;
  lastBeat: number;
  /** Past `levels` snapshots (newest first) for the echoes. */
  history: number[][];
  frame: number;
  particles: Particle[];
  seed: number;
}

export interface RingFrame {
  layers: string[];
  echoes: string[];
  particles: [string, string];
  pulse: number;
  kick: number;
  bass: number;
  shakeX: number;
  shakeY: number;
}

/** Deterministic PRNG so the worklet needs no Math.random state across threads. */
export function rand(s: RingState): number {
  'worklet';
  s.seed = (s.seed * 1664525 + 1013904223) % 4294967296;
  return s.seed / 4294967296;
}

export function spawn(s: RingState, anywhere: boolean): Particle {
  'worklet';
  return {
    a: rand(s) * Math.PI * 2,
    r: anywhere ? 0.3 + rand(s) * 1.4 : 0.85 + rand(s) * 0.2,
    v: 0.0015 + rand(s) * 0.0035,
    size: 1.6 + rand(s) * 2.2,
  };
}

export function createRingState(seed = 7): RingState {
  'worklet';
  const s: RingState = { t: 0, levels: [], bass: 0, kick: 0, lastBeat: 0, history: [], frame: 0, particles: [], seed };
  for (let i = 0; i < BANDS; i++) s.levels.push(0);
  for (let i = 0; i < PARTICLES; i++) s.particles.push(spawn(s, true));
  return s;
}

/** Lows at the top and bottom, highs on the sides (same mapping as the desktop ring). */
export function bandAt(i: number, total: number): number {
  'worklet';
  const half = i < total / 2 ? i : total - 1 - i;
  const p = half / (total / 2 - 1);
  return Math.round((1 - Math.abs(Math.cos(Math.PI * p))) * (BANDS - 1));
}

function n1(x: number): number {
  'worklet';
  return Math.round(x * 10) / 10;
}

/** Closed, smooth path through the ring points (quadratic curves through midpoints). */
export function ringPath(levels: number[], cx: number, cy: number, R: number, amp: number, layer: number, t: number, base: number, scale: number): string {
  'worklet';
  const total = BANDS * 2;
  const k = layer / LAYERS;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < total; i++) {
    const v = (levels[bandAt(i, total)] ?? 0) * (1 - k * 0.35);
    const wobble = Math.sin(i * 0.35 + t * (1.2 + layer * 0.7) + layer) * base * 0.012 * (layer + 1);
    const r = (R + v * amp + wobble + layer * 1.6) * scale;
    const a = (i / total) * Math.PI * 2 - Math.PI / 2;
    xs.push(cx + Math.cos(a) * r);
    ys.push(cy + Math.sin(a) * r);
  }
  let d = `M${n1((xs[total - 1]! + xs[0]!) / 2)} ${n1((ys[total - 1]! + ys[0]!) / 2)}`;
  for (let i = 0; i < total; i++) {
    const j = (i + 1) % total;
    d += `Q${n1(xs[i]!)} ${n1(ys[i]!)} ${n1((xs[i]! + xs[j]!) / 2)} ${n1((ys[i]! + ys[j]!) / 2)}`;
  }
  return `${d}Z`;
}

export interface StepInput {
  /** Latest analysed levels 0…1 (BANDS long). */
  target: number[];
  targetBass: number;
  /** >0 while fresh audio data arrives; when it runs out the ring settles. */
  fresh: number;
  /** Incremented by the analyser on every detected beat. */
  beat: number;
  reduced: boolean;
}

/** Advances the animation by `dt` seconds and returns the paths for one frame. */
export function stepRing(s: RingState, input: StepInput, dt: number, width: number, height: number): RingFrame {
  'worklet';
  const step = Math.min(0.05, Math.max(0.001, dt));
  s.t += step;
  s.frame++;
  const live = input.fresh > 0;
  // Data arrives ~10–20×/s on Android, so the ring eases towards it frame by frame.
  const attack = 1 - Math.exp(-step / 0.045);
  const release = 1 - Math.exp(-step / 0.16);
  for (let i = 0; i < BANDS; i++) {
    const target = live ? (input.target[i] ?? 0) : 0;
    const cur = s.levels[i]!;
    s.levels[i] = cur + (target - cur) * (target > cur ? attack : release);
  }
  const tb = live ? input.targetBass : 0;
  s.bass += (tb - s.bass) * (tb > s.bass ? attack : release * 0.6);
  if (input.beat !== s.lastBeat) {
    s.lastBeat = input.beat;
    if (!input.reduced && live) s.kick = 1;
  }
  s.kick *= Math.exp(-step / 0.12);
  if (s.frame % ECHO_STEP === 0) {
    s.history.unshift(s.levels.slice());
    if (s.history.length > ECHOES) s.history.pop();
  }

  const cx = width / 2;
  const cy = height / 2;
  const base = Math.min(width, height) * 0.27;
  const pulse = input.reduced ? 1 : 1 + s.bass * 0.06 + s.kick * 0.07;
  const R = base * pulse;
  const amp = base * (input.reduced ? 0.35 : 0.6);
  const shakeX = input.reduced ? 0 : (rand(s) - 0.5) * s.kick * 8;
  const shakeY = input.reduced ? 0 : (rand(s) - 0.5) * s.kick * 8;

  const layers: string[] = [];
  for (let l = 0; l < LAYERS; l++) layers.push(ringPath(s.levels, cx, cy, R, amp, l, s.t, base, 1));
  // Afterimage: older snapshots of the ring drawn slightly larger and fainter.
  const echoes: string[] = [];
  for (let e = 0; e < ECHOES; e++) {
    const h = s.history[e];
    echoes.push(h && !input.reduced ? ringPath(h, cx, cy, R, amp, 0, s.t - (e + 1) * 0.07, base, 1 + (e + 1) * (0.045 + s.kick * 0.02)) : '');
  }

  let p0 = '';
  let p1 = '';
  if (!input.reduced) {
    const maxR = Math.hypot(cx, cy) / base;
    const speed = 1 + s.bass * 3 + s.kick * 6;
    for (let i = 0; i < s.particles.length; i++) {
      let p = s.particles[i]!;
      p.r += p.v * speed * step * 60;
      if (p.r > maxR) {
        p = spawn(s, false);
        s.particles[i] = p;
      }
      const fade = Math.min(1, (p.r - 0.8) * 2) * (1 - p.r / maxR);
      if (fade <= 0.05) continue;
      const pr = p.r * base;
      const size = p.size * fade * (1 + s.kick * 0.6);
      const x = cx + Math.cos(p.a) * pr - size / 2;
      const y = cy + Math.sin(p.a) * pr - size / 2;
      const sq = `M${n1(x)} ${n1(y)}h${n1(size)}v${n1(size)}h${n1(-size)}Z`;
      if (i % 2) p1 += sq;
      else p0 += sq;
    }
  }
  return { layers, echoes, particles: [p0, p1], pulse, kick: s.kick, bass: s.bass, shakeX, shakeY };
}
