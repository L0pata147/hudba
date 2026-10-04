/**
 * Pure helpers for the spectrum visualizer (kept separate so they are unit-tested).
 */
import { rgbToHsl, hslToRgb, type RGB } from '@sonora/ui';

/** Bin ranges for `count` log-spaced bands between fMin and fMax. */
export function logBands(fftSize: number, sampleRate: number, count: number, fMin = 35, fMax = 14000): [number, number][] {
  const binHz = sampleRate / fftSize;
  const maxBin = fftSize / 2 - 1;
  const out: [number, number][] = [];
  let prevEnd = Math.max(1, Math.floor(fMin / binHz));
  for (let i = 0; i < count; i++) {
    const hi = fMin * (fMax / fMin) ** ((i + 1) / count);
    const end = Math.min(maxBin, Math.max(prevEnd + 1, Math.round(hi / binHz)));
    out.push([prevEnd, end]);
    prevEnd = end;
  }
  return out;
}

/**
 * Band levels 0…1 from byte frequency data. High bands carry less energy in
 * real music, so they get a gentle tilt to keep the ring evenly alive.
 */
export function bandLevels(freq: Uint8Array, bands: [number, number][], out = new Float32Array(bands.length)): Float32Array {
  const n = bands.length;
  for (let i = 0; i < n; i++) {
    const [a, b] = bands[i]!;
    let peak = 0;
    let sum = 0;
    for (let k = a; k < b; k++) {
      const v = freq[k] ?? 0;
      sum += v;
      if (v > peak) peak = v;
    }
    const avg = sum / Math.max(1, b - a);
    const v = ((peak * 0.6 + avg * 0.4) / 255) * (1 + 0.55 * (i / n));
    out[i] = Math.min(1, v);
  }
  return out;
}

/** Bass energy 0…1 (≈30–150 Hz), drives the "pulse". */
export function bassLevel(freq: Uint8Array, fftSize: number, sampleRate: number): number {
  const binHz = sampleRate / fftSize;
  const a = Math.max(1, Math.floor(30 / binHz));
  const b = Math.max(a + 1, Math.ceil(150 / binHz));
  let sum = 0;
  for (let k = a; k < b; k++) sum += freq[k] ?? 0;
  return sum / ((b - a) * 255);
}

/** Fast attack, slow release — punchy but not jittery. */
export function smoothInto(state: Float32Array, next: Float32Array, attack = 0.65, release = 0.12): Float32Array {
  for (let i = 0; i < state.length; i++) {
    const s = state[i]!;
    const n = next[i] ?? 0;
    state[i] = s + (n - s) * (n > s ? attack : release);
  }
  return state;
}

/** Neon ring colour from the artwork colour; grey artwork gives white like the classic look. */
export function neonColor(c: RGB): RGB {
  const { h, s } = rgbToHsl(c);
  if (s < 0.12) return { r: 245, g: 245, b: 250 };
  return hslToRgb(h, 0.95, 0.6);
}

/**
 * Onset ("beat") detector: positive spectral flux in the low bins compared
 * with its recent average. Fires on kicks/drops, not on a sustained bass note.
 */
export class BeatDetector {
  private prev: Float32Array | null = null;
  private history: number[] = [];
  private lastBeat = -Infinity;

  constructor(
    private readonly opts = { window: 45, sensitivity: 1.5, minGap: 0.24, minFlux: 0.02 },
  ) {}

  /** `a..b` = bin range to watch (≈ 30–180 Hz); `time` in seconds. */
  update(freq: Uint8Array, a: number, b: number, time: number): boolean {
    const n = Math.max(1, b - a);
    if (!this.prev || this.prev.length !== n) this.prev = new Float32Array(n);
    let flux = 0;
    for (let k = 0; k < n; k++) {
      const v = (freq[a + k] ?? 0) / 255;
      const d = v - this.prev[k]!;
      if (d > 0) flux += d;
      this.prev[k] = v;
    }
    flux /= n;
    const h = this.history;
    let beat = false;
    if (h.length >= 10) {
      const mean = h.reduce((s, x) => s + x, 0) / h.length;
      const std = Math.sqrt(h.reduce((s, x) => s + (x - mean) ** 2, 0) / h.length);
      beat = flux > mean + this.opts.sensitivity * std && flux > this.opts.minFlux && time - this.lastBeat > this.opts.minGap;
    }
    h.push(flux);
    if (h.length > this.opts.window) h.shift();
    if (beat) this.lastBeat = time;
    return beat;
  }
}

/**
 * Two neon colours from artwork pixels (RGBA): the strongest hue and a second,
 * clearly different one. Grey artwork gives white + icy blue.
 */
export function paletteFromPixels(data: Uint8ClampedArray | Uint8Array): [RGB, RGB] {
  const BINS = 24;
  const weights = new Float64Array(BINS);
  let satTotal = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const c = { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
    const { h, s, l } = rgbToHsl(c);
    count++;
    satTotal += s;
    if (l < 0.12 || l > 0.92) continue;
    weights[Math.floor((h / 360) * BINS) % BINS]! += s * s;
  }
  if (!count || satTotal / count < 0.1) return [{ r: 245, g: 245, b: 250 }, { r: 150, g: 200, b: 255 }];
  let first = 0;
  for (let i = 1; i < BINS; i++) if (weights[i]! > weights[first]!) first = i;
  let second = -1;
  for (let i = 0; i < BINS; i++) {
    const dist = Math.min(Math.abs(i - first), BINS - Math.abs(i - first));
    if (dist < 3) continue;
    if (weights[i]! >= weights[first]! * 0.2 && (second < 0 || weights[i]! > weights[second]!)) second = i;
  }
  const hue = (bin: number) => ((bin + 0.5) / BINS) * 360;
  const h1 = hue(first);
  const h2 = second >= 0 ? hue(second) : h1 + 45;
  return [hslToRgb(h1, 0.95, 0.6), hslToRgb(h2, 0.95, 0.62)];
}
