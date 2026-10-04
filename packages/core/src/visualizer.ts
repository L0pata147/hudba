/**
 * Platform-independent spectrum helpers for the visualizers (desktop reads
 * bytes from a Web Audio AnalyserNode, mobile computes them with `byteSpectrum`).
 */

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
    if (!this.prev || this.prev.length !== n) {
      // First frame: nothing to compare with (a jump from zeros would look like a huge onset).
      this.prev = new Float32Array(n);
      for (let k = 0; k < n; k++) this.prev[k] = (freq[a + k] ?? 0) / 255;
      return false;
    }
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
 * Byte spectrum like `AnalyserNode.getByteFrequencyData` from raw PCM frames
 * (−1…1): Blackman window, radix-2 FFT, magnitude in dB mapped from
 * [minDb, maxDb] to 0…255. Uses the largest power-of-two prefix of `frames`.
 */
export function byteSpectrum(frames: ArrayLike<number>, out?: Uint8Array, minDb = -100, maxDb = -30): Uint8Array {
  let n = 1;
  while (n * 2 <= frames.length) n *= 2;
  const half = n / 2;
  const res = out && out.length === half ? out : new Uint8Array(half);
  if (n < 2) return res.fill(0);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
    re[i] = (frames[i] ?? 0) * w;
  }
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  const range = maxDb - minDb;
  for (let k = 0; k < half; k++) {
    const mag = Math.hypot(re[k]!, im[k]!) / n;
    const db = mag > 0 ? 20 * Math.log10(mag) : -Infinity;
    res[k] = Math.max(0, Math.min(255, Math.round(((db - minDb) / range) * 255)));
  }
  return res;
}
