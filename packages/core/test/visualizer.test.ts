import { describe, expect, it } from 'vitest';
import { BeatDetector, bassLevel, byteSpectrum, logBands } from '../src/visualizer';

const RATE = 44100;
const tone = (hz: number, n: number, amp = 0.5) => Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));

describe('byteSpectrum', () => {
  it('puts a sine at its frequency bin', () => {
    const spec = byteSpectrum(tone(3000, 1024));
    expect(spec).toHaveLength(512);
    const peak = spec.indexOf(Math.max(...spec));
    expect(Math.abs(peak - Math.round(3000 / (RATE / 1024)))).toBeLessThanOrEqual(1);
    // Far from the tone the spectrum is (near) silent.
    expect(spec[400]!).toBeLessThan(40);
  });

  it('silence is zero and uses the largest power-of-two prefix', () => {
    expect(Math.max(...byteSpectrum(new Array(1000).fill(0)))).toBe(0);
    expect(byteSpectrum(new Array(1000).fill(0))).toHaveLength(256);
  });

  it('louder input gives higher values; feeds bass/beat helpers like an AnalyserNode would', () => {
    const quiet = byteSpectrum(tone(80, 1024, 0.05));
    const loud = byteSpectrum(tone(80, 1024, 0.8));
    expect(bassLevel(loud, 1024, RATE)).toBeGreaterThan(bassLevel(quiet, 1024, RATE));
    const det = new BeatDetector();
    const [a, b] = [1, 5];
    let beats = 0;
    for (let f = 0; f < 40; f++) {
      const kick = f % 10 === 9;
      if (det.update(byteSpectrum(tone(80, 1024, kick ? 0.8 : 0.02)), a, b, f * 0.1)) beats++;
    }
    expect(beats).toBeGreaterThanOrEqual(2);
    expect(logBands(1024, RATE, 48)).toHaveLength(48);
  });
});
