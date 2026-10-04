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

import { BeatDetector, paletteFromPixels } from './visualizer-math';

describe('beat detection', () => {
  const frame = (level: number) => new Uint8Array(32).fill(level);
  it('fires on a kick after a steady passage, not on sustained bass', () => {
    const d = new BeatDetector();
    let t = 0;
    const beats: boolean[] = [];
    for (let i = 0; i < 30; i++) beats.push(d.update(frame(120 + (i % 2) * 2), 0, 32, (t += 1 / 60)));
    expect(beats.some(Boolean)).toBe(false); // steady bass: no beats
    expect(d.update(frame(250), 0, 32, (t += 1 / 60))).toBe(true); // kick
    expect(d.update(frame(255), 0, 32, (t += 1 / 60))).toBe(false); // within min gap
  });

  it('detects a regular kick pattern', () => {
    const d = new BeatDetector();
    let hits = 0;
    for (let i = 0; i < 240; i++) {
      const kick = i % 30 === 0; // 120 BPM at 60 fps
      if (d.update(frame(kick ? 240 : 60 + (i % 3)), 0, 32, i / 60)) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(6);
    expect(hits).toBeLessThanOrEqual(8);
  });
});

describe('palette', () => {
  const pixels = (colors: [number, number, number][], each = 100) => {
    const out = new Uint8ClampedArray(colors.length * each * 4);
    colors.forEach(([r, g, b], ci) => {
      for (let i = 0; i < each; i++) out.set([r, g, b, 255], (ci * each + i) * 4);
    });
    return out;
  };
  it('picks two distinct hues from colourful artwork', () => {
    const pal = paletteFromPixels(pixels([[220, 30, 200], [30, 90, 230]]));
    expect(pal.some((c) => c.r > 150 && c.b > 150 && c.g < 120)).toBe(true); // magenta
    expect(pal.some((c) => c.b > 200 && c.r < 120)).toBe(true); // blue
  });
  it('falls back to white for grey artwork', () => {
    expect(paletteFromPixels(pixels([[90, 90, 90], [200, 200, 205]]))[0]).toEqual({ r: 245, g: 245, b: 250 });
  });
});
