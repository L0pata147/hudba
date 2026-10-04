import { describe, expect, it } from 'vitest';
import { createAnalyser } from './analyser';
import { BANDS, LAYERS, bandAt, createRingState, stepRing } from './ring';

const RATE = 44100;
/** What Android's Visualizer delivers: 1024 frames quantised to 8 bit, mapped to −1…1. */
const android = (fn: (i: number) => number) => Array.from({ length: 1024 }, (_, i) => Math.round(Math.max(-1, Math.min(1, fn(i))) * 128) / 128);
const sine = (hz: number, amp: number) => (i: number) => amp * Math.sin((2 * Math.PI * hz * i) / RATE);

describe('mobile analyser', () => {
  it('silence and 8-bit noise keep the ring calm', () => {
    const analyse = createAnalyser(() => 0);
    expect(Math.max(...analyse(android(() => 0)).levels)).toBe(0);
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * (2 / 128);
    expect(Math.max(...analyse(android(noise)).levels)).toBeLessThan(0.15);
  });

  it('a tone lights its band; bass and kicks are picked up', () => {
    let time = 0;
    const analyse = createAnalyser(() => time);
    const a = analyse(android(sine(2000, 0.6)));
    const top = a.levels.indexOf(Math.max(...a.levels));
    expect(a.levels[top]!).toBeGreaterThan(0.5);
    expect(top).toBeGreaterThan(BANDS / 2);
    expect(analyse(android(sine(70, 0.8))).bass).toBeGreaterThan(0.5);
    let beats = 0;
    for (let f = 0; f < 60; f++) {
      time = f * 0.1;
      const kick = f % 5 === 4;
      if (analyse(android(sine(70, kick ? 0.9 : 0.03))).beat) beats++;
    }
    expect(beats).toBeGreaterThanOrEqual(6);
  });
});

describe('mobile ring', () => {
  it('mirrors bands with lows at the top and bottom', () => {
    const total = BANDS * 2;
    expect(bandAt(0, total)).toBe(0);
    expect(bandAt(total / 2 - 1, total)).toBe(0);
    expect(bandAt(Math.round(total / 4), total)).toBeGreaterThan(BANDS * 0.9);
    expect(bandAt(3, total)).toBe(bandAt(total - 1 - 3, total));
  });

  it('reacts to audio, kicks on beats and settles when the data stops', () => {
    const s = createRingState();
    const loud = new Array<number>(BANDS).fill(0.8);
    let f = stepRing(s, { target: loud, targetBass: 0.7, fresh: 1, beat: 0, reduced: false }, 1 / 60, 400, 400);
    expect(f.layers).toHaveLength(LAYERS);
    expect(f.layers[0]).toMatch(/^M[\d.]+ [\d.]+(Q[\d. -]+)+Z$/);
    for (let i = 0; i < 30; i++) f = stepRing(s, { target: loud, targetBass: 0.7, fresh: 1, beat: 0, reduced: false }, 1 / 60, 400, 400);
    const busy = Math.max(...s.levels);
    expect(busy).toBeGreaterThan(0.7);
    expect(f.echoes.filter(Boolean).length).toBeGreaterThan(0);
    expect(f.particles.join('')).toContain('h');
    f = stepRing(s, { target: loud, targetBass: 0.7, fresh: 1, beat: 1, reduced: false }, 1 / 60, 400, 400);
    expect(f.kick).toBeGreaterThan(0.8);
    expect(f.pulse).toBeGreaterThan(1.08);
    for (let i = 0; i < 120; i++) f = stepRing(s, { target: loud, targetBass: 0.7, fresh: 0, beat: 1, reduced: false }, 1 / 60, 400, 400);
    expect(Math.max(...s.levels)).toBeLessThan(0.01);
    expect(f.kick).toBeLessThan(0.01);
  });

  it('reduced motion: no kick, shake, echoes or particles', () => {
    const s = createRingState();
    const f = stepRing(s, { target: new Array<number>(BANDS).fill(1), targetBass: 1, fresh: 1, beat: 5, reduced: true }, 1 / 60, 300, 300);
    expect(f.kick).toBe(0);
    expect(f.shakeX).toBe(0);
    expect(f.pulse).toBe(1);
    expect(f.echoes.every((e) => e === '')).toBe(true);
    expect(f.particles).toEqual(['', '']);
  });
});

describe('mobile waveform', () => {
  it('aligns snapshots at a rising zero crossing so the scope trace stands still', async () => {
    const { alignedWave } = await import('./analyser');
    const a = alignedWave(android(sine(440, 0.5)).slice(37));
    const b = alignedWave(android(sine(440, 0.5)).slice(91));
    expect(a).toHaveLength(256);
    expect(Math.abs(a[0]!)).toBeLessThan(0.1); // starts at the zero crossing (amplitude 0.5)
    const diff = a.slice(0, 120).reduce((m, v, i) => Math.max(m, Math.abs(v - b[i]!)), 0);
    expect(diff).toBeLessThan(0.08);
  });

  it('the shared step eases the waveform and drops it when data stops', async () => {
    const { stepCommon, WAVE_POINTS } = await import('./ring');
    const s = createRingState();
    const tw = new Array<number>(WAVE_POINTS).fill(0.5);
    for (let i = 0; i < 30; i++) stepCommon(s, { target: [], targetBass: 0, fresh: 1, beat: 0, reduced: false, targetWave: tw }, 1 / 60);
    expect(s.wave[10]!).toBeGreaterThan(0.45);
    for (let i = 0; i < 60; i++) stepCommon(s, { target: [], targetBass: 0, fresh: 0, beat: 0, reduced: false, targetWave: tw }, 1 / 60);
    expect(Math.abs(s.wave[10]!)).toBeLessThan(0.01);
  });
});
