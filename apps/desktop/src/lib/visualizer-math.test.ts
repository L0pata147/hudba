import { describe, expect, it } from 'vitest';
import { bandLevels, bassLevel, logBands, neonColor, smoothInto } from './visualizer-math';

describe('visualizer math', () => {
  it('splits the spectrum into increasing, non-overlapping log bands', () => {
    const bands = logBands(2048, 44100, 64);
    expect(bands).toHaveLength(64);
    for (let i = 0; i < bands.length; i++) {
      const [a, b] = bands[i]!;
      expect(b).toBeGreaterThan(a);
      if (i) expect(a).toBe(bands[i - 1]![1]);
    }
    // Log spacing: low bands are narrow, high bands wide.
    expect(bands[0]![1] - bands[0]![0]).toBeLessThan(bands[63]![1] - bands[63]![0]);
    expect(bands[63]![1]).toBeLessThanOrEqual(1023);
  });

  it('maps a tone to the band containing it and reports bass', () => {
    const fft = 2048;
    const rate = 44100;
    const freq = new Uint8Array(fft / 2);
    const bin60 = Math.round(60 / (rate / fft));
    freq[bin60] = 255;
    const bands = logBands(fft, rate, 64);
    const levels = bandLevels(freq, bands);
    const hit = bands.findIndex(([a, b]) => bin60 >= a && bin60 < b);
    expect(levels[hit]).toBeGreaterThan(0.5);
    expect(Math.max(...Array.from(levels).filter((_, i) => i !== hit))).toBe(0);
    expect(bassLevel(freq, fft, rate)).toBeGreaterThan(0);
    expect(bassLevel(new Uint8Array(fft / 2), fft, rate)).toBe(0);
  });

  it('attacks fast and releases slowly', () => {
    const s = new Float32Array([0, 1]);
    smoothInto(s, new Float32Array([1, 0]));
    expect(s[0]).toBeGreaterThan(0.5);
    expect(s[1]).toBeGreaterThan(0.8);
  });

  it('uses white for grey artwork and a vivid neon otherwise', () => {
    expect(neonColor({ r: 60, g: 60, b: 62 })).toEqual({ r: 245, g: 245, b: 250 });
    const n = neonColor({ r: 40, g: 80, b: 40 });
    expect(n.g).toBeGreaterThan(n.r + 100);
  });
});
