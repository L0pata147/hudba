import { BeatDetector, bandLevels, bassLevel, byteSpectrum, logBands } from '@sonora/core';
import { BANDS, WAVE_POINTS } from './ring';

/** Android mixes at 44.1/48 kHz; the exact rate only shifts the bands slightly. */
const RATE = 44100;
/**
 * Android's Visualizer delivers 8-bit samples whose quantisation noise sits
 * around −80 dB, so the spectrum starts just above it (desktop uses −100 dB).
 */
const MIN_DB = -82;
const MAX_DB = -30;
/** Residual floor after the band tilt; below it the ring stays calm. */
const FLOOR = 0.08;

export interface Analysis {
  levels: number[];
  bass: number;
  beat: boolean;
  /** WAVE_POINTS samples starting at a rising zero crossing, so consecutive snapshots line up. */
  wave: number[];
}

/** Trigger-aligned, downsampled copy of the frames (like an oscilloscope's trigger). */
export function alignedWave(frames: ArrayLike<number>, points = WAVE_POINTS): number[] {
  const n = frames.length;
  const out: number[] = [];
  if (n < 4) {
    for (let i = 0; i < points; i++) out.push(0);
    return out;
  }
  let start = 0;
  for (let k = 1; k < n / 4; k++) {
    if ((frames[k - 1] ?? 0) < 0 && (frames[k] ?? 0) >= 0) {
      start = k;
      break;
    }
  }
  // A fixed time window (768 samples ≈ 17 ms), independent of the buffer length.
  const span = Math.min(n - start, 768);
  // Average each step (a gentle low-pass) — the 8-bit Android signal is grainy.
  for (let i = 0; i < points; i++) {
    const a = start + Math.floor((i / points) * span);
    const b = Math.max(a + 1, start + Math.floor(((i + 1) / points) * span));
    let sum = 0;
    for (let k = a; k < b; k++) sum += frames[k] ?? 0;
    out.push(sum / (b - a));
  }
  return out;
}

/**
 * Turns raw PCM frames from expo-audio into ring levels, bass and beats
 * (the same maths the desktop app runs on its AnalyserNode output).
 */
export function createAnalyser(now: () => number = () => Date.now() / 1000) {
  let size = 0;
  let freq: Uint8Array = new Uint8Array(0);
  let bands: [number, number][] = [];
  let low: [number, number] = [1, 2];
  const raw = new Float32Array(BANDS);
  // Samples arrive ~10×/s (desktop: 60×/s), so the history window is counted in fewer frames (~2 s).
  const beats = new BeatDetector({ window: 20, sensitivity: 1.0, minGap: 0.24, minFlux: 0.02 });
  return (frames: ArrayLike<number>): Analysis => {
    freq = byteSpectrum(frames, freq, MIN_DB, MAX_DB);
    if (freq.length * 2 !== size) {
      size = freq.length * 2;
      bands = logBands(size, RATE, BANDS);
      const binHz = RATE / size;
      low = [Math.max(1, Math.floor(30 / binHz)), Math.max(2, Math.ceil(180 / binHz))];
    }
    if (size < 64) return { levels: Array.from(raw.fill(0)), bass: 0, beat: false, wave: alignedWave([]) };
    bandLevels(freq, bands, raw);
    const levels: number[] = [];
    for (let i = 0; i < BANDS; i++) levels.push(Math.max(0, (raw[i]! - FLOOR) / (1 - FLOOR)));
    const bass = Math.max(0, (bassLevel(freq, size, RATE) - FLOOR) / (1 - FLOOR));
    return { levels, bass, beat: beats.update(freq, low[0], low[1], now()), wave: alignedWave(frames) };
  };
}
