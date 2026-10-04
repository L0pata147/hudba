import { BeatDetector, bandLevels, bassLevel, byteSpectrum, logBands } from '@sonora/core';
import { BANDS } from './ring';

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
    if (size < 64) return { levels: Array.from(raw.fill(0)), bass: 0, beat: false };
    bandLevels(freq, bands, raw);
    const levels: number[] = [];
    for (let i = 0; i < BANDS; i++) levels.push(Math.max(0, (raw[i]! - FLOOR) / (1 - FLOOR)));
    const bass = Math.max(0, (bassLevel(freq, size, RATE) - FLOOR) / (1 - FLOOR));
    return { levels, bass, beat: beats.update(freq, low[0], low[1], now()) };
  };
}
