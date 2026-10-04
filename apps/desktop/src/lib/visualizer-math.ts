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
